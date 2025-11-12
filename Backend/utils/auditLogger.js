const pool = require("../db"); // <-- Make sure this uses pg.Pool

async function logAction(user_email, action, ip_address, device_info, action_source) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_email, action, ip_address, device_info, action_source)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_email, action, ip_address, device_info, action_source]
    );
  } catch (err) {
    console.error("Error saving audit log:", err);
  }
}

module.exports = logAction;
