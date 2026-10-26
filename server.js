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

// ── SSE broadcast ─────────────────────────────────────────────────────────────
const _sseClients = new Set();
function sseBroadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of _sseClients) {
    try { res.write(msg); } catch (_) { _sseClients.delete(res); }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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
    "SELECT id, email, name, role, title, dept, depts, subjects, COALESCE(is_active, TRUE) as is_active FROM users ORDER BY role DESC, name"
  );
  res.json({ accounts: r.rows });
});

// === Schedule (static + full overrides + cell edits from DB) ===
app.get("/api/schedule", authMiddleware, async (req, res) => {
  // Start from static schedule.json, then apply full overrides, then cell edits
  const sched = JSON.parse(JSON.stringify(SCHEDULE));
  try {
    // 1. Apply full schedule overrides (replaces base schedule.json for that dept)
    const ovr = await db.query("SELECT dept, data FROM schedule_overrides");
    for (const row of ovr.rows) {
      sched[row.dept] = row.data;
    }
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
    sseBroadcast("schedule_edit", { edit: r.rows[0] });
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
    sseBroadcast("schedule_revert", {
      dept: req.params.dept, day: req.params.day,
      lesson_key: req.params.lesson_key, cls: req.params.cls,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "server_error" });
  }
});

// === Replacements ===
// Body: { day, items: [{dept, cls, lesson_no, lesson_key, time, subject, room, replacement_user_id}], absent_user_id, notify_user_ids: [int...] }
app.post("/api/replacements", authMiddleware, async (req, res) => {
  const { day, items, absent_user_id, notify_user_ids, comment } = req.body || {};
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
         (day, time, dept, cls, lesson_no, lesson_key, absent_user_id, replacement_user_id, subject, room, created_by, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          day, it.time, it.dept, it.cls, it.lesson_no, it.lesson_key,
          absent_user_id, it.replacement_user_id, it.subject, it.room, req.userId,
          comment || null
        ]
      );
      created.push(r.rows[0]);
    }

    // Build notification messages
    const absent = await client.query("SELECT name FROM users WHERE id=$1", [absent_user_id]);
    const absentName = absent.rows[0]?.name || "—";
    const commentSuffix = comment ? ` Причина: ${comment}.` : "";

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
          body = `Урок ${rep.lesson_no} (${rep.time || ''}) — ${rep.subject || ''}, ${rep.dept} ${rep.cls || ''} кл. Заменит: ${replName}.${commentSuffix}`;
        } else if (user.id === rep.replacement_user_id) {
          title = `Вы назначены на замену — ${rep.day}`;
          body = `Урок ${rep.lesson_no} (${rep.time || ''}) — ${rep.subject || ''}, ${rep.dept} ${rep.cls || ''} кл${rep.room ? ', каб ' + rep.room : ''}. Вместо: ${absentName}.${commentSuffix}`;
        } else {
          title = `Замена в отделении ${rep.dept} — ${rep.day}`;
          body = `Урок ${rep.lesson_no} (${rep.time || ''}), ${rep.cls || ''} кл, ${rep.subject || ''}. ${absentName} → ${replName}.${commentSuffix}`;
        }
        await client.query(
          "INSERT INTO notifications (to_user_id, title, body, replacement_id) VALUES ($1,$2,$3,$4)",
          [uid, title, body, rep.id]
        );
        // Send push notification (non-blocking)
        sendPushToUser(uid, title, body).catch(() => {});
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
    `SELECT n.*, r.response_status
     FROM notifications n
     LEFT JOIN replacements r ON r.id = n.replacement_id
     WHERE n.to_user_id=$1
     ORDER BY n.created_at DESC LIMIT 100`,
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

// === Full schedule import (saves to schedule_overrides, replaces base schedule.json for dept) ===

// Helper: parse xlsx into a full schedule object { classes, schedule }
// Smart multi-strategy parser:
//   1. FLAT: any header row containing class/day/subject columns (fuzzy matching)
//   2. GRID: day section headers + class columns ("1 класс", "5а", "7б" etc.)
//   3. TRANSPOSED: classes as rows, days/lessons as columns
//   4. DAILY: sheet-per-day (each sheet named after a day)
function parseFullScheduleSheet(workbook, dept) {
  const DAYS_MAP = {
    "понедельник": "Понедельник", "вторник": "Вторник", "среда": "Среда",
    "четверг": "Четверг", "пятница": "Пятница",
    "пн": "Понедельник", "вт": "Вторник", "ср": "Среда", "чт": "Четверг", "пт": "Пятница",
    "monday": "Понедельник", "tuesday": "Вторник", "wednesday": "Среда",
    "thursday": "Четверг", "friday": "Пятница",
  };
  const HEADER_KEYS = {
    cls: ["класс","группа","кл","class","group"],
    day: ["день","day","дата","weekday"],
    lesson_no: ["урок","№","номер","lesson","no","num","п/п","#","slot"],
    time: ["время","time","часы","час"],
    subject: ["предмет","дисциплина","subject","занятие","название"],
    teacher: ["учитель","педагог","преподаватель","teacher","ф.и.о","фио"],
    room: ["кабинет","ауд","room","аудитория","зал","каб"],
  };

  // Fuzzy match: does string contain any of the synonyms?
  function matchHeader(val, synonyms) {
    if (!val) return false;
    const v = String(val).toLowerCase().trim();
    return synonyms.some(s => v.includes(s));
  }

  // Detect if a value looks like a class name: "1", "1а", "5б", "10", "11", "7А", "2-й" etc
  function isClassName(v) {
    if (!v) return false;
    const s = String(v).trim();
    return /^((\d{1,2})\s*[а-яёА-ЯЁa-zA-Z]?\s*(кл\.?|класс)?)$/.test(s) ||
           /^(группа\s+)?(\d{1,2}[а-яёА-ЯЁ]?)$/.test(s);
  }

  // Normalize class name to bare form: "5 класс" -> "5", "10а класс" -> "10а"
  function normalizeClass(v) {
    return String(v).trim().replace(/\s*(класс|кл\.?)\s*$/i, "").trim();
  }

  // Detect day name in a string
  function detectDay(v) {
    if (!v) return null;
    const low = String(v).toLowerCase().trim();
    return DAYS_MAP[low] || null;
  }

  // Detect lesson number (1-14)
  function detectLessonNo(v) {
    if (v === null || v === undefined) return null;
    const sv = String(v).trim();
    if (/^\d{1,2}$/.test(sv)) {
      const n = parseInt(sv);
      if (n >= 1 && n <= 14) return n;
    }
    return null;
  }

  // Detect time range like "8:30-9:15" or "8.30—9.15"
  function detectTime(v) {
    if (!v) return null;
    const sv = String(v).trim();
    if (/\d{1,2}[.:]\d{2}\s*[-—–]\s*\d{1,2}[.:]\d{2}/.test(sv)) return sv;
    return null;
  }

  const classSet = new Set();
  // lessons: array of { cls, day, lesson_no, time, subject, teacher, room }
  const lessons = [];

  // Extract subject + optional teacher from a cell value
  function extractSubjectTeacher(cellVal) {
    if (!cellVal) return null;
    const text = String(cellVal).trim();
    if (!text) return null;
    const lines = text.split(/\n|\\n/);
    const firstLine = lines[0].trim();
    // Try: "Математика Иванова А.В." — teacher name at end
    const teacherMatch = text.match(/^(.+?)\s+([А-ЯЁ][а-яё]+(ов|ова|ев|ева|ин|ина|ый|ая|ий|ья)?\s+[А-ЯЁ]\.?\s*[А-ЯЁ]?\.?)\s*$/);
    if (lines.length >= 2) {
      return { subject: firstLine, teacher: lines.slice(1).map(l => l.trim()).filter(Boolean).join(", ") || null };
    } else if (teacherMatch) {
      return { subject: teacherMatch[1].trim(), teacher: teacherMatch[2].trim() };
    }
    return { subject: firstLine, teacher: null };
  }

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows.length) continue;

    // Check if sheet name is a day name (DAILY format: each sheet = one day)
    const sheetDay = detectDay(sheetName);

    // ── Strategy 1: FLAT format (header row with column names) ──────────────
    let flatColMap = null;
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const row = rows[r] || [];
      if (row.every(c => !c)) continue;
      const found = {};
      for (const [key, syns] of Object.entries(HEADER_KEYS)) {
        for (let c = 0; c < row.length; c++) {
          if (matchHeader(row[c], syns)) { found[key] = c; break; }
        }
      }
      // Need at least subject and (cls or day)
      const hasSubject = found.subject !== undefined;
      const hasCls = found.cls !== undefined;
      const hasDay = found.day !== undefined;
      if (hasSubject && (hasCls || hasDay)) {
        flatColMap = found;
        let lastDay = sheetDay;
        let lastCls = null;
        for (let i = r + 1; i < rows.length; i++) {
          const dr = rows[i];
          if (!dr || dr.every(c => !c)) continue;
          // Try to detect day (may appear only once per day block)
          if (hasCls === false || !dr[found.cls]) {
            const maybeDay = detectDay(dr[found.day != null ? found.day : 0]);
            if (maybeDay) { lastDay = maybeDay; continue; }
          }
          const clsRaw = hasCls && dr[found.cls] != null ? normalizeClass(String(dr[found.cls]).trim()) : lastCls;
          const dayRaw = hasDay && dr[found.day] != null ? detectDay(dr[found.day]) : lastDay;
          const subjRaw = dr[found.subject] != null ? String(dr[found.subject]).trim() : null;
          if (!clsRaw || !dayRaw || !subjRaw) continue;
          if (clsRaw) lastCls = clsRaw;
          const lesson_no = found.lesson_no != null ? detectLessonNo(dr[found.lesson_no]) : null;
          const time = found.time != null ? detectTime(dr[found.time]) : null;
          const teacher = found.teacher != null && dr[found.teacher] != null ? String(dr[found.teacher]).trim() : null;
          const room = found.room != null && dr[found.room] != null ? String(dr[found.room]).trim() : null;
          classSet.add(clsRaw);
          lessons.push({ cls: clsRaw, day: dayRaw, lesson_no, time, subject: subjRaw, teacher: teacher || null, room: room || null });
        }
        break;
      }
    }
    if (flatColMap) continue;

    // ── Strategy 2: GRID format (day section headers + class columns) ────────
    // Look for header row that has class names as column headers
    let classCols = {}; // colIdx -> normalized class name
    let currentDay = sheetDay;
    let gridStarted = false;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];

      // Scan for class header row: row where multiple cells match class names
      let classHeaderCount = 0;
      const potentialCols = {};
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (!v) continue;
        if (isClassName(String(v).trim())) {
          potentialCols[c] = normalizeClass(String(v).trim());
          classHeaderCount++;
        }
      }
      // If we found 2+ class names in a row — this is a class header row
      if (classHeaderCount >= 2) {
        Object.assign(classCols, potentialCols);
        gridStarted = true;
        continue;
      }

      // Detect day name in any cell
      let dayFound = false;
      for (let c = 0; c < row.length; c++) {
        const d = detectDay(row[c]);
        if (d) { currentDay = d; dayFound = true; break; }
      }
      if (dayFound && !Object.keys(classCols).length) continue;

      // Extract lesson number + time from first few columns
      let lessonNo = null, time = null;
      for (let c = 0; c < Math.min(row.length, 6); c++) {
        if (lessonNo === null) {
          const n = detectLessonNo(row[c]);
          if (n !== null) { lessonNo = n; continue; }
        }
        if (time === null) {
          const t = detectTime(row[c]);
          if (t) { time = t; continue; }
        }
      }

      if (!currentDay || !Object.keys(classCols).length) continue;
      if (lessonNo === null && !gridStarted) continue;

      // Extract lessons from class columns
      for (const c in classCols) {
        const ci = parseInt(c);
        const cellVal = row[ci];
        if (!cellVal) continue;
        const parsed = extractSubjectTeacher(cellVal);
        if (!parsed || !parsed.subject) continue;
        classSet.add(classCols[c]);
        lessons.push({
          cls: classCols[c], day: currentDay,
          lesson_no: lessonNo, time,
          subject: parsed.subject,
          teacher: parsed.teacher || null,
          room: null,
        });
      }
    }

    // ── Strategy 3: AUTO detect — no clear structure, scan for known patterns ──
    // If nothing found yet from this sheet, try a more aggressive scan
    if (lessons.length === 0) {
      let scanDay = sheetDay;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || [];
        // Look for day name
        for (const cell of row) {
          const d = detectDay(cell);
          if (d) { scanDay = d; break; }
        }
        if (!scanDay) continue;
        // Check if any cell looks like a class + find adjacent subject cells
        for (let c = 0; c < row.length - 1; c++) {
          if (!isClassName(row[c])) continue;
          const cls = normalizeClass(String(row[c]).trim());
          // Next cell might be subject
          const nextVal = row[c + 1];
          if (!nextVal) continue;
          const parsed = extractSubjectTeacher(nextVal);
          if (!parsed || !parsed.subject) continue;
          const lessonNo = r > 0 ? detectLessonNo((rows[r - 1] || [])[c]) : null;
          classSet.add(cls);
          lessons.push({ cls, day: scanDay, lesson_no: lessonNo, time: null, subject: parsed.subject, teacher: parsed.teacher, room: null });
        }
      }
    }
  }

  if (!lessons.length) return null;

  // Build schedule.json structure
  const classesArr = Array.from(classSet).sort((a, b) => {
    const na = parseInt(a); const nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, "ru");
  });

  const schedule = {};
  for (const L of lessons) {
    if (!L.day) continue;
    if (!schedule[L.day]) schedule[L.day] = {};
    const timeClean = (L.time || "").replace(/[.:]/g, ".").replace(/\s/g, "");
    const lkey = `${L.lesson_no || "?"}|${timeClean}`;
    if (!schedule[L.day][lkey]) {
      schedule[L.day][lkey] = { lesson_no: L.lesson_no || 0, time: L.time || "", classes: {} };
    }
    schedule[L.day][lkey].classes[L.cls] = {
      subject: L.subject, teacher: L.teacher, room: L.room
    };
  }

  return { classes: classesArr, schedule };
}

// GET /api/schedule/overrides — list depts that have a full import
app.get("/api/schedule/overrides", authMiddleware, async (req, res) => {
  const r = await db.query(
    "SELECT dept, imported_at, u.name as imported_by_name FROM schedule_overrides o LEFT JOIN users u ON u.id=o.imported_by ORDER BY dept"
  );
  res.json({ overrides: r.rows });
});

// DELETE /api/schedule/overrides/:dept — revert to base schedule.json
app.delete("/api/schedule/overrides/:dept", authMiddleware, requireHead, async (req, res) => {
  const dept = decodeURIComponent(req.params.dept);
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  if (!allowedDepts.includes(dept) && req.user.role !== "director")
    return res.status(403).json({ error: "wrong_dept" });
  await db.query("DELETE FROM schedule_overrides WHERE dept=$1", [dept]);
  res.json({ ok: true });
});

// POST /api/schedule/import-full — upload xlsx, parse, save full schedule to schedule_overrides
app.post("/api/schedule/import-full", authMiddleware, requireHead, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  const dept = req.body.dept;
  if (!dept) return res.status(400).json({ error: "no_dept" });
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  if (!allowedDepts.includes(dept) && req.user.role !== "director")
    return res.status(403).json({ error: "wrong_dept" });
  try {
    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const parsed = parseFullScheduleSheet(wb, dept);
    if (!parsed) return res.status(400).json({ error: "parse_failed", details: "Не удалось распознать расписание. Проверьте формат файла." });

    // Count lessons for preview
    let total = 0;
    for (const day of Object.values(parsed.schedule)) {
      for (const ldata of Object.values(day)) {
        total += Object.keys(ldata.classes).length;
      }
    }

    if (req.body.preview === "true") {
      return res.json({ classes: parsed.classes, total, days: Object.keys(parsed.schedule).length });
    }

    // Save to schedule_overrides
    await db.query(
      `INSERT INTO schedule_overrides (dept, data, imported_by, imported_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (dept) DO UPDATE SET data=EXCLUDED.data, imported_by=EXCLUDED.imported_by, imported_at=NOW()`,
      [dept, JSON.stringify(parsed), req.userId]
    );
    res.json({ ok: true, total, classes: parsed.classes });
  } catch (e) {
    console.error("Full import error:", e);
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

// Archive (deactivate) user — preserves history
app.post("/api/admin/users/:id/archive", authMiddleware, requireHead, async (req, res) => {
  await db.query("UPDATE users SET is_active=FALSE WHERE id=$1", [parseInt(req.params.id)]);
  res.json({ ok: true });
});
// Restore (reactivate) user
app.post("/api/admin/users/:id/restore", authMiddleware, requireHead, async (req, res) => {
  await db.query("UPDATE users SET is_active=TRUE WHERE id=$1", [parseInt(req.params.id)]);
  res.json({ ok: true });
});
// Hard delete — only for users with no history (no replacements)
app.delete("/api/admin/users/:id", authMiddleware, requireHead, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Check for history
    const hist = await db.query(
      "SELECT 1 FROM replacements WHERE absent_user_id=$1 OR replacement_user_id=$1 OR created_by=$1 LIMIT 1",
      [id]
    );
    if (hist.rows.length > 0) {
      // Has history — soft-archive instead of hard delete
      await db.query("UPDATE users SET is_active=FALSE WHERE id=$1", [id]);
      return res.json({ ok: true, archived: true });
    }
    await db.query("DELETE FROM notifications WHERE to_user_id=$1", [id]);
    await db.query("DELETE FROM users WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "server_error", details: String(e.message) });
  }
});

// ============================================================
// SCHEDULE GENERATOR API
// ============================================================

// --- Кабинеты ---
app.get("/api/rooms", authMiddleware, async (req, res) => {
  const { dept } = req.query;
  const params = dept ? [dept] : [];
  const q = dept
    ? "SELECT * FROM rooms WHERE dept=$1 ORDER BY name"
    : "SELECT * FROM rooms ORDER BY dept, name";
  const r = await db.query(q, params);
  res.json({ rooms: r.rows });
});

app.post("/api/rooms", authMiddleware, requireHead, async (req, res) => {
  const { dept, name, capacity, notes } = req.body || {};
  if (!dept || !name) return res.status(400).json({ error: "bad_request" });
  try {
    const r = await db.query(
      "INSERT INTO rooms (dept, name, capacity, notes) VALUES ($1,$2,$3,$4) ON CONFLICT (dept,name) DO UPDATE SET capacity=EXCLUDED.capacity, notes=EXCLUDED.notes RETURNING *",
      [dept, name, capacity || 30, notes || null]
    );
    res.json({ room: r.rows[0] });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete("/api/rooms/:id", authMiddleware, requireHead, async (req, res) => {
  await db.query("DELETE FROM rooms WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// --- Доступность учителей ---
app.get("/api/availability", authMiddleware, async (req, res) => {
  const { teacher_id, dept } = req.query;
  let q = "SELECT a.*, u.name as teacher_name FROM teacher_availability a JOIN users u ON u.id=a.teacher_id WHERE 1=1";
  const params = [];
  if (teacher_id) { params.push(teacher_id); q += ` AND a.teacher_id=$${params.length}`; }
  if (dept)       { params.push(dept);       q += ` AND (a.dept=$${params.length} OR a.dept IS NULL)`; }
  q += " ORDER BY u.name, a.day_of_week, a.lesson_no";
  const r = await db.query(q, params);
  res.json({ availability: r.rows });
});

// Сохранить всю сетку доступности учителя (bulk upsert)
// Body: { teacher_id, dept, slots: [{day_of_week, lesson_no, available, note}] }
app.post("/api/availability", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  const { teacher_id, dept, slots } = req.body || {};
  if (!Array.isArray(slots)) return res.status(400).json({ error: "bad_request" });
  // Teacher can only edit own availability; head can edit anyone's
  const targetId = (u.role === "head" && teacher_id) ? parseInt(teacher_id) : req.userId;
  if (u.role !== "head" && targetId !== req.userId) return res.status(403).json({ error: "forbidden" });
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    // Clear existing for this teacher+dept combination
    const depParam = dept || null;
    await client.query(
      "DELETE FROM teacher_availability WHERE teacher_id=$1 AND (dept=$2 OR ($2::text IS NULL AND dept IS NULL))",
      [targetId, depParam]
    );
    for (const s of slots) {
      await client.query(
        `INSERT INTO teacher_availability (teacher_id, dept, day_of_week, lesson_no, available, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [targetId, depParam, s.day_of_week, s.lesson_no, s.available ?? false, s.note || null]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, saved: slots.length });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: String(e.message) });
  } finally { client.release(); }
});

// --- Учебный план ---
app.get("/api/curriculum", authMiddleware, async (req, res) => {
  const { dept, cls } = req.query;
  let q = "SELECT c.*, u.name as teacher_name FROM curriculum c LEFT JOIN users u ON u.id=c.teacher_id WHERE 1=1";
  const params = [];
  if (dept) { params.push(dept); q += ` AND c.dept=$${params.length}`; }
  if (cls)  { params.push(cls);  q += ` AND c.cls=$${params.length}`; }
  q += " ORDER BY c.cls, c.subject_type, c.subject";
  const r = await db.query(q, params);
  res.json({ curriculum: r.rows });
});

app.post("/api/curriculum", authMiddleware, requireHead, async (req, res) => {
  const { dept, grade, cls, subject, hours_week, subject_type, teacher_id, notes } = req.body || {};
  if (!dept || !cls || !subject || !hours_week) return res.status(400).json({ error: "bad_request" });
  try {
    const r = await db.query(
      `INSERT INTO curriculum (dept, grade, cls, subject, hours_week, subject_type, teacher_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (dept, cls, subject)
       DO UPDATE SET grade=EXCLUDED.grade, hours_week=EXCLUDED.hours_week,
                     subject_type=EXCLUDED.subject_type, teacher_id=EXCLUDED.teacher_id, notes=EXCLUDED.notes
       RETURNING *`,
      [dept, grade || null, cls, subject, hours_week, subject_type || "main", teacher_id || null, notes || null]
    );
    res.json({ item: r.rows[0] });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete("/api/curriculum/:id", authMiddleware, requireHead, async (req, res) => {
  await db.query("DELETE FROM curriculum WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// Импорт учебного плана из xlsx
app.post("/api/curriculum/import", authMiddleware, requireHead, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  const dept = req.body.dept;
  if (!dept) return res.status(400).json({ error: "no_dept" });
  try {
    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    // Expected: строка заголовка: Класс | Предмет | Часов | Тип | Учитель
    const items = [];
    let headerRow = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowStr = r.map(v => String(v||"").toLowerCase()).join("|");
      if (rowStr.includes("класс") && rowStr.includes("предмет")) { headerRow = i; break; }
    }
    if (headerRow < 0) return res.status(400).json({ error: "header_not_found" });
    const hdr = rows[headerRow].map(v => String(v||"").toLowerCase().trim());
    const ci = (s) => hdr.findIndex(h => h.includes(s));
    const iCls = ci("класс"); const iSubj = ci("предмет"); const iHrs = ci("час");
    const iType = ci("тип"); const iTeacher = ci("учитель");
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const cls = row[iCls] != null ? String(row[iCls]).trim() : null;
      const subject = row[iSubj] != null ? String(row[iSubj]).trim() : null;
      const hrs = parseFloat(row[iHrs]);
      if (!cls || !subject || isNaN(hrs)) continue;
      const stype = iType >= 0 && row[iType] ? String(row[iType]).trim().toLowerCase() : "main";
      const teacherName = iTeacher >= 0 && row[iTeacher] ? String(row[iTeacher]).trim() : null;
      let teacher_id = null;
      if (teacherName) {
        const tu = await db.query("SELECT id FROM users WHERE name ILIKE $1 LIMIT 1", [teacherName]);
        if (tu.rows[0]) teacher_id = tu.rows[0].id;
      }
      const gradeMatch = cls.match(/^(\d+)/);
      items.push({ dept, grade: gradeMatch ? parseInt(gradeMatch[1]) : null, cls, subject, hours_week: hrs, subject_type: stype, teacher_id });
    }
    if (req.body.preview === "true") return res.json({ preview: items.slice(0, 50), total: items.length });
    let saved = 0;
    for (const it of items) {
      await db.query(
        `INSERT INTO curriculum (dept, grade, cls, subject, hours_week, subject_type, teacher_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (dept, cls, subject) DO UPDATE SET grade=EXCLUDED.grade, hours_week=EXCLUDED.hours_week,
           subject_type=EXCLUDED.subject_type, teacher_id=EXCLUDED.teacher_id`,
        [it.dept, it.grade, it.cls, it.subject, it.hours_week, it.subject_type, it.teacher_id]
      );
      saved++;
    }
    res.json({ ok: true, saved });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// --- Профильные группы ---
app.get("/api/profile-groups", authMiddleware, async (req, res) => {
  const { dept, cls } = req.query;
  let q = "SELECT g.*, u.name as teacher_name FROM profile_groups g LEFT JOIN users u ON u.id=g.teacher_id WHERE 1=1";
  const params = [];
  if (dept) { params.push(dept); q += ` AND g.dept=$${params.length}`; }
  if (cls)  { params.push(cls);  q += ` AND g.cls=$${params.length}`; }
  q += " ORDER BY g.cls, g.group_name";
  const r = await db.query(q, params);
  res.json({ groups: r.rows });
});

app.post("/api/profile-groups", authMiddleware, requireHead, async (req, res) => {
  const { dept, cls, group_name, group_code, subject, exam_type, teacher_id, notes } = req.body || {};
  if (!dept || !cls || !group_name || !group_code) return res.status(400).json({ error: "bad_request" });
  try {
    const r = await db.query(
      `INSERT INTO profile_groups (dept, cls, group_name, group_code, subject, exam_type, teacher_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [dept, cls, group_name, group_code, subject || null, exam_type || null, teacher_id || null, notes || null]
    );
    res.json({ group: r.rows[0] });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.patch("/api/profile-groups/:id", authMiddleware, requireHead, async (req, res) => {
  const { group_name, group_code, subject, exam_type, teacher_id, notes } = req.body || {};
  const fields = [], vals = [];
  if (group_name !== undefined) { fields.push(`group_name=$${fields.length+1}`); vals.push(group_name); }
  if (group_code !== undefined) { fields.push(`group_code=$${fields.length+1}`); vals.push(group_code); }
  if (subject    !== undefined) { fields.push(`subject=$${fields.length+1}`);    vals.push(subject); }
  if (exam_type  !== undefined) { fields.push(`exam_type=$${fields.length+1}`);  vals.push(exam_type); }
  if (teacher_id !== undefined) { fields.push(`teacher_id=$${fields.length+1}`); vals.push(teacher_id); }
  if (notes      !== undefined) { fields.push(`notes=$${fields.length+1}`);      vals.push(notes); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  const r = await db.query(`UPDATE profile_groups SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
  res.json({ group: r.rows[0] });
});

app.delete("/api/profile-groups/:id", authMiddleware, requireHead, async (req, res) => {
  await db.query("DELETE FROM profile_groups WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// --- Версии расписаний ---
app.get("/api/schedule-versions", authMiddleware, async (req, res) => {
  const { dept } = req.query;
  const params = dept ? [dept] : [];
  const q = dept
    ? "SELECT v.*, u.name as created_by_name FROM schedule_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.dept=$1 ORDER BY v.created_at DESC"
    : "SELECT v.*, u.name as created_by_name FROM schedule_versions v LEFT JOIN users u ON u.id=v.created_by ORDER BY v.created_at DESC";
  const r = await db.query(q, params);
  res.json({ versions: r.rows });
});

app.post("/api/schedule-versions", authMiddleware, requireHead, async (req, res) => {
  const { dept, name, week_start, notes } = req.body || {};
  if (!dept || !name) return res.status(400).json({ error: "bad_request" });
  const r = await db.query(
    "INSERT INTO schedule_versions (dept, name, week_start, status, created_by, notes) VALUES ($1,$2,$3,'draft',$4,$5) RETURNING *",
    [dept, name, week_start || null, req.userId, notes || null]
  );
  res.json({ version: r.rows[0] });
});

app.patch("/api/schedule-versions/:id", authMiddleware, requireHead, async (req, res) => {
  const { status, name, notes } = req.body || {};
  const fields = [], vals = [];
  if (status !== undefined) { fields.push(`status=$${fields.length+1}`); vals.push(status); }
  if (name   !== undefined) { fields.push(`name=$${fields.length+1}`);   vals.push(name); }
  if (notes  !== undefined) { fields.push(`notes=$${fields.length+1}`);  vals.push(notes); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  const r = await db.query(`UPDATE schedule_versions SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
  res.json({ version: r.rows[0] });
});

// --- Слоты расписания (версии) ---
app.get("/api/schedule-slots/:version_id", authMiddleware, async (req, res) => {
  const r = await db.query(
    `SELECT s.*, u.name as teacher_name, ro.name as room_name, g.group_name, g.group_code
     FROM schedule_slots s
     LEFT JOIN users u ON u.id=s.teacher_id
     LEFT JOIN rooms ro ON ro.id=s.room_id
     LEFT JOIN profile_groups g ON g.id=s.group_id
     WHERE s.version_id=$1 ORDER BY s.day_of_week, s.lesson_no, s.cls`,
    [req.params.version_id]
  );
  res.json({ slots: r.rows });
});

app.post("/api/schedule-slots/:version_id", authMiddleware, requireHead, async (req, res) => {
  const slots = Array.isArray(req.body) ? req.body : [req.body];
  const version_id = parseInt(req.params.version_id);
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const created = [];
    for (const s of slots) {
      const r = await client.query(
        `INSERT INTO schedule_slots (version_id, dept, day_of_week, lesson_no, time_start, time_end, cls, subject, teacher_id, room_id, group_id, slot_type, is_double, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [version_id, s.dept, s.day_of_week, s.lesson_no, s.time_start||null, s.time_end||null, s.cls, s.subject, s.teacher_id||null, s.room_id||null, s.group_id||null, s.slot_type||"main", s.is_double||false, s.notes||null]
      );
      created.push(r.rows[0]);
    }
    await client.query("COMMIT");
    res.json({ created });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: String(e.message) });
  } finally { client.release(); }
});

app.delete("/api/schedule-slots/:version_id/all", authMiddleware, requireHead, async (req, res) => {
  await db.query("DELETE FROM schedule_slots WHERE version_id=$1", [req.params.version_id]);
  res.json({ ok: true });
});

app.delete("/api/schedule-slots/slot/:id", authMiddleware, requireHead, async (req, res) => {
  await db.query("DELETE FROM schedule_slots WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// === Generate Schedule (lightweight server-side validation only; main CSP runs client-side) ===
// POST /api/generate — validate payload, optionally run server-side CSP, save version+slots
app.post("/api/generate", authMiddleware, requireHead, async (req, res) => {
  // The main CSP engine runs client-side (scheduler is in app.js).
  // This endpoint is a fallback server-side generator: it receives dept+version info
  // and can create the version record. Full generation is done client-side then
  // slots are POSTed to /api/schedule-slots/:version_id.
  // This endpoint simply validates and returns OK so the client can proceed.
  const { dept, name, week_start } = req.body;
  if (!dept || !name) return res.status(400).json({ error: "dept и name обязательны" });
  try {
    // Check curriculum exists
    const cr = await db.query("SELECT COUNT(*) FROM curriculum WHERE dept=$1", [dept]);
    const count = parseInt(cr.rows[0].count);
    if (count === 0) return res.status(400).json({ error: "Учебный план не загружен для этого отделения" });
    res.json({ ok: true, message: "Генерация доступна", curriculum_count: count });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// WEB PUSH
// ============================================================
const webpush = require("web-push");
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "BGPDVBPRNGbXufaQkIvS9Em86-CqmVxWHv4NmAUE4Ox0pJ_UQFdPWiuBoG8Z9maeRqNOS3MAMFpr3G4LsKcQqu0";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "UqPDr_8--1H_dGrdJAm3ENOENBv3_PsZot8Hz_aL-Q4";
webpush.setVapidDetails("mailto:admin@intellekt-plus.ru", VAPID_PUBLIC, VAPID_PRIVATE);

// GET /api/push/vapid-public-key
app.get("/api/push/vapid-public-key", (req, res) => res.json({ key: VAPID_PUBLIC }));

// POST /api/push/subscribe — save push subscription for current user
app.post("/api/push/subscribe", authMiddleware, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: "bad_subscription" });
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
    [req.userId, endpoint, keys.p256dh, keys.auth]
  );
  res.json({ ok: true });
});

// DELETE /api/push/subscribe — remove subscription
app.delete("/api/push/subscribe", authMiddleware, async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) {
    await db.query("DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2", [req.userId, endpoint]);
  } else {
    await db.query("DELETE FROM push_subscriptions WHERE user_id=$1", [req.userId]);
  }
  res.json({ ok: true });
});

// Helper: send push to a user
async function sendPushToUser(userId, title, body, url = "/") {
  try {
    const subs = await db.query("SELECT * FROM push_subscriptions WHERE user_id=$1", [userId]);
    const payload = JSON.stringify({ title, body, url, icon: "/icon-192.png", tag: "ip-" + Date.now() });
    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (e) {
        // Remove expired subscriptions
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.query("DELETE FROM push_subscriptions WHERE id=$1", [sub.id]);
        }
      }
    }
  } catch (e) {
    console.error("Push error:", e.message);
  }
}

// ============================================================
// REPLACEMENT CONFIRMATION (teacher accepts/declines their assignment)
// ============================================================

// PATCH /api/replacements/:id/respond — replacement teacher responds
app.patch("/api/replacements/:id/respond", authMiddleware, async (req, res) => {
  const { status } = req.body || {};
  if (!["confirmed", "declined"].includes(status)) return res.status(400).json({ error: "bad_status" });
  const r = await db.query("SELECT * FROM replacements WHERE id=$1", [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  const repl = r.rows[0];
  // Only the replacement teacher can respond
  if (repl.replacement_user_id !== req.userId) return res.status(403).json({ error: "forbidden" });
  await db.query(
    "UPDATE replacements SET response_status=$1, responded_at=NOW() WHERE id=$2",
    [status, req.params.id]
  );
  // Notify the head who created the replacement
  const creator = await db.query("SELECT * FROM users WHERE id=$1", [repl.created_by]);
  const responder = await db.query("SELECT name FROM users WHERE id=$1", [req.userId]);
  if (creator.rows[0]) {
    const statusLabel = status === "confirmed" ? "✅ подтвердил" : "❌ отклонил";
    const title = `Замена ${statusLabel}`;
    const body = `${responder.rows[0]?.name} ${statusLabel} замену на ${repl.day}, урок ${repl.lesson_no || ""} (${repl.subject || "—"}, ${repl.cls || "—"})`;
    await db.query("INSERT INTO notifications (to_user_id, title, body, replacement_id) VALUES ($1,$2,$3,$4)", [creator.rows[0].id, title, body, repl.id]);
    await sendPushToUser(creator.rows[0].id, title, body);
  }
  res.json({ ok: true });
});

// ============================================================
// ABSENCE REQUESTS (teacher self-report sick / personal day)
// ============================================================

// GET /api/absence-requests — teacher sees own, head sees all in their depts
app.get("/api/absence-requests", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  let rows;
  if (u.role === "head") {
    const depts = (u.depts && u.depts.length > 0) ? u.depts : (u.dept ? [u.dept] : []);
    rows = await db.query(
      `SELECT r.*, us.name as teacher_name, rv.name as reviewer_name
       FROM absence_requests r
       JOIN users us ON us.id = r.teacher_id
       LEFT JOIN users rv ON rv.id = r.reviewed_by
       WHERE r.dept = ANY($1)
       ORDER BY r.created_at DESC LIMIT 200`,
      [depts]
    );
  } else {
    rows = await db.query(
      `SELECT r.*, rv.name as reviewer_name
       FROM absence_requests r
       LEFT JOIN users rv ON rv.id = r.reviewed_by
       WHERE r.teacher_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [req.userId]
    );
  }
  res.json({ requests: rows.rows });
});

// POST /api/absence-requests — teacher submits their own absence
app.post("/api/absence-requests", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  const { start_date, end_date, kind, note } = req.body || {};
  if (!start_date || !end_date || !kind) return res.status(400).json({ error: "bad_request" });
  const dept = u.dept || (u.depts && u.depts[0]);
  if (!dept) return res.status(400).json({ error: "no_dept" });
  try {
    const r = await db.query(
      `INSERT INTO absence_requests (teacher_id, dept, start_date, end_date, kind, note, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [req.userId, dept, start_date, end_date, kind, note || null]
    );
    const req_ = r.rows[0];

    // Also create a user_absence record immediately (optimistic)
    await db.query(
      `INSERT INTO user_absences (user_id, start_date, end_date, kind, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.userId, start_date, end_date, kind, note || null, req.userId]
    );

    // Notify all heads of this dept
    const heads = await db.query(
      "SELECT id FROM users WHERE role='head' AND (dept=$1 OR $1=ANY(depts))",
      [dept]
    );
    const kindLabel = { sick: "больничный", personal: "личные обстоятельства", other: "отсутствие" }[kind] || kind;
    const dateRange = start_date === end_date ? start_date : `${start_date} — ${end_date}`;
    const title = `🤒 ${u.name} сообщает об отсутствии`;
    const body = `${u.name} не выйдет на работу: ${dateRange}\nПричина: ${kindLabel}${note ? "\n" + note : ""}\n\nНужно проверить расписание на замены.`;
    for (const h of heads.rows) {
      await db.query(
        "INSERT INTO notifications (to_user_id, title, body) VALUES ($1,$2,$3)",
        [h.id, title, body]
      );
      sendPushToUser(h.id, title, body).catch(() => {});
    }
    res.json({ request: req_ });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error", details: String(e.message) });
  }
});

// PATCH /api/absence-requests/:id — head confirms or declines
app.patch("/api/absence-requests/:id", authMiddleware, requireHead, async (req, res) => {
  const { status } = req.body || {};
  if (!["confirmed", "declined"].includes(status)) return res.status(400).json({ error: "bad_status" });
  const upd = await db.query(
    `UPDATE absence_requests SET status=$1, reviewed_by=$2, reviewed_at=NOW()
     WHERE id=$3 RETURNING *, (SELECT name FROM users WHERE id=teacher_id) as teacher_name`,
    [status, req.userId, req.params.id]
  );
  if (!upd.rows[0]) return res.status(404).json({ error: "not_found" });
  const req_ = upd.rows[0];

  // Notify the teacher about decision
  const statusLabel = status === "confirmed" ? "✅ подтверждено" : "❌ отклонено";
  await db.query(
    "INSERT INTO notifications (to_user_id, title, body) VALUES ($1,$2,$3)",
    [req_.teacher_id, `Заявка на отсутствие ${statusLabel}`, `Ваша заявка на ${req_.start_date}–${req_.end_date} ${statusLabel.toLowerCase()}.`]
  );
  res.json({ request: req_ });
});

// GET /api/absence-requests/suggest-replacements?teacher_id=&date= — suggest free teachers
app.get("/api/absence-requests/suggest-replacements", authMiddleware, async (req, res) => {
  const { teacher_id, date } = req.query;
  if (!teacher_id || !date) return res.status(400).json({ error: "bad_request" });

  // Get absent teacher info
  const absentUser = await db.query("SELECT * FROM users WHERE id=$1", [teacher_id]);
  if (!absentUser.rows[0]) return res.status(404).json({ error: "not_found" });
  const absent = absentUser.rows[0];
  const dept = absent.dept || (absent.depts && absent.depts[0]);

  // Get all teachers in same dept (excluding absent teacher)
  const teachers = await db.query(
    `SELECT id, name, subjects, dept, depts FROM users
     WHERE role='teacher' AND COALESCE(is_active, TRUE) = TRUE
       AND (dept=$1 OR $1=ANY(depts)) AND id != $2`,
    [dept, teacher_id]
  );

  // Check which teachers are absent on that date
  const absent_ids_r = await db.query(
    `SELECT user_id FROM user_absences
     WHERE start_date <= $1 AND end_date >= $1`,
    [date]
  );
  const absentIds = new Set(absent_ids_r.rows.map(r => r.user_id));

  // Filter out absent teachers; prefer those who share subjects with absent teacher
  const absentSubjects = new Set(absent.subjects || []);
  const available = teachers.rows
    .filter(t => !absentIds.has(t.id))
    .map(t => {
      const tSubjects = new Set(t.subjects || []);
      const overlap = [...absentSubjects].filter(s => tSubjects.has(s));
      return { ...t, subject_overlap: overlap, overlap_count: overlap.length };
    })
    .sort((a, b) => b.overlap_count - a.overlap_count);

  res.json({ available, dept, absent: absent });
});

// ============================================================
// INTERNAL CHAT
// ============================================================

// Helper: ensure dept room exists for a dept
async function ensureDeptRoom(dept) {
  const ex = await db.query("SELECT id FROM chat_rooms WHERE kind='dept' AND dept=$1", [dept]);
  if (ex.rows[0]) return ex.rows[0].id;
  const r = await db.query(
    "INSERT INTO chat_rooms (kind, dept, name) VALUES ('dept',$1,$2) RETURNING id",
    [dept, dept]
  );
  return r.rows[0].id;
}

// GET /api/chat/rooms — list rooms user is in (all dept rooms for their dept + private rooms)
app.get("/api/chat/rooms", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  const depts = (u.depts && u.depts.length > 0) ? u.depts : (u.dept ? [u.dept] : []);

  // Ensure dept rooms exist
  for (const d of depts) await ensureDeptRoom(d);

  // Get dept rooms
  const deptRooms = depts.length > 0 ? await db.query(
    `SELECT r.id, r.kind, r.dept, r.name,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.room_id=r.id AND NOT m.is_deleted
               AND m.sent_at > COALESCE((SELECT last_read_at FROM chat_room_reads rd WHERE rd.room_id=r.id AND rd.user_id=$1), '1970-01-01')) as unread_count,
            (SELECT m.body FROM chat_messages m WHERE m.room_id=r.id AND NOT m.is_deleted ORDER BY m.sent_at DESC LIMIT 1) as last_message,
            (SELECT m.sent_at FROM chat_messages m WHERE m.room_id=r.id AND NOT m.is_deleted ORDER BY m.sent_at DESC LIMIT 1) as last_message_at
     FROM chat_rooms r WHERE r.kind='dept' AND r.dept=ANY($2) ORDER BY r.dept`,
    [req.userId, depts]
  ) : { rows: [] };

  // Get private rooms where this user is a member
  const privateRooms = await db.query(
    `SELECT r.id, r.kind, r.dept, r.name,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.room_id=r.id AND NOT m.is_deleted
               AND m.sent_at > COALESCE((SELECT last_read_at FROM chat_room_reads rd WHERE rd.room_id=r.id AND rd.user_id=$1), '1970-01-01')) as unread_count,
            (SELECT m.body FROM chat_messages m WHERE m.room_id=r.id AND NOT m.is_deleted ORDER BY m.sent_at DESC LIMIT 1) as last_message,
            (SELECT m.sent_at FROM chat_messages m WHERE m.room_id=r.id AND NOT m.is_deleted ORDER BY m.sent_at DESC LIMIT 1) as last_message_at,
            (SELECT array_agg(u2.name) FROM chat_room_members cm2 JOIN users u2 ON u2.id=cm2.user_id WHERE cm2.room_id=r.id AND cm2.user_id != $1) as other_names
     FROM chat_rooms r
     JOIN chat_room_members cm ON cm.room_id=r.id AND cm.user_id=$1
     WHERE r.kind='private'
     ORDER BY last_message_at DESC NULLS LAST`,
    [req.userId]
  );

  res.json({ rooms: [...deptRooms.rows, ...privateRooms.rows] });
});

// POST /api/chat/rooms/private — create or find private room with another user
app.post("/api/chat/rooms/private", authMiddleware, async (req, res) => {
  const { other_user_id } = req.body || {};
  if (!other_user_id) return res.status(400).json({ error: "other_user_id required" });
  const otherId = parseInt(other_user_id);
  if (otherId === req.userId) return res.status(400).json({ error: "cannot_self" });

  // Check if room already exists
  const ex = await db.query(
    `SELECT r.id FROM chat_rooms r
     JOIN chat_room_members m1 ON m1.room_id=r.id AND m1.user_id=$1
     JOIN chat_room_members m2 ON m2.room_id=r.id AND m2.user_id=$2
     WHERE r.kind='private' LIMIT 1`,
    [req.userId, otherId]
  );
  if (ex.rows[0]) return res.json({ room_id: ex.rows[0].id });

  // Create new private room
  const r = await db.query("INSERT INTO chat_rooms (kind) VALUES ('private') RETURNING id");
  const room_id = r.rows[0].id;
  await db.query("INSERT INTO chat_room_members (room_id, user_id) VALUES ($1,$2),($1,$3)", [room_id, req.userId, otherId]);
  res.json({ room_id });
});

// GET /api/chat/rooms/:id/messages — fetch messages (with pagination)
app.get("/api/chat/rooms/:id/messages", authMiddleware, async (req, res) => {
  const room_id = parseInt(req.params.id);
  const u = await getUserById(req.userId);
  const depts = (u.depts && u.depts.length > 0) ? u.depts : (u.dept ? [u.dept] : []);

  // Check access: dept room in user's dept, or private room where user is member
  const room = await db.query("SELECT * FROM chat_rooms WHERE id=$1", [room_id]);
  if (!room.rows[0]) return res.status(404).json({ error: "not_found" });
  const rm = room.rows[0];
  if (rm.kind === "dept" && !depts.includes(rm.dept)) return res.status(403).json({ error: "forbidden" });
  if (rm.kind === "private") {
    const mem = await db.query("SELECT 1 FROM chat_room_members WHERE room_id=$1 AND user_id=$2", [room_id, req.userId]);
    if (!mem.rows[0]) return res.status(403).json({ error: "forbidden" });
  }

  const before = req.query.before; // ISO date for pagination
  const limit = Math.min(parseInt(req.query.limit || "50"), 100);
  let rows;
  if (before) {
    rows = await db.query(
      `SELECT m.*, u.name as sender_name FROM chat_messages m
       JOIN users u ON u.id=m.sender_id
       WHERE m.room_id=$1 AND NOT m.is_deleted AND m.sent_at < $2
       ORDER BY m.sent_at DESC LIMIT $3`,
      [room_id, before, limit]
    );
  } else {
    rows = await db.query(
      `SELECT m.*, u.name as sender_name FROM chat_messages m
       JOIN users u ON u.id=m.sender_id
       WHERE m.room_id=$1 AND NOT m.is_deleted
       ORDER BY m.sent_at DESC LIMIT $2`,
      [room_id, limit]
    );
  }

  // Mark as read
  await db.query(
    `INSERT INTO chat_room_reads (room_id, user_id, last_read_at) VALUES ($1,$2,NOW())
     ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_at=NOW()`,
    [room_id, req.userId]
  );

  res.json({ messages: rows.rows.reverse() });
});

// POST /api/chat/rooms/:id/messages — send a message
app.post("/api/chat/rooms/:id/messages", authMiddleware, async (req, res) => {
  const room_id = parseInt(req.params.id);
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "empty_message" });
  const u = await getUserById(req.userId);
  const depts = (u.depts && u.depts.length > 0) ? u.depts : (u.dept ? [u.dept] : []);

  // Check access
  const room = await db.query("SELECT * FROM chat_rooms WHERE id=$1", [room_id]);
  if (!room.rows[0]) return res.status(404).json({ error: "not_found" });
  const rm = room.rows[0];
  if (rm.kind === "dept" && !depts.includes(rm.dept)) return res.status(403).json({ error: "forbidden" });
  if (rm.kind === "private") {
    const mem = await db.query("SELECT 1 FROM chat_room_members WHERE room_id=$1 AND user_id=$2", [room_id, req.userId]);
    if (!mem.rows[0]) return res.status(403).json({ error: "forbidden" });
  }

  const r = await db.query(
    "INSERT INTO chat_messages (room_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *, $4::text as sender_name",
    [room_id, req.userId, body.trim(), u.name]
  );
  // Update read status for sender
  await db.query(
    `INSERT INTO chat_room_reads (room_id, user_id, last_read_at) VALUES ($1,$2,NOW())
     ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_at=NOW()`,
    [room_id, req.userId]
  );
  res.json({ message: r.rows[0] });
});

// GET /api/chat/unread — total unread message count for current user
app.get("/api/chat/unread", authMiddleware, async (req, res) => {
  const u = await getUserById(req.userId);
  const depts = (u.depts && u.depts.length > 0) ? u.depts : (u.dept ? [u.dept] : []);

  let total = 0;
  // Dept rooms
  if (depts.length > 0) {
    const r = await db.query(
      `SELECT COUNT(*) FROM chat_messages m
       JOIN chat_rooms r ON r.id=m.room_id
       WHERE r.kind='dept' AND r.dept=ANY($1) AND NOT m.is_deleted AND m.sender_id != $2
       AND m.sent_at > COALESCE((SELECT last_read_at FROM chat_room_reads rd WHERE rd.room_id=m.room_id AND rd.user_id=$2), '1970-01-01')`,
      [depts, req.userId]
    );
    total += parseInt(r.rows[0].count);
  }
  // Private rooms
  const r2 = await db.query(
    `SELECT COUNT(*) FROM chat_messages m
     JOIN chat_room_members cm ON cm.room_id=m.room_id AND cm.user_id=$1
     WHERE NOT m.is_deleted AND m.sender_id != $1
     AND m.sent_at > COALESCE((SELECT last_read_at FROM chat_room_reads rd WHERE rd.room_id=m.room_id AND rd.user_id=$1), '1970-01-01')`,
    [req.userId]
  );
  total += parseInt(r2.rows[0].count);
  res.json({ unread: total });
});

// ============================================================
// STATISTICS & REPORTS
// ============================================================

// GET /api/stats/replacements — replacement count by dept/teacher/period
// Query params: dept, from_date, to_date, group_by (dept|teacher|day)
app.get("/api/stats/replacements", authMiddleware, requireHead, async (req, res) => {
  const { dept, from_date, to_date, group_by } = req.query;
  const params = [];
  const conditions = [];

  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  if (dept) {
    if (!allowedDepts.includes(dept)) return res.status(403).json({ error: "wrong_dept" });
    params.push(dept);
    conditions.push(`r.dept=$${params.length}`);
  } else {
    params.push(allowedDepts);
    conditions.push(`r.dept=ANY($${params.length})`);
  }
  if (from_date) { params.push(from_date); conditions.push(`r.created_at::date >= $${params.length}`); }
  if (to_date)   { params.push(to_date);   conditions.push(`r.created_at::date <= $${params.length}`); }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  let rows;
  if (group_by === "teacher") {
    const r = await db.query(`
      SELECT u.name as teacher_name, u.id as teacher_id,
             COUNT(*) FILTER (WHERE r.absent_user_id=u.id) as absent_count,
             COUNT(*) FILTER (WHERE r.replacement_user_id=u.id) as replacement_count
      FROM replacements r
      JOIN users u ON u.id=r.absent_user_id OR u.id=r.replacement_user_id
      ${where}
      GROUP BY u.id, u.name ORDER BY absent_count DESC`, params);
    rows = r.rows;
  } else if (group_by === "day") {
    const r = await db.query(`
      SELECT r.day, COUNT(*) as count, r.dept
      FROM replacements r ${where}
      GROUP BY r.day, r.dept ORDER BY r.dept, r.day`, params);
    rows = r.rows;
  } else {
    // group by dept (default)
    const r = await db.query(`
      SELECT r.dept, COUNT(*) as total,
             COUNT(DISTINCT r.absent_user_id) as absent_teachers,
             COUNT(DISTINCT r.day) as days_with_replacements
      FROM replacements r ${where}
      GROUP BY r.dept ORDER BY total DESC`, params);
    rows = r.rows;
  }
  res.json({ rows });
});

// GET /api/stats/workload — teacher lesson count per week from schedule
// Returns per-teacher lesson count computed from current schedule (static + edits)
app.get("/api/stats/workload", authMiddleware, requireHead, async (req, res) => {
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  const { dept } = req.query;
  if (dept && !allowedDepts.includes(dept)) return res.status(403).json({ error: "wrong_dept" });
  const depts = dept ? [dept] : allowedDepts;

  // Build merged schedule (same logic as /api/schedule)
  const sched = JSON.parse(JSON.stringify(SCHEDULE));
  try {
    const ovr = await db.query("SELECT dept, data FROM schedule_overrides");
    for (const row of ovr.rows) sched[row.dept] = row.data;
    const edits = await db.query("SELECT * FROM schedule_edits");
    for (const ed of edits.rows) {
      if (!sched[ed.dept]) continue;
      const days = sched[ed.dept].schedule;
      if (!days[ed.day]) days[ed.day] = {};
      let lesson = days[ed.day][ed.lesson_key];
      if (!lesson) { lesson = { lesson_no: ed.lesson_no, time: ed.time, classes: {} }; days[ed.day][ed.lesson_key] = lesson; }
      if (ed.cleared) { delete lesson.classes[ed.cls]; continue; }
      const cellInfo = {};
      if (ed.groups) cellInfo.groups = ed.groups;
      else { cellInfo.subject = ed.subject; cellInfo.teacher = ed.teacher; }
      cellInfo.room = ed.room;
      lesson.classes[ed.cls] = cellInfo;
    }
  } catch (e) {}

  // Count lessons per teacher
  const teacherLoad = {}; // name -> { lessons_per_week, subjects: Set, classes: Set, depts: Set }
  for (const deptName of depts) {
    if (!sched[deptName]) continue;
    const days = sched[deptName].schedule || {};
    for (const day of Object.values(days)) {
      for (const ldata of Object.values(day)) {
        for (const cls of Object.keys(ldata.classes || {})) {
          const cell = ldata.classes[cls];
          const items = cell.groups ? cell.groups : [cell];
          for (const item of items) {
            if (!item.teacher) continue;
            if (!teacherLoad[item.teacher]) {
              teacherLoad[item.teacher] = { name: item.teacher, lessons_per_week: 0, subjects: new Set(), classes: new Set(), depts: new Set() };
            }
            const t = teacherLoad[item.teacher];
            t.lessons_per_week++;
            if (item.subject) t.subjects.add(item.subject);
            t.classes.add(cls);
            t.depts.add(deptName);
          }
        }
      }
    }
  }

  // Join with user data
  const users = await db.query("SELECT id, name, dept FROM users WHERE role='teacher' AND COALESCE(is_active, TRUE)=TRUE");
  const userMap = {};
  for (const u of users.rows) userMap[u.name] = u;

  const result = Object.values(teacherLoad).map(t => ({
    name: t.name,
    teacher_id: userMap[t.name]?.id || null,
    lessons_per_week: t.lessons_per_week,
    subjects: Array.from(t.subjects),
    classes: Array.from(t.classes).sort(),
    depts: Array.from(t.depts),
  })).sort((a, b) => b.lessons_per_week - a.lessons_per_week);

  res.json({ workload: result });
});

// GET /api/stats/workload/xlsx — download workload as Excel
app.get("/api/stats/workload/xlsx", authMiddleware, requireHead, async (req, res) => {
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  const { dept } = req.query;
  if (dept && !allowedDepts.includes(dept)) return res.status(403).json({ error: "wrong_dept" });
  const depts = dept ? [dept] : allowedDepts;

  // Same workload computation (inline)
  const sched = JSON.parse(JSON.stringify(SCHEDULE));
  try {
    const ovr = await db.query("SELECT dept, data FROM schedule_overrides");
    for (const row of ovr.rows) sched[row.dept] = row.data;
    const edits = await db.query("SELECT * FROM schedule_edits");
    for (const ed of edits.rows) {
      if (!sched[ed.dept]) continue;
      const days = sched[ed.dept].schedule;
      if (!days[ed.day]) days[ed.day] = {};
      let lesson = days[ed.day][ed.lesson_key];
      if (!lesson) { lesson = { lesson_no: ed.lesson_no, time: ed.time, classes: {} }; days[ed.day][ed.lesson_key] = lesson; }
      if (ed.cleared) { delete lesson.classes[ed.cls]; continue; }
      const cellInfo = {};
      if (ed.groups) cellInfo.groups = ed.groups;
      else { cellInfo.subject = ed.subject; cellInfo.teacher = ed.teacher; }
      lesson.classes[ed.cls] = cellInfo;
    }
  } catch (e) {}

  const teacherLoad = {};
  for (const deptName of depts) {
    if (!sched[deptName]) continue;
    const days = sched[deptName].schedule || {};
    for (const day of Object.values(days)) {
      for (const ldata of Object.values(day)) {
        for (const cls of Object.keys(ldata.classes || {})) {
          const cell = ldata.classes[cls];
          const items = cell.groups ? cell.groups : [cell];
          for (const item of items) {
            if (!item.teacher) continue;
            if (!teacherLoad[item.teacher]) teacherLoad[item.teacher] = { name: item.teacher, lessons: 0, subjects: new Set(), classes: new Set(), depts: new Set() };
            const t = teacherLoad[item.teacher];
            t.lessons++; if (item.subject) t.subjects.add(item.subject); t.classes.add(cls); t.depts.add(deptName);
          }
        }
      }
    }
  }

  // Get replacement counts per teacher
  const replStats = await db.query(
    `SELECT u.name, COUNT(*) FILTER (WHERE r.absent_user_id=u.id) as absent_count,
                   COUNT(*) FILTER (WHERE r.replacement_user_id=u.id) as gave_replacements
     FROM users u
     LEFT JOIN replacements r ON r.absent_user_id=u.id OR r.replacement_user_id=u.id
     WHERE u.role='teacher' GROUP BY u.name`
  );
  const replMap = {};
  for (const r of replStats.rows) replMap[r.name] = r;

  const rows = [["ФИО учителя", "Уроков в неделю", "Предметы", "Классы", "Отделения", "Всего замен (был отсутствующим)", "Всего замен (заменял)"]];
  for (const t of Object.values(teacherLoad).sort((a, b) => b.lessons - a.lessons)) {
    const rs = replMap[t.name] || {};
    rows.push([
      t.name,
      t.lessons,
      Array.from(t.subjects).join(", "),
      Array.from(t.classes).sort().join(", "),
      Array.from(t.depts).join(", "),
      parseInt(rs.absent_count || 0),
      parseInt(rs.gave_replacements || 0),
    ]);
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 25 }];
  xlsx.utils.book_append_sheet(wb, ws, "Нагрузка учителей");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="workload-${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.send(buf);
});

// GET /api/stats/replacements/xlsx — download replacements as Excel
app.get("/api/stats/replacements/xlsx", authMiddleware, requireHead, async (req, res) => {
  const { dept, from_date, to_date } = req.query;
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  if (dept && !allowedDepts.includes(dept)) return res.status(403).json({ error: "wrong_dept" });
  const depts = dept ? [dept] : allowedDepts;
  const params = [depts];
  const conditions = ["r.dept=ANY($1)"];
  if (from_date) { params.push(from_date); conditions.push(`r.created_at::date >= $${params.length}`); }
  if (to_date)   { params.push(to_date);   conditions.push(`r.created_at::date <= $${params.length}`); }
  const where = "WHERE " + conditions.join(" AND ");

  const r = await db.query(`
    SELECT r.day, r.dept, r.cls, r.lesson_no, r.time, r.subject, r.room,
           a.name as absent_name, rp.name as replacement_name,
           r.response_status, r.comment, r.created_at::date as date_created
    FROM replacements r
    LEFT JOIN users a ON a.id=r.absent_user_id
    LEFT JOIN users rp ON rp.id=r.replacement_user_id
    ${where} ORDER BY r.created_at DESC`, params);

  const rows = [["Дата", "Отделение", "Класс", "Урок №", "Время", "Предмет", "Кабинет", "Отсутствовал", "Заменял", "Статус", "Причина"]];
  for (const rep of r.rows) {
    const status = rep.response_status === "confirmed" ? "Подтверждено" : rep.response_status === "declined" ? "Отклонено" : "Ожидание";
    rows.push([rep.day, rep.dept, rep.cls, rep.lesson_no, rep.time, rep.subject, rep.room, rep.absent_name, rep.replacement_name, status, rep.comment || ""]);
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 14 }, { wch: 30 }];
  xlsx.utils.book_append_sheet(wb, ws, "Замены");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="replacements-${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.send(buf);
});

// ============================================================
// ROOM CONFLICT CHECK
// ============================================================

// GET /api/schedule/room-conflicts — find all room conflicts in current schedule
app.get("/api/schedule/room-conflicts", authMiddleware, requireHead, async (req, res) => {
  const allowedDepts = req.user.depts && req.user.depts.length > 0 ? req.user.depts : [req.user.dept];
  const { dept } = req.query;
  if (dept && !allowedDepts.includes(dept)) return res.status(403).json({ error: "wrong_dept" });
  const depts = dept ? [dept] : allowedDepts;

  // Build merged schedule
  const sched = JSON.parse(JSON.stringify(SCHEDULE));
  try {
    const ovr = await db.query("SELECT dept, data FROM schedule_overrides");
    for (const row of ovr.rows) sched[row.dept] = row.data;
    const edits = await db.query("SELECT * FROM schedule_edits");
    for (const ed of edits.rows) {
      if (!sched[ed.dept]) continue;
      const days = sched[ed.dept].schedule;
      if (!days[ed.day]) days[ed.day] = {};
      let lesson = days[ed.day][ed.lesson_key];
      if (!lesson) { lesson = { lesson_no: ed.lesson_no, time: ed.time, classes: {} }; days[ed.day][ed.lesson_key] = lesson; }
      if (ed.cleared) { delete lesson.classes[ed.cls]; continue; }
      const cellInfo = {};
      if (ed.groups) cellInfo.groups = ed.groups;
      else { cellInfo.subject = ed.subject; cellInfo.teacher = ed.teacher; }
      cellInfo.room = ed.room;
      lesson.classes[ed.cls] = cellInfo;
    }
  } catch (e) {}

  // Find conflicts: same day + lesson_no + room across any two different cls/dept
  // key = day|lesson_no|room -> list of {dept, cls, subject, teacher}
  const roomSlots = {};
  for (const deptName of depts) {
    if (!sched[deptName]) continue;
    const days = sched[deptName].schedule || {};
    for (const [dayName, daySlots] of Object.entries(days)) {
      for (const [lkey, ldata] of Object.entries(daySlots)) {
        for (const [cls, cell] of Object.entries(ldata.classes || {})) {
          const items = cell.groups ? cell.groups : [cell];
          for (const item of items) {
            if (!item.room) continue;
            const key = `${dayName}|${ldata.lesson_no || lkey}|${item.room}`;
            if (!roomSlots[key]) roomSlots[key] = [];
            roomSlots[key].push({ dept: deptName, day: dayName, lesson_no: ldata.lesson_no, lesson_key: lkey, cls, room: item.room, subject: item.subject, teacher: item.teacher });
          }
        }
      }
    }
  }

  const conflicts = [];
  for (const [key, slots] of Object.entries(roomSlots)) {
    if (slots.length >= 2) {
      conflicts.push({ key, room: slots[0].room, day: slots[0].day, lesson_no: slots[0].lesson_no, slots });
    }
  }
  conflicts.sort((a, b) => a.day.localeCompare(b.day) || (a.lesson_no - b.lesson_no));
  res.json({ conflicts, total: conflicts.length });
});

// Also check room conflicts in schedule edit (non-blocking warning)
// GET /api/schedule/room-check?dept=&day=&lesson_no=&room=&exclude_cls=
app.get("/api/schedule/room-check", authMiddleware, async (req, res) => {
  const { dept, day, lesson_no, room, exclude_cls } = req.query;
  if (!dept || !day || !lesson_no || !room) return res.json({ conflict: false });

  // Get all schedule_edits for this slot
  const r = await db.query(
    "SELECT cls, subject, teacher FROM schedule_edits WHERE dept=$1 AND day=$2 AND lesson_no=$3 AND room=$4 AND (cleared IS NULL OR cleared=FALSE)",
    [dept, day, parseInt(lesson_no), room]
  );
  const conflicts = r.rows.filter(row => row.cls !== exclude_cls);
  if (conflicts.length > 0) {
    return res.json({ conflict: true, conflicting_lessons: conflicts });
  }
  res.json({ conflict: false });
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

// GET /api/events — Server-Sent Events stream for real-time schedule updates.
// Auth is optional: unauthenticated clients still receive public schedule-change events.
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Initial heartbeat so the browser knows the connection is alive
  res.write(": heartbeat\n\n");

  _sseClients.add(res);

  // Periodic heartbeat every 25s to prevent proxy timeouts
  const hbTimer = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch (_) {}
  }, 25000);

  req.on("close", () => {
    clearInterval(hbTimer);
    _sseClients.delete(res);
  });
});

// GET /api/public/depts — no auth; returns list of department names
app.get("/api/public/depts", (req, res) => {
  res.json({ depts: Object.keys(SCHEDULE).sort() });
});

// GET /api/public/schedule — no auth; returns full merged schedule for one class
// Query: ?dept=X&cls=Y (cls optional — returns all classes if omitted)
app.get("/api/public/schedule", async (req, res) => {
  const { dept, cls } = req.query;
  if (!dept) return res.status(400).json({ error: "dept_required" });
  try {
    const edits = await db.query("SELECT * FROM schedule_edits");
    const editMap = {};
    for (const e of edits.rows) {
      editMap[`${e.dept}|${e.day}|${e.lesson_key}|${e.cls}`] = e;
    }
    // Merge with static schedule
    const merged = {};
    const deptStatic = SCHEDULE[dept];
    if (!deptStatic) return res.status(404).json({ error: "dept_not_found" });
    for (const [day, lessons] of Object.entries(deptStatic.schedule || {})) {
      merged[day] = {};
      for (const [lkey, lesson] of Object.entries(lessons)) {
        const classes = {};
        for (const [c, info] of Object.entries(lesson.classes || {})) {
          if (cls && c !== cls) continue;
          const ek = `${dept}|${day}|${lkey}|${c}`;
          if (editMap[ek]) {
            const ed = editMap[ek];
            if (!ed.cleared) {
              classes[c] = { subject: ed.subject, teacher: ed.teacher, room: ed.room,
                             groups: ed.groups, lesson_no: ed.lesson_no, time: ed.time, _edited: true };
            }
          } else {
            classes[c] = info;
          }
        }
        if (Object.keys(classes).length > 0) {
          merged[day][lkey] = { ...lesson, classes };
        }
      }
    }
    res.json({ dept, classes: deptStatic.classes || [], schedule: merged });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
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
