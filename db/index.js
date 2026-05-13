const { Pool } = require("pg");

// SSL: Render/Railway/Heroku all require SSL but with self-signed certs in production
const ssl = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
});

pool.on("error", (err) => {
  console.error("Postgres pool error:", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
