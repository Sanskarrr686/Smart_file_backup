// src/routes/auditRoutes.js

const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");

router.get("/audit", auth, roleGuard(["IT Admin", "Auditor"]), auditController.getAuditLog);

module.exports = router;
