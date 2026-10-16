// src/services/userService.js

const teamCClient = require("../clients/teamCClient");

const VALID_ROLES = ["Employee", "IT Admin", "Auditor"];

async function listUsers() {
  return teamCClient.getUsers();
}

async function getUserById(userId) {
  const user = await teamCClient.getUser(userId);
  if (!user) {
    const err = new Error(`User with ID '${userId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  return user;
}

async function createUser(userData, actorUsername) {
  const { name, username, role, password } = userData || {};

  if (!name || !username || !role || !password) {
    const err = new Error("name, username, role, and password are required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  if (!VALID_ROLES.includes(role)) {
    const err = new Error(`Invalid role '${role}'. Allowed roles: ${VALID_ROLES.join(", ")}`);
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const existing = await teamCClient.findUserByUsername(username);
  if (existing) {
    const err = new Error(`Username '${username}' is already taken.`);
    err.status = 409;
    err.code = "DUPLICATE_USERNAME";
    throw err;
  }

  const createdUser = await teamCClient.createUser({ name, username, role, password });
  
  // Record audit log entry in mock
  try {
    const auditLog = await teamCClient.getAuditLog();
    auditLog.push({
      actor: actorUsername || "system",
      action: "USER_CREATED",
      target: createdUser.user_id,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Audit log update fails softly
  }

  return createdUser;
}

async function updateUser(userId, updateData) {
  const existing = await teamCClient.getUser(userId);
  if (!existing) {
    const err = new Error(`User with ID '${userId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  if (updateData.role && !VALID_ROLES.includes(updateData.role)) {
    const err = new Error(`Invalid role '${updateData.role}'. Allowed roles: ${VALID_ROLES.join(", ")}`);
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  return teamCClient.updateUser(userId, updateData);
}

async function updateUserStatus(userId, status) {
  const normalizedStatus = typeof status === "string" ? status.toUpperCase() : null;
  if (!["ACTIVE", "DISABLED"].includes(normalizedStatus)) {
    const err = new Error("Status must be 'ACTIVE' or 'DISABLED'.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const existing = await teamCClient.getUser(userId);
  if (!existing) {
    const err = new Error(`User with ID '${userId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  return teamCClient.updateUserStatus(userId, normalizedStatus);
}

async function resetPassword(userId, newPassword) {
  if (!newPassword || typeof newPassword !== "string") {
    const err = new Error("New password is required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const existing = await teamCClient.getUser(userId);
  if (!existing) {
    const err = new Error(`User with ID '${userId}' not found.`);
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  return teamCClient.resetPassword(userId, newPassword);
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  resetPassword,
};
