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
    "SELECT id, email, name, role, dept, depts, subjects, must_change FROM users WHERE id=$1",
    [id]
  );
  return r.rows[0] || null;
}

// === Auth ===
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });
  const r = await db.query(
    "SELECT id, email, name, role, dept, depts, subjects, password_hash, must_change FROM users WHERE LOWER(email)=LOWER($1)",
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
      id: u.id, email: u.email, name: u.name, role: u.role,
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
    "SELECT id, email, name, role, dept, depts, subjects FROM users ORDER BY role DESC, name"
  );
  res.json({ accounts: r.rows });
});

// === Schedule (static, behind auth) ===
app.get("/api/schedule", authMiddleware, (req, res) => {
  res.json(SCHEDULE);
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
      console.log(`Users in DB: ${count}`);
    }
  } catch (e) {
    console.error("Bootstrap failed:", e);
  }
}

bootstrap().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
  });
});
