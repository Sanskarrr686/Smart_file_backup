const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const auth = require("../middleware/auth");

router.get("/dashboard", auth, dashboardController.getDashboard); // GET /api/v1/ui/dashboard

module.exports = router;
