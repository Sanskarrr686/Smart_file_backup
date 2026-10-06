// src/routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const notificationService = require("../services/notificationService");
const { success } = require("../utils/response");

router.get("/notifications", auth, async (req, res, next) => {
  try {
    const result = await notificationService.listNotifications(req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/read", auth, async (req, res, next) => {
  try {
    const result = await notificationService.markAllAsRead(req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
