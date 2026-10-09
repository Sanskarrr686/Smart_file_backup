const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const auth = require("../middleware/auth");

router.get("/dashboard", auth, dashboardController.getDashboard); // GET /api/v1/ui/dashboard
router.get("/integrity", auth, dashboardController.getIntegrity); // GET /api/v1/ui/integrity

module.exports = router;
