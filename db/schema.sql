-- Schema for Интеллект-плюс schedule app
-- Run: psql $DATABASE_URL -f db/schema.sql
-- Or run via npm run migrate

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('head','teacher')),
  dept          TEXT,
  depts         TEXT[] DEFAULT '{}',
  subjects      TEXT[] DEFAULT '{}',
  password_hash TEXT NOT NULL,
  must_change   BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW()
);

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
