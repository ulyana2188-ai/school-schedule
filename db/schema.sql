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
