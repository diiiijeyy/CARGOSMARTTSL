const { Pool } = require("pg");
require("dotenv").config();

// Use Render PostgreSQL connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT NOW()", (err) => {
  if (err) console.error("❌ Database connection error:", err);
  else console.log("✅ Database connected successfully");
});

module.exports = pool;
