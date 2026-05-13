// Seed users from data/schedule.json — 3 dept heads + every teacher mentioned.
// Idempotent: re-running won't create duplicates and won't overwrite changed passwords.
// Usage: npm run seed
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const db = require("./index");

const DEPTS = ["Империал", "Пушкина", "Чкалова"];

const TRANSLIT = {
  "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"E","Ж":"Zh","З":"Z","И":"I","Й":"Y","К":"K","Л":"L","М":"M","Н":"N",
  "О":"O","П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"Kh","Ц":"Ts","Ч":"Ch","Ш":"Sh","Щ":"Sch","Ы":"Y","Э":"E","Ю":"Yu","Я":"Ya",
  "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n",
  "о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ы":"y","э":"e","ю":"yu","я":"ya",
  "ь":"","ъ":"","Ь":"","Ъ":""
};

function translit(s) {
  let r = "";
  for (const c of s) r += (TRANSLIT[c] !== undefined ? TRANSLIT[c] : c);
  return r;
}

function emailFromName(name) {
  const parts = name.trim().split(/\s+/);
  const surname = translit(parts[0] || "").toLowerCase().replace(/[^a-z]/g, "");
  let init = "";
  if (parts.length > 1) {
    init = translit(parts[1]).toLowerCase().replace(/[^a-z]/g, "").slice(0, 2);
  }
  return surname + (init ? "." + init : "") + "@intellekt-plus.ru";
}

function buildTeacherIndex(scheduleData) {
  const out = {};
  for (const dept of DEPTS) {
    if (!scheduleData[dept]) continue;
    const sched = scheduleData[dept].schedule;
    for (const day in sched) {
      for (const lkey in sched[day]) {
        const ld = sched[day][lkey];
        for (const cls in ld.classes) {
          const info = ld.classes[cls];
          const items = info.groups ? info.groups : [info];
          for (const it of items) {
            if (!it.teacher) continue;
            const t = it.teacher.trim();
            if (!t) continue;
            if (!out[t]) out[t] = { depts: new Set(), subjects: new Set() };
            out[t].depts.add(dept);
            if (it.subject) out[t].subjects.add(it.subject);
          }
        }
      }
    }
  }
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const dataPath = path.join(__dirname, "..", "data", "schedule.json");
  const scheduleData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const defaultPwd = process.env.DEFAULT_PASSWORD || "12345";
  const hash = await bcrypt.hash(defaultPwd, 10);

  // 3 heads
  const heads = [
    { email: "admin.imperial@intellekt-plus.ru", name: "Завуч Империал", dept: "Империал" },
    { email: "admin.pushkina@intellekt-plus.ru", name: "Завуч Пушкина", dept: "Пушкина" },
    { email: "admin.chkalova@intellekt-plus.ru", name: "Завуч Чкалова", dept: "Чкалова" },
  ];

  let createdHeads = 0;
  for (const h of heads) {
    const r = await db.query(
      `INSERT INTO users (email, name, role, dept, depts, password_hash, must_change)
       VALUES ($1, $2, 'head', $3, $4, $5, TRUE)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [h.email, h.name, h.dept, [h.dept], hash]
    );
    if (r.rowCount > 0) createdHeads++;
  }

  // Teachers
  const idx = buildTeacherIndex(scheduleData);
  let createdTeachers = 0;
  const usedEmails = new Set();
  // Pre-load existing emails to know what's taken
  const existing = await db.query("SELECT email FROM users");
  for (const r of existing.rows) usedEmails.add(r.email);

  for (const name in idx) {
    const info = idx[name];
    let email = emailFromName(name);
    let suffix = 1;
    while (usedEmails.has(email)) {
      email = emailFromName(name).replace("@", suffix + "@");
      suffix++;
    }
    usedEmails.add(email);
    const r = await db.query(
      `INSERT INTO users (email, name, role, dept, depts, subjects, password_hash, must_change)
       VALUES ($1, $2, 'teacher', $3, $4, $5, $6, TRUE)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, name, [...info.depts][0], [...info.depts], [...info.subjects], hash]
    );
    if (r.rowCount > 0) createdTeachers++;
  }

  const totalUsers = await db.query("SELECT COUNT(*) FROM users");
  console.log(`Seed complete:
  +${createdHeads} heads (new)
  +${createdTeachers} teachers (new)
  total users in DB: ${totalUsers.rows[0].count}
  default password: ${defaultPwd} (must change on first login)`);

  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
