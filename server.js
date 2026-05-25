// Express server for Интеллект-плюс schedule app.
// Routes:
//   POST /api/auth/login           — email+password -> JWT
//   POST /api/auth/change-password — (auth) set new password, clear must_change
//   GET  /api/me                   — (auth) current user
//   GET  /api/accounts             — (auth) list of accounts (without password)
//   GET  /api/schedule             — (auth) static schedule data
//   POST /api/replacements         — (auth) create batch of replacements + notifications
//   GET  /api/replacements         — (auth) list replacements
//   GET  /api/notifications        — (auth) my notifications
//   POST /api/notifications/:id/read
//   POST /api/notifications/read-all
//
// Static files served from /public.
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_TTL = "30d";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// === Load schedule once ===
const SCHEDULE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "schedule.json"), "utf-8")
);

// === Auth middleware ===
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no_token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

async function getUserById(id) {
  const r = await db.query(
    "SELECT id, email, name, role, title, dept, depts, subjects, must_change FROM users WHERE id=$1",
    [id]
  );
  return r.rows[0] || null;
}

// === Auth ===
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });
  const r = await db.query(
    "SELECT id, email, name, role, title, dept, depts, subjects, password_hash, must_change FROM users WHERE LOWER(email)=LOWER($1)",
    [email]
  );
  const u = r.rows[0];
  if (!u) return res.status(401).json({ error: "no_user" });
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: "wrong_password" });
  const token = jwt.sign({ userId: u.id }, JWT_SECRET, { expiresIn: JWT_TTL });
  res.json({
    token,
    user: {
      id: u.id, email: u.email, name: u.name, role: u.role, title: u.title,
      dept: u.dept, depts: u.depts, subjects: u.subjects,
    },
    mustChange: u.must_change,
  });
});

app.post("/api/auth/change-password", authMiddleware, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "password_too_short" });
  }
  if (newPassword === "12345") {
    return res.status(400).json({ error: "password_too_simple" });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.query(
    "UPDATE users SET password_hash=$1, must_change=FALSE WHERE id=$2",
    [hash, req.userId]
  );
  res.json({ ok: true });
});

// === Me ===
app.get("/api/me", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  if (!u) return res.status(404).json({ error: "not_found" });
  res.json({ user: u });
});

// === Accounts list ===
app.get("/api/accounts", authMiddleware, async (req, res) => {
  const r = await db.query(
    "SELECT id, email, name, role, title, dept, depts, subjects FROM users ORDER BY role DESC, name"
  );
  res.json({ accounts: r.rows });
});

// === Schedule (static + overrides from DB) ===
app.get("/api/schedule", authMiddleware, async (req, res) => {
  // Deep clone of static schedule
  const sched = JSON.parse(JSON.stringify(SCHEDULE));
  try {
    const r = await db.query("SELECT * FROM schedule_edits");
    for (const ed of r.rows) {
      if (!sched[ed.dept]) continue;
      const days = sched[ed.dept].schedule;
      if (!days[ed.day]) days[ed.day] = {};
      let lesson = days[ed.day][ed.lesson_key];
      if (!lesson) {
        lesson = { lesson_no: ed.lesson_no, time: ed.time, classes: {} };
        days[ed.day][ed.lesson_key] = lesson;
      }
      if (ed.cleared) {
        delete lesson.classes[ed.cls];
        continue;
      }
      const cellInfo = {};
      if (ed.groups) cellInfo.groups = ed.groups;
      else {
        cellInfo.subject = ed.subject;
        cellInfo.teacher = ed.teacher;
      }
      cellInfo.room = ed.room;
      cellInfo._edited = true;
      cellInfo._edited_by = ed.edited_by;
      cellInfo._edited_at = ed.edited_at;
      lesson.classes[ed.cls] = cellInfo;
    }
  } catch (e) { console.error("Override merge error:", e); }
  res.json(sched);
});

// Edit a cell. Body: { dept, day, lesson_key, cls, lesson_no, time, subject, teacher, room, groups, cleared }
app.post("/api/schedule/edits", authMiddleware, requireHead, async (req, res) => {
  const { dept, day, lesson_key, cls, lesson_no, time, subject, teacher, room, groups, cleared } = req.body || {};
  if (!dept || !day || !lesson_key || !cls) return res.status(400).json({ error: "bad_request" });
  // Check dept access
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  if (!allowedDepts.includes(dept)) return res.status(403).json({ error: "wrong_dept" });
  try {
    // Get current state for history
    const before = await db.query(
      "SELECT * FROM schedule_edits WHERE dept=$1 AND day=$2 AND lesson_key=$3 AND cls=$4",
      [dept, day, lesson_key, cls]
    );
    const r = await db.query(
      `INSERT INTO schedule_edits (dept, day, lesson_key, cls, lesson_no, time, subject, teacher, room, groups, cleared, edited_by, edited_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (dept, day, lesson_key, cls)
       DO UPDATE SET lesson_no=EXCLUDED.lesson_no, time=EXCLUDED.time, subject=EXCLUDED.subject,
                     teacher=EXCLUDED.teacher, room=EXCLUDED.room, groups=EXCLUDED.groups, cleared=EXCLUDED.cleared,
                     edited_by=EXCLUDED.edited_by, edited_at=NOW()
       RETURNING *`,
      [dept, day, lesson_key, cls, lesson_no || null, time || null, subject || null, teacher || null, room || null, groups || null, !!cleared, req.userId]
    );
    // Log to history
    await db.query(
      `INSERT INTO schedule_edit_log (dept, day, lesson_key, cls, action, before_data, after_data, edited_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [dept, day, lesson_key, cls, before.rows[0] ? 'update' : 'create', before.rows[0] || null, r.rows[0], req.userId]
    );
    res.json({ edit: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error", details: String(e.message) });
  }
});

// Revert a cell to static version
app.delete("/api/schedule/edits/:dept/:day/:lesson_key/:cls", authMiddleware, requireHead, async (req, res) => {
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  if (!allowedDepts.includes(req.params.dept)) return res.status(403).json({ error: "wrong_dept" });
  try {
    const before = await db.query("SELECT * FROM schedule_edits WHERE dept=$1 AND day=$2 AND lesson_key=$3 AND cls=$4",
      [req.params.dept, req.params.day, req.params.lesson_key, req.params.cls]);
    await db.query("DELETE FROM schedule_edits WHERE dept=$1 AND day=$2 AND lesson_key=$3 AND cls=$4",
      [req.params.dept, req.params.day, req.params.lesson_key, req.params.cls]);
    if (before.rows[0]) {
      await db.query(
        `INSERT INTO schedule_edit_log (dept, day, lesson_key, cls, action, before_data, after_data, edited_by)
         VALUES ($1,$2,$3,$4,'revert',$5,null,$6)`,
        [req.params.dept, req.params.day, req.params.lesson_key, req.params.cls, before.rows[0], req.userId]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "server_error" });
  }
});

// === Replacements ===
// Body: { day, items: [{dept, cls, lesson_no, lesson_key, time, subject, room, replacement_user_id}], absent_user_id, notify_user_ids: [int...] }
app.post("/api/replacements", authMiddleware, async (req, res) => {
  const { day, items, absent_user_id, notify_user_ids } = req.body || {};
  if (!day || !Array.isArray(items) || items.length === 0 || !absent_user_id) {
    return res.status(400).json({ error: "bad_request" });
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const created = [];
    for (const it of items) {
      const r = await client.query(
        `INSERT INTO replacements
         (day, time, dept, cls, lesson_no, lesson_key, absent_user_id, replacement_user_id, subject, room, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          day, it.time, it.dept, it.cls, it.lesson_no, it.lesson_key,
          absent_user_id, it.replacement_user_id, it.subject, it.room, req.userId
        ]
      );
      created.push(r.rows[0]);
    }

    // Build notification messages
    const absent = await client.query("SELECT name FROM users WHERE id=$1", [absent_user_id]);
    const absentName = absent.rows[0]?.name || "—";

    for (const rep of created) {
      const repl = await client.query("SELECT name FROM users WHERE id=$1", [rep.replacement_user_id]);
      const replName = repl.rows[0]?.name || "—";

      for (const uid of (notify_user_ids || [])) {
        const u = await client.query("SELECT id, name, role FROM users WHERE id=$1", [uid]);
        if (!u.rows[0]) continue;
        const user = u.rows[0];
        let title, body;
        if (user.id === absent_user_id) {
          title = `Замена на ${rep.day}`;
          body = `Урок ${rep.lesson_no} (${rep.time || ''}) — ${rep.subject || ''}, ${rep.dept} ${rep.cls || ''} кл. Заменит: ${replName}.`;
        } else if (user.id === rep.replacement_user_id) {
          title = `Вы назначены на замену — ${rep.day}`;
          body = `Урок ${rep.lesson_no} (${rep.time || ''}) — ${rep.subject || ''}, ${rep.dept} ${rep.cls || ''} кл${rep.room ? ', каб ' + rep.room : ''}. Вместо: ${absentName}.`;
        } else {
          title = `Замена в отделении ${rep.dept} — ${rep.day}`;
          body = `Урок ${rep.lesson_no} (${rep.time || ''}), ${rep.cls || ''} кл, ${rep.subject || ''}. ${absentName} → ${replName}.`;
        }
        await client.query(
          "INSERT INTO notifications (to_user_id, title, body, replacement_id) VALUES ($1,$2,$3,$4)",
          [uid, title, body, rep.id]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, created_count: created.length });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "server_error", details: String(e.message) });
  } finally {
    client.release();
  }
});

app.get("/api/replacements", authMiddleware, async (req, res) => {
  const r = await db.query(
    `SELECT r.*, a.name as absent_name, rp.name as replacement_name
     FROM replacements r
     LEFT JOIN users a ON a.id = r.absent_user_id
     LEFT JOIN users rp ON rp.id = r.replacement_user_id
     ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json({ replacements: r.rows });
});

// === Notifications ===
app.get("/api/notifications", authMiddleware, async (req, res) => {
  const r = await db.query(
    "SELECT * FROM notifications WHERE to_user_id=$1 ORDER BY created_at DESC LIMIT 100",
    [req.userId]
  );
  res.json({ notifications: r.rows });
});

app.post("/api/notifications/:id/read", authMiddleware, async (req, res) => {
  await db.query(
    "UPDATE notifications SET is_read=TRUE WHERE id=$1 AND to_user_id=$2",
    [req.params.id, req.userId]
  );
  res.json({ ok: true });
});

app.post("/api/notifications/read-all", authMiddleware, async (req, res) => {
  await db.query("UPDATE notifications SET is_read=TRUE WHERE to_user_id=$1", [req.userId]);
  res.json({ ok: true });
});

// === Absences (each user manages own; heads see all) ===
app.get("/api/absences", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  let rows;
  if (u.role === "head") {
    rows = await db.query(
      `SELECT a.*, us.name as user_name, us.dept as user_dept FROM user_absences a
       JOIN users us ON us.id = a.user_id
       ORDER BY a.start_date DESC LIMIT 500`
    );
  } else {
    rows = await db.query("SELECT * FROM user_absences WHERE user_id=$1 ORDER BY start_date DESC", [req.userId]);
  }
  res.json({ absences: rows.rows });
});

app.post("/api/absences", authMiddleware, async (req, res) => {
  const { user_id, start_date, end_date, kind, note } = req.body || {};
  if (!start_date || !end_date || !kind) return res.status(400).json({ error: "bad_request" });
  const u = await getUserById(req.userId);
  // Teacher can only add for themselves, head can add for anyone
  const targetId = (u.role === "head" && user_id) ? parseInt(user_id) : req.userId;
  if (u.role !== "head" && targetId !== req.userId) return res.status(403).json({ error: "forbidden" });
  const r = await db.query(
    `INSERT INTO user_absences (user_id, start_date, end_date, kind, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [targetId, start_date, end_date, kind, note || null, req.userId]
  );
  res.json({ absence: r.rows[0] });
});

app.delete("/api/absences/:id", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  const a = await db.query("SELECT user_id FROM user_absences WHERE id=$1", [req.params.id]);
  if (!a.rows[0]) return res.status(404).json({ error: "not_found" });
  if (u.role !== "head" && a.rows[0].user_id !== req.userId) return res.status(403).json({ error: "forbidden" });
  await db.query("DELETE FROM user_absences WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// Check if user is absent on a given date (for substitution algorithm — frontend can use)
app.get("/api/absences/check", authMiddleware, async (req, res) => {
  const { user_id, date } = req.query;
  if (!user_id || !date) return res.json({ absent: false });
  const r = await db.query(
    "SELECT id, kind FROM user_absences WHERE user_id=$1 AND start_date <= $2 AND end_date >= $2",
    [user_id, date]
  );
  res.json({ absent: r.rows.length > 0, kind: r.rows[0]?.kind || null });
});

// === Academic Support ===
app.get("/api/academic-support", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  let rows;
  if (u.role === "head") {
    // Head sees all in their depts
    const depts = (u.depts && u.depts.length > 0) ? u.depts : [u.dept];
    rows = await db.query(
      `SELECT s.*, us.name as teacher_name FROM academic_support s
       JOIN users us ON us.id = s.teacher_id
       WHERE s.dept = ANY($1) ORDER BY s.date DESC, s.start_time DESC LIMIT 300`,
      [depts]
    );
  } else {
    rows = await db.query(
      `SELECT s.*, us.name as teacher_name FROM academic_support s
       JOIN users us ON us.id = s.teacher_id
       WHERE s.teacher_id = $1 ORDER BY s.date DESC, s.start_time DESC LIMIT 100`,
      [req.userId]
    );
  }
  res.json({ sessions: rows.rows });
});

app.post("/api/academic-support", authMiddleware, async (req, res) => {
  const { dept, date, start_time, end_time, subject, cls, room, note } = req.body || {};
  if (!dept || !date) return res.status(400).json({ error: "bad_request" });
  const u = await getUserById(req.userId);
  // Teacher must belong to that dept (or be a head)
  const allowed = (u.depts && u.depts.includes(dept)) || u.dept === dept;
  if (!allowed) return res.status(403).json({ error: "wrong_dept" });
  const r = await db.query(
    `INSERT INTO academic_support (teacher_id, dept, date, start_time, end_time, subject, cls, room, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.userId, dept, date, start_time || null, end_time || null, subject || null, cls || null, room || null, note || null]
  );
  res.json({ session: r.rows[0] });
});

app.delete("/api/academic-support/:id", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  const s = await db.query("SELECT teacher_id FROM academic_support WHERE id=$1", [req.params.id]);
  if (!s.rows[0]) return res.status(404).json({ error: "not_found" });
  if (u.role !== "head" && s.rows[0].teacher_id !== req.userId) return res.status(403).json({ error: "forbidden" });
  await db.query("DELETE FROM academic_support WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// Invite curator to academic support session
app.post("/api/academic-support/:id/invite", authMiddleware, async (req, res) => {
  const { curator_ids, student_info } = req.body || {};
  if (!Array.isArray(curator_ids) || curator_ids.length === 0) return res.status(400).json({ error: "no_curators" });
  const s = await db.query(
    `SELECT s.*, us.name as teacher_name FROM academic_support s
     JOIN users us ON us.id = s.teacher_id WHERE s.id = $1`,
    [req.params.id]
  );
  if (!s.rows[0]) return res.status(404).json({ error: "not_found" });
  const session = s.rows[0];
  for (const cid of curator_ids) {
    const title = `📚 Приглашение на академическую поддержку`;
    const body = `${session.teacher_name} приглашает на доп. урок:\n` +
                 `📅 ${new Date(session.date).toLocaleDateString("ru-RU")}` +
                 (session.start_time ? ` · ${session.start_time}${session.end_time ? "–" + session.end_time : ""}` : "") + `\n` +
                 `📖 ${session.subject || "—"}${session.cls ? ", " + session.cls + " кл" : ""}` +
                 (session.room ? `, каб. ${session.room}` : "") +
                 (student_info ? `\n👤 ${student_info}` : "") +
                 (session.note ? `\n💬 ${session.note}` : "");
    await db.query(
      "INSERT INTO notifications (to_user_id, title, body) VALUES ($1,$2,$3)",
      [cid, title, body]
    );
  }
  res.json({ ok: true, sent: curator_ids.length });
});

// === Excel import (basic) ===
const multer = require("multer");
const xlsx = require("xlsx");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Helper: try to parse an uploaded xlsx into list of edits
// Expected formats: see public/index.html — admin uploads, server returns preview of detected lessons
function parseScheduleSheet(workbook, dept) {
  const DAYS_MAP = {
    "понедельник": "Понедельник", "вторник": "Вторник", "среда": "Среда",
    "четверг": "Четверг", "пятница": "Пятница"
  };
  const lessons = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    let currentDay = null;
    let classCols = {}; // colIdx -> "5"
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      // Detect header row with class names: look for "1 класс", "5 класс" etc
      let headerFound = false;
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (!v) continue;
        const m = String(v).match(/^\s*(\d{1,2})\s*класс\s*$/i);
        if (m) {
          classCols[c] = m[1];
          headerFound = true;
        }
      }
      if (headerFound) continue;
      // Detect day name
      for (const cell of row) {
        if (!cell) continue;
        const lower = String(cell).toLowerCase().trim();
        if (DAYS_MAP[lower]) {
          currentDay = DAYS_MAP[lower];
          break;
        }
      }
      // Look for lesson_no in early columns (1-12)
      let lessonNo = null, time = null;
      for (let c = 0; c < Math.min(row.length, 5); c++) {
        const v = row[c];
        if (v === null || v === undefined) continue;
        const sv = String(v).trim();
        if (/^\d{1,2}$/.test(sv) && parseInt(sv) >= 1 && parseInt(sv) <= 14) {
          if (lessonNo === null) lessonNo = parseInt(sv);
        } else if (/\d{1,2}[.:]\d{2}\s*[-—–]\s*\d{1,2}[.:]\d{2}/.test(sv)) {
          time = sv;
        }
      }
      if (lessonNo === null || !currentDay) continue;
      // Extract subjects per class
      for (const c in classCols) {
        const cls = classCols[c];
        const cellVal = row[c];
        if (!cellVal) continue;
        const text = String(cellVal).trim();
        if (!text) continue;
        // Try to split subject and teacher
        const m = text.match(/^(.+?)\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.?[А-ЯЁ]?\.?)\s*$/);
        const subject = m ? m[1].trim() : text.split("\n")[0].trim();
        const teacher = m ? m[2].trim() : null;
        lessons.push({
          dept, day: currentDay, lesson_no: lessonNo, time,
          cls, subject, teacher, room: null,
          lesson_key: `L${lessonNo}|${time || ""}`,
        });
      }
    }
  }
  return lessons;
}

// POST /api/schedule/import — admin uploads xlsx for given dept (multipart/form-data, file=xlsx, dept=string)
app.post("/api/schedule/import", authMiddleware, requireHead, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  const dept = req.body.dept;
  if (!dept) return res.status(400).json({ error: "no_dept" });
  // Check dept access
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  if (!allowedDepts.includes(dept)) return res.status(403).json({ error: "wrong_dept" });
  try {
    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const lessons = parseScheduleSheet(wb, dept);
    // Preview mode: return parsed result; actual save needs explicit confirm
    if (req.body.preview === "true") {
      return res.json({ preview: lessons.slice(0, 50), total: lessons.length });
    }
    // Save as edits
    let saved = 0;
    for (const L of lessons) {
      await db.query(
        `INSERT INTO schedule_edits (dept, day, lesson_key, cls, lesson_no, time, subject, teacher, room, cleared, edited_by, edited_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10,NOW())
         ON CONFLICT (dept, day, lesson_key, cls)
         DO UPDATE SET lesson_no=EXCLUDED.lesson_no, time=EXCLUDED.time, subject=EXCLUDED.subject,
                       teacher=EXCLUDED.teacher, room=EXCLUDED.room, cleared=FALSE,
                       edited_by=EXCLUDED.edited_by, edited_at=NOW()`,
        [L.dept, L.day, L.lesson_key, L.cls, L.lesson_no, L.time, L.subject, L.teacher, L.room, req.userId]
      );
      saved++;
    }
    res.json({ ok: true, saved, total: lessons.length });
  } catch (e) {
    console.error("Import error:", e);
    res.status(500).json({ error: "parse_failed", details: String(e.message) });
  }
});

// === Schedule history ===
app.get("/api/schedule/history", authMiddleware, async (req, res) => {
  const { dept } = req.query;
  const params = [];
  let q = `SELECT l.*, u.name as edited_by_name FROM schedule_edit_log l
           LEFT JOIN users u ON u.id = l.edited_by`;
  if (dept) {
    params.push(dept);
    q += ` WHERE l.dept = $${params.length}`;
  }
  q += ` ORDER BY l.edited_at DESC LIMIT 200`;
  const r = await db.query(q, params);
  res.json({ history: r.rows });
});

// === Admin (head only) ===
async function requireHead(req, res, next) {
  const u = await getUserById(req.userId);
  if (!u || u.role !== "head") return res.status(403).json({ error: "forbidden" });
  req.user = u;
  next();
}

// Create a new user
app.post("/api/admin/users", authMiddleware, requireHead, async (req, res) => {
  const { email, name, role, title, dept, depts, subjects } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: "email_name_required" });
  const hash = await bcrypt.hash(process.env.DEFAULT_PASSWORD || "12345", 10);
  try {
    const r = await db.query(
      `INSERT INTO users (email, name, role, title, dept, depts, subjects, password_hash, must_change)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING id, email, name, role, title, dept, depts, subjects`,
      [email.trim().toLowerCase(), name, role || "teacher", title || null, dept || null, depts || [], subjects || [], hash]
    );
    res.json({ user: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "email_exists" });
    console.error(e); res.status(500).json({ error: "server_error" });
  }
});

// Edit user
app.patch("/api/admin/users/:id", authMiddleware, requireHead, async (req, res) => {
  const id = parseInt(req.params.id);
  const { email, name, role, title, dept, depts, subjects } = req.body || {};
  const fields = [], values = [];
  if (email != null)    { fields.push(`email=$${fields.length+1}`);    values.push(email.trim().toLowerCase()); }
  if (name != null)     { fields.push(`name=$${fields.length+1}`);     values.push(name); }
  if (role != null)     { fields.push(`role=$${fields.length+1}`);     values.push(role); }
  if (title !== undefined) { fields.push(`title=$${fields.length+1}`); values.push(title); }
  if (dept !== undefined) { fields.push(`dept=$${fields.length+1}`);   values.push(dept); }
  if (depts != null)    { fields.push(`depts=$${fields.length+1}`);    values.push(depts); }
  if (subjects != null) { fields.push(`subjects=$${fields.length+1}`); values.push(subjects); }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(id);
  try {
    const r = await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id=$${values.length} RETURNING id, email, name, role, title, dept, depts, subjects`, values);
    res.json({ user: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "email_exists" });
    console.error(e); res.status(500).json({ error: "server_error" });
  }
});

// Reset password to default
app.post("/api/admin/users/:id/reset-password", authMiddleware, requireHead, async (req, res) => {
  const hash = await bcrypt.hash(process.env.DEFAULT_PASSWORD || "12345", 10);
  await db.query("UPDATE users SET password_hash=$1, must_change=TRUE WHERE id=$2", [hash, parseInt(req.params.id)]);
  res.json({ ok: true });
});

// Delete (soft — only if no replacements; otherwise just block via app logic)
app.delete("/api/admin/users/:id", authMiddleware, requireHead, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.query("DELETE FROM notifications WHERE to_user_id=$1", [id]);
    await db.query("DELETE FROM users WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "server_error", details: String(e.message) });
  }
});

// === Health ===
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// === Bootstrap (migrations + seed on first start) ===
async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set — starting without DB (frontend only).");
    return;
  }
  try {
    const sql = fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf-8");
    await db.query(sql);
    console.log("Schema OK.");

    // Auto-seed if users table is empty
    const r = await db.query("SELECT COUNT(*) FROM users");
    const count = parseInt(r.rows[0].count);
    if (count === 0) {
      console.log("Users table empty — running seed...");
      const { execSync } = require("child_process");
      execSync("node db/seed.js", { stdio: "inherit", env: process.env });
    } else {
      console.log(`Users in DB: ${count} — running reconciliation...`);
      await convertEmailsToLogins();
      await reconcileTeachers();
    }
    await ensureSpecialHeads();
  } catch (e) {
    console.error("Bootstrap failed:", e);
  }
}

// Promote specific people to head/director role on every startup.
// This ensures Шестакова, Клюева, Шатунова, Муратова and Киняева У.В. always have correct access.
const ALL_DEPTS = ["Империал", "Пушкина", "Чкалова", "Кирова"];
const SPECIAL_HEADS_BOOTSTRAP = [
  { name: "Шестакова И.А.", login: "shestakova-ia", depts: ["Империал"], dept: "Империал", title: "Руководитель отделения" },
  { name: "Клюева Е.С.",    login: "klueva-es",    depts: ["Чкалова"],  dept: "Чкалова",  title: "Руководитель отделения" },
  { name: "Шатунова В.А.",  login: "shatunova-va", depts: ["Пушкина"],  dept: "Пушкина",  title: "Руководитель отделения" },
  { name: "Муратова В.Д.",  login: "muratova-vd",  depts: ["Кирова"],   dept: "Кирова",   title: "Администратор отделения" },
  { name: "Шаболкина Л.А.", login: "shabolkina-la", depts: ["Кирова"],  dept: "Кирова",   title: "Руководитель отделения" },
  { name: "Киняева У.В.",   login: "kinyaeva-uv",  depts: ALL_DEPTS,    dept: "Империал", title: "Директор школы" },
];

async function ensureSpecialHeads() {
  const bcrypt = require("bcryptjs");
  const defaultPwd = process.env.DEFAULT_PASSWORD || "12345";
  const hash = await bcrypt.hash(defaultPwd, 10);
  let promoted = 0, created = 0;
  for (const sh of SPECIAL_HEADS_BOOTSTRAP) {
    const ex = await db.query("SELECT id, role FROM users WHERE name = $1 LIMIT 1", [sh.name]);
    if (ex.rows.length > 0) {
      await db.query(
        "UPDATE users SET role='head', dept=$1, depts=$2, title=$3 WHERE id=$4",
        [sh.dept, sh.depts, sh.title || null, ex.rows[0].id]
      );
      promoted++;
    } else {
      let login = sh.login;
      let suffix = 1;
      while ((await db.query("SELECT 1 FROM users WHERE email = $1", [login])).rowCount > 0) {
        login = sh.login + suffix++;
      }
      await db.query(
        `INSERT INTO users (email, name, role, title, dept, depts, password_hash, must_change)
         VALUES ($1, $2, 'head', $3, $4, $5, $6, TRUE)`,
        [login, sh.name, sh.title || null, sh.dept, sh.depts, hash]
      );
      created++;
    }
  }
  if (promoted || created) console.log(`Special heads: ${promoted} promoted, ${created} created.`);
}

// Normalize a Russian teacher name (whitespace, initial dots)
function normalizeName(name) {
  if (!name) return name;
  let n = String(name).trim().replace(/\s+/g, " ");
  n = n.replace(/([А-ЯЁ])\s*\.\s*([А-ЯЁ])\s*\.?/g, "$1.$2.");
  n = n.replace(/\.\.+/g, ".");
  return n.trim();
}

// Reconcile teacher users with normalized names from current schedule.json.
// - If a user's name (case-insensitive) doesn't exist in schedule, try normalizing.
// - If normalized form matches an existing teacher in schedule, rename the user.
// - If a duplicate now exists (same name), merge: keep the older user, transfer FK refs, delete other.
// Convert legacy emails like "krasnova.as@intellekt-plus.ru" to new logins "krasnova-as".
async function convertEmailsToLogins() {
  const r = await db.query("SELECT id, email FROM users WHERE email LIKE '%@intellekt-plus.ru'");
  let updated = 0;
  for (const u of r.rows) {
    let login = u.email.split("@")[0].replace(/\./g, "-");
    if (login === "admin-imperial" || login === "admin-pushkina" || login === "admin-chkalova") {
      // already correct
    }
    // Check if this login already exists for someone else
    const dup = await db.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1) AND id <> $2", [login, u.id]);
    if (dup.rows.length > 0) {
      let i = 1;
      let candidate;
      do {
        candidate = login + i;
        i++;
        const c = await db.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [candidate]);
        if (c.rows.length === 0) break;
      } while (i < 100);
      login = candidate;
    }
    await db.query("UPDATE users SET email=$1 WHERE id=$2", [login, u.id]);
    updated++;
  }
  if (updated) console.log(`Converted ${updated} emails to logins.`);
}

async function reconcileTeachers() {
  // Build set of canonical names from current schedule
  const canon = new Set();
  for (const dept of Object.keys(SCHEDULE)) {
    const sched = SCHEDULE[dept].schedule || {};
    for (const day of Object.keys(sched)) {
      for (const lkey of Object.keys(sched[day])) {
        const ld = sched[day][lkey];
        for (const cls of Object.keys(ld.classes || {})) {
          const info = ld.classes[cls];
          const items = info.groups ? info.groups : [info];
          for (const it of items) if (it.teacher) canon.add(it.teacher);
        }
      }
    }
  }

  const r = await db.query("SELECT id, email, name FROM users WHERE role = 'teacher' ORDER BY id");
  let renamed = 0, merged = 0;
  for (const u of r.rows) {
    if (canon.has(u.name)) continue;
    const norm = normalizeName(u.name);
    if (!canon.has(norm)) continue;
    // Check if a user already exists with that canonical name
    const existing = await db.query("SELECT id FROM users WHERE name=$1 AND id <> $2 LIMIT 1", [norm, u.id]);
    if (existing.rows.length > 0) {
      const keepId = existing.rows[0].id;
      // Merge: transfer FK refs from u.id to keepId then delete u
      await db.query("UPDATE replacements SET absent_user_id=$1 WHERE absent_user_id=$2", [keepId, u.id]);
      await db.query("UPDATE replacements SET replacement_user_id=$1 WHERE replacement_user_id=$2", [keepId, u.id]);
      await db.query("UPDATE replacements SET created_by=$1 WHERE created_by=$2", [keepId, u.id]);
      await db.query("UPDATE notifications SET to_user_id=$1 WHERE to_user_id=$2", [keepId, u.id]);
      await db.query("DELETE FROM users WHERE id=$1", [u.id]);
      merged++;
    } else {
      // Just rename
      await db.query("UPDATE users SET name=$1 WHERE id=$2", [norm, u.id]);
      renamed++;
    }
  }
  if (renamed || merged) console.log(`Reconciliation: ${renamed} renamed, ${merged} merged.`);
}

bootstrap().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
  });
});
