// src/services/notificationService.js

const db = require("../utils/db");
const sseManager = require("../utils/sse");
const crypto = require("crypto");

async function listNotifications(user) {
  const allNotifications = db.data.notifications || [];
  // Sort newest first
  const items = [...allNotifications].reverse();
  const unread_count = items.filter((n) => !n.read).length;
  return { items, unread_count };
}

async function createNotification({ title, message, type = "info", user_id = null }) {
  const notification = {
    id: "notif_" + crypto.randomBytes(3).toString("hex"),
    title,
    message,
    type,
    timestamp: new Date().toISOString(),
    read: false,
    user_id,
  };

  if (!db.data.notifications) {
    db.data.notifications = [];
  }
  db.data.notifications.push(notification);
  db.save();

  sseManager.broadcast({
    type: "notification_created",
    data: notification,
  });

  return notification;
}

async function markAllAsRead(user) {
  const allNotifications = db.data.notifications || [];
  allNotifications.forEach((n) => {
    n.read = true;
  });
  db.save();
  return listNotifications(user);
}

module.exports = {
  listNotifications,
  createNotification,
  markAllAsRead,
};
