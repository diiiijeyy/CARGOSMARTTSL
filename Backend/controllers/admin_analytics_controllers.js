const pool = require(".");

// ------------------------
// 1️⃣ KPIs
// ------------------------
async function getKpis(req, res) {
  try {
    // Monthly revenue
    const revenueRes = await pool.query(
      `SELECT SUM(revenue_amount) AS monthly_revenue
       FROM shipments
       WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)`
    );

    // Current bookings (pending or approved)
    const bookingsRes = await pool.query(
      `SELECT COUNT(*) AS current_bookings
       FROM shipments
       WHERE status IN ('pending','approved')`
    );

    // Active shipments (currently in transit)
    const activeRes = await pool.query(
      `SELECT COUNT(*) AS active_shipments
       FROM shipments
       WHERE status='in_transit'`
    );

    // Completed deliveries
    const completedRes = await pool.query(
      `SELECT COUNT(*) AS completed_deliveries
       FROM shipments
       WHERE status='delivered'`
    );

    res.json({
      monthly_revenue: Number(revenueRes.rows[0].monthly_revenue || 0),
      current_bookings: Number(bookingsRes.rows[0].current_bookings || 0),
      active_shipments: Number(activeRes.rows[0].active_shipments || 0),
      completed_deliveries: Number(completedRes.rows[0].completed_deliveries || 0)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching KPIs" });
  }
}


//Revenue Chart Data

async function getRevenue(req, res) {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(created_at, 'Mon') AS month,
             SUM(revenue_amount) AS total
      FROM shipments
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY month
      ORDER BY TO_DATE(month,'Mon')
    `);

    res.json(result.rows); // [{month: "Jan", total: 5000}, ...]
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching revenue" });
  }
}

//Payment Status Chart
async function getPaymentStatus(req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        SUM(CASE WHEN payment_status='on_time' THEN 1 ELSE 0 END) AS on_time,
        SUM(CASE WHEN payment_status='late_15' THEN 1 ELSE 0 END) AS late_15,
        SUM(CASE WHEN payment_status='late_30' THEN 1 ELSE 0 END) AS late_30,
        SUM(CASE WHEN payment_status='late_over_30' THEN 1 ELSE 0 END) AS late_over_30
      FROM payments
    `);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching payment status" });
  }
}

//. Booking Status Chart
async function getBookingStatus(req, res) {
  try {
    const result = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM shipments
      GROUP BY status
    `);

    res.json(result.rows); // [{status: "pending", count: 5}, ...]
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching booking status" });
  }
}

