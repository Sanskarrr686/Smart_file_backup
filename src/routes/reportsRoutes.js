// src/routes/reportsRoutes.js

const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reportsController");
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");

router.get("/reports/storage", auth, roleGuard(["IT Admin", "Auditor"]), reportsController.getStorageReport);
router.get("/reports/backups", auth, roleGuard(["IT Admin", "Auditor"]), reportsController.getBackupReport);
router.get("/reports/integrity", auth, roleGuard(["IT Admin", "Auditor"]), reportsController.getIntegrityReport);

module.exports = router;
