// Apply schema.sql to the DATABASE_URL.
// Usage: npm run migrate
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("./index");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  console.log("Running migrations...");
  await db.query(sql);
  console.log("Migrations applied.");
  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
