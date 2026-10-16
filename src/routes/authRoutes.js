// src/routes/authRoutes.js

const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many login attempts, please try again after 15 minutes.",
        details: [],
      },
      meta: {
        correlation_id: req.correlationId || null,
      },
    });
  },
});

router.post("/session", loginRateLimiter, authController.login);
router.delete("/session", auth, authController.logout);
router.get("/me", auth, authController.me);
router.post("/session/change-password", auth, authController.changePassword);

module.exports = router;
