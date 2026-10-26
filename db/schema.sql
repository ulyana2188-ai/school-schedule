-- Schema for Интеллект-плюс schedule app
-- Run: psql $DATABASE_URL -f db/schema.sql
-- Or run via npm run migrate

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('head','teacher')),
  title         TEXT,  -- "Директор", "Руководитель отделения", "Администратор отделения", "Учитель", "Координатор" etc.
  dept          TEXT,
  depts         TEXT[] DEFAULT '{}',
  subjects      TEXT[] DEFAULT '{}',
  password_hash TEXT NOT NULL,
  must_change   BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Add title column if it doesn't exist (for upgrades from older schema)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='title') THEN
    ALTER TABLE users ADD COLUMN title TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

CREATE TABLE IF NOT EXISTS replacements (
  id                  SERIAL PRIMARY KEY,
  day                 TEXT NOT NULL,
  time                TEXT,
  dept                TEXT NOT NULL,
  cls                 TEXT,
  lesson_no           INT,
  lesson_key          TEXT,
  absent_user_id      INT REFERENCES users(id),
  replacement_user_id INT REFERENCES users(id),
  subject             TEXT,
  room                TEXT,
  created_by          INT REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repl_day ON replacements(day);
CREATE INDEX IF NOT EXISTS idx_repl_absent ON replacements(absent_user_id);
CREATE INDEX IF NOT EXISTS idx_repl_replacement ON replacements(replacement_user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id             SERIAL PRIMARY KEY,
  to_user_id     INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  replacement_id INT REFERENCES replacements(id) ON DELETE CASCADE,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(to_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

-- Schedule edits (overrides on top of static schedule.json).
-- If subject/teacher/room are NULL, that cell is "cleared" (no lesson).
-- If groups is set, the cell has multiple group entries (overrides simple subject/teacher).
CREATE TABLE IF NOT EXISTS schedule_edits (
  id          SERIAL PRIMARY KEY,
  dept        TEXT NOT NULL,
  day         TEXT NOT NULL,
  lesson_key  TEXT NOT NULL,
  cls         TEXT NOT NULL,
  lesson_no   INT,
  time        TEXT,
  subject     TEXT,
  teacher     TEXT,
  room        TEXT,
  groups      JSONB,
  cleared     BOOLEAN DEFAULT FALSE,
  edited_by   INT REFERENCES users(id),
  edited_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(dept, day, lesson_key, cls)
);

CREATE INDEX IF NOT EXISTS idx_sched_edits_lookup ON schedule_edits(dept, day);

-- Absences: vacation, sick leave, personal days
CREATE TABLE IF NOT EXISTS user_absences (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('vacation','sick','personal','other')),
  note        TEXT,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_absences_user ON user_absences(user_id);
CREATE INDEX IF NOT EXISTS idx_absences_dates ON user_absences(start_date, end_date);

-- Academic support sessions (extra lessons by teacher initiative)
CREATE TABLE IF NOT EXISTS academic_support (
  id           SERIAL PRIMARY KEY,
  teacher_id   INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  dept         TEXT NOT NULL,
  date         DATE NOT NULL,
  start_time   TEXT,
  end_time     TEXT,
  subject      TEXT,
  cls          TEXT,
  room         TEXT,
  note         TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_acsup_dept ON academic_support(dept);
CREATE INDEX IF NOT EXISTS idx_acsup_date ON academic_support(date);
CREATE INDEX IF NOT EXISTS idx_acsup_teacher ON academic_support(teacher_id);

-- Schedule edit log (history)
CREATE TABLE IF NOT EXISTS schedule_edit_log (
  id           SERIAL PRIMARY KEY,
  dept         TEXT NOT NULL,
  day          TEXT NOT NULL,
  lesson_key   TEXT NOT NULL,
  cls          TEXT NOT NULL,
  action       TEXT NOT NULL,
  before_data  JSONB,
  after_data   JSONB,
  edited_by    INT REFERENCES users(id),
  edited_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schlog_dept_day ON schedule_edit_log(dept, day);
CREATE INDEX IF NOT EXISTS idx_schlog_when ON schedule_edit_log(edited_at DESC);

-- ============================================================
-- SCHEDULE GENERATOR TABLES
-- ============================================================

-- Кабинеты (аудитории) по каждому филиалу
CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  dept        TEXT NOT NULL,
  name        TEXT NOT NULL,          -- "каб. 5", "спортзал", "актовый зал"
  capacity    INT DEFAULT 30,
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(dept, name)
);
CREATE INDEX IF NOT EXISTS idx_rooms_dept ON rooms(dept);

-- Доступность учителей (лист ожиданий)
-- Каждая строка = один слот: учитель НЕ может работать в это время
-- (отсутствие записи = учитель доступен)
CREATE TABLE IF NOT EXISTS teacher_availability (
  id          SERIAL PRIMARY KEY,
  teacher_id  INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  dept        TEXT,                   -- NULL = ограничение действует во всех филиалах
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Понедельник','Вторник','Среда','Четверг','Пятница')),
  lesson_no   INT NOT NULL,           -- номер урока 0-9
  available   BOOLEAN DEFAULT FALSE,  -- FALSE = недоступен, TRUE = предпочтительно
  note        TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(teacher_id, dept, day_of_week, lesson_no)
);
CREATE INDEX IF NOT EXISTS idx_avail_teacher ON teacher_availability(teacher_id);
CREATE INDEX IF NOT EXISTS idx_avail_day ON teacher_availability(day_of_week);

-- Учебный план (количество часов предмета в неделю для класса)
CREATE TABLE IF NOT EXISTS curriculum (
  id          SERIAL PRIMARY KEY,
  dept        TEXT NOT NULL,
  grade       INT NOT NULL,           -- 1-11
  cls         TEXT NOT NULL,          -- "5", "6", "7а", "7б", "10ф", "11г" etc.
  subject     TEXT NOT NULL,
  hours_week  NUMERIC(4,1) NOT NULL,  -- может быть 1.5 (3 раза в 2 недели)
  subject_type TEXT DEFAULT 'main'    -- 'main', 'oge', 'ege', 'elective', 'support', 'selfprep', 'extracurr'
    CHECK (subject_type IN ('main','oge','ege','elective','support','selfprep','extracurr')),
  teacher_id  INT REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(dept, cls, subject)
);
CREATE INDEX IF NOT EXISTS idx_curriculum_dept ON curriculum(dept, cls);

-- Профильные группы (для 9, 10, 11 кл — ОГЭ/ЕГЭ группы)
CREATE TABLE IF NOT EXISTS profile_groups (
  id          SERIAL PRIMARY KEY,
  dept        TEXT NOT NULL,
  cls         TEXT NOT NULL,          -- "9", "10ф", "11г"
  group_name  TEXT NOT NULL,          -- "ОГЭ история", "Физмат А", "Гуманитарный"
  group_code  TEXT NOT NULL,          -- короткий код: "ист", "физ", "гум"
  subject     TEXT,                   -- предмет подготовки
  exam_type   TEXT CHECK (exam_type IN ('oge','ege')),
  student_list TEXT[],                -- список имён/ID учеников (опционально)
  teacher_id  INT REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pgroups_dept_cls ON profile_groups(dept, cls);

-- Версии расписаний (генератор создаёт черновики — можно сравнивать)
CREATE TABLE IF NOT EXISTS schedule_versions (
  id          SERIAL PRIMARY KEY,
  dept        TEXT NOT NULL,
  name        TEXT NOT NULL,          -- "Неделя 23.09.2026 v1"
  week_start  DATE,                   -- первый день недели
  status      TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_schedver_dept ON schedule_versions(dept, status);

-- Слоты сгенерированного расписания (привязаны к версии)
CREATE TABLE IF NOT EXISTS schedule_slots (
  id          SERIAL PRIMARY KEY,
  version_id  INT REFERENCES schedule_versions(id) ON DELETE CASCADE NOT NULL,
  dept        TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  lesson_no   INT NOT NULL,
  time_start  TEXT,
  time_end    TEXT,
  cls         TEXT NOT NULL,
  subject     TEXT NOT NULL,
  teacher_id  INT REFERENCES users(id) ON DELETE SET NULL,
  room_id     INT REFERENCES rooms(id) ON DELETE SET NULL,
  group_id    INT REFERENCES profile_groups(id) ON DELETE SET NULL,
  slot_type   TEXT DEFAULT 'main' CHECK (slot_type IN ('main','oge','ege','support','selfprep','walk','extracurr','start')),
  is_double   BOOLEAN DEFAULT FALSE,  -- спаренный урок
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slots_version ON schedule_slots(version_id, dept);
CREATE INDEX IF NOT EXISTS idx_slots_teacher ON schedule_slots(teacher_id, day_of_week, lesson_no);
CREATE INDEX IF NOT EXISTS idx_slots_cls ON schedule_slots(version_id, cls, day_of_week);
