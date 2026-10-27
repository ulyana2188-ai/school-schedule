// One-time migration script: copies data from Neon (NEON_DATABASE_URL) to new DB (DATABASE_URL).
// Runs during the build step. Safe to run multiple times (uses INSERT ... ON CONFLICT DO NOTHING).
require("dotenv").config();
const { Pool } = require("pg");

const SOURCE_URL = process.env.NEON_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL;

if (!SOURCE_URL) { console.log("NEON_DATABASE_URL not set — skipping migration."); process.exit(0); }
if (!TARGET_URL) { console.error("DATABASE_URL not set"); process.exit(1); }
if (SOURCE_URL === TARGET_URL) { console.log("Source and target are the same — skipping migration."); process.exit(0); }

const src = new Pool({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
const tgt = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  console.log("Starting migration from Neon → Render PostgreSQL...");

  // 1. Users
  const { rows: users } = await src.query(`
    SELECT id, email, name, role, title, dept, depts, subjects,
           password_hash, must_change, is_active, created_at
    FROM users ORDER BY id
  `);
  console.log(`Migrating ${users.length} users...`);
  for (const u of users) {
    await tgt.query(`
      INSERT INTO users (id, email, name, role, title, dept, depts, subjects, password_hash, must_change, is_active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO NOTHING
    `, [u.id, u.email, u.name, u.role, u.title, u.dept, u.depts, u.subjects, u.password_hash, u.must_change, u.is_active, u.created_at]);
  }
  // Reset sequence
  const maxId = users.length ? Math.max(...users.map(u => u.id)) : 0;
  await tgt.query(`SELECT setval('users_id_seq', $1, true)`, [maxId]);
  console.log(`✓ Users done (${users.length})`);

  // 2. Replacements
  try {
    const { rows: repls } = await src.query(`SELECT * FROM replacements ORDER BY id`);
    console.log(`Migrating ${repls.length} replacements...`);
    for (const r of repls) {
      await tgt.query(`
        INSERT INTO replacements (id,day,time,dept,cls,lesson_no,lesson_key,absent_user_id,replacement_user_id,
          subject,room,created_by,created_at,comment,absent_name,replacement_name,response_status,responded_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (id) DO NOTHING
      `, [r.id,r.day,r.time,r.dept,r.cls,r.lesson_no,r.lesson_key,r.absent_user_id,r.replacement_user_id,
          r.subject,r.room,r.created_by,r.created_at,r.comment||null,r.absent_name||null,r.replacement_name||null,
          r.response_status||'pending',r.responded_at||null]);
    }
    if (repls.length) await tgt.query(`SELECT setval('replacements_id_seq', $1, true)`, [Math.max(...repls.map(r=>r.id))]);
    console.log(`✓ Replacements done (${repls.length})`);
  } catch(e) { console.log("Replacements skip:", e.message); }

  // 3. Schedule edits
  try {
    const { rows } = await src.query(`SELECT * FROM schedule_edits ORDER BY id`);
    console.log(`Migrating ${rows.length} schedule_edits...`);
    for (const r of rows) {
      await tgt.query(`
        INSERT INTO schedule_edits (id,dept,day,lesson_key,cls,lesson_no,time,subject,teacher,room,groups,cleared,edited_by,edited_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (dept,day,lesson_key,cls) DO NOTHING
      `, [r.id,r.dept,r.day,r.lesson_key,r.cls,r.lesson_no,r.time,r.subject,r.teacher,r.room,r.groups,r.cleared,r.edited_by,r.edited_at]);
    }
    if (rows.length) await tgt.query(`SELECT setval('schedule_edits_id_seq', $1, true)`, [Math.max(...rows.map(r=>r.id))]);
    console.log(`✓ schedule_edits done (${rows.length})`);
  } catch(e) { console.log("schedule_edits skip:", e.message); }

  // 4. Schedule overrides
  try {
    const { rows } = await src.query(`SELECT * FROM schedule_overrides`);
    console.log(`Migrating ${rows.length} schedule_overrides...`);
    for (const r of rows) {
      await tgt.query(`
        INSERT INTO schedule_overrides (dept,data,imported_by,imported_at)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (dept) DO UPDATE SET data=$2, imported_at=$4
      `, [r.dept, r.data, r.imported_by, r.imported_at]);
    }
    console.log(`✓ schedule_overrides done (${rows.length})`);
  } catch(e) { console.log("schedule_overrides skip:", e.message); }

  // 5. Rooms
  try {
    const { rows } = await src.query(`SELECT * FROM rooms ORDER BY id`);
    console.log(`Migrating ${rows.length} rooms...`);
    for (const r of rows) {
      await tgt.query(`
        INSERT INTO rooms (id,dept,name,capacity,notes,created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (dept,name) DO NOTHING
      `, [r.id,r.dept,r.name,r.capacity,r.notes,r.created_at]);
    }
    if (rows.length) await tgt.query(`SELECT setval('rooms_id_seq', $1, true)`, [Math.max(...rows.map(r=>r.id))]);
    console.log(`✓ rooms done (${rows.length})`);
  } catch(e) { console.log("rooms skip:", e.message); }

  console.log("✅ Migration complete!");
}

migrate()
  .catch(e => { console.error("Migration failed:", e.message); process.exit(1); })
  .finally(() => { src.end(); tgt.end(); });
