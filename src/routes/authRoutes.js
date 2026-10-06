// src/routes/authRoutes.js

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");

router.post("/session", authController.login);
router.delete("/session", auth, authController.logout);
router.get("/me", auth, authController.me);
router.post("/session/change-password", auth, authController.changePassword);

module.exports = router;
