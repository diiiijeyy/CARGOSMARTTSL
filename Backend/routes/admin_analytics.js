const express = require("express");
const router = express.Router();
const { checkSuperAdmin } = require("../middleware/authMiddleware");
const {
  getKpis,
  getRevenue,
  getPaymentStatus,
  getBookingStatus
} = require("../controllers/analyticsController");

// All routes protected by super admin check
router.get("/kpis", checkSuperAdmin, getKpis);
router.get("/revenue", checkSuperAdmin, getRevenue);
router.get("/payment-status", checkSuperAdmin, getPaymentStatus);
router.get("/booking-status", checkSuperAdmin, getBookingStatus);

module.exports = router;