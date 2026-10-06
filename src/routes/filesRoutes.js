// src/routes/filesRoutes.js

const express = require("express");
const router = express.Router();
const filesController = require("../controllers/filesController");
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");
const { uploadSingle } = require("../middleware/upload");

router.get("/files", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), filesController.listFiles);
router.post("/files/upload", auth, roleGuard(["Employee", "IT Admin"]), uploadSingle("file"), filesController.uploadFile);
router.get("/files/download", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), filesController.downloadFile);
router.get("/files/:fileId", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), filesController.getFile);
router.get("/files/:fileId/download-url", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), filesController.getDownloadUrl);
router.get("/files/:fileId/versions", auth, roleGuard(["Employee", "IT Admin", "Auditor"]), filesController.getVersions);

module.exports = router;
