// src/routes/backupRoutes.js

const express = require("express");
const router = express.Router();
const backupController = require("../controllers/backupController");
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");

router.post("/backups", auth, roleGuard(["Employee", "IT Admin"]), backupController.createBackup);
router.get("/backups", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), backupController.listBackups);
router.get("/backups/:backupId", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), backupController.getBackup);

module.exports = router;
