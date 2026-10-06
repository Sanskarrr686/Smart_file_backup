// src/routes/restoreRoutes.js

const express = require("express");
const router = express.Router();
const restoreController = require("../controllers/restoreController");
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");

router.get("/restores", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), restoreController.listRestores);
router.get("/restores/:restoreId", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), restoreController.getRestore);
router.post("/files/:fileId/versions/:versionId/restore", auth, roleGuard(["Employee", "IT Admin"]), restoreController.createRestore);
router.post("/restores/:restoreId/retry", auth, roleGuard(["Employee", "IT Admin"]), restoreController.retryRestore);

module.exports = router;
