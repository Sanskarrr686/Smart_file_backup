// src/middleware/auth.js

const users = require("../mocks/users");
const teamCClient = require("../clients/teamCClient");
const config = require("../config/env");
const { fail } = require("../utils/response");

async function authMiddleware(req, res, next) {
  let authHeader = req.headers["authorization"]; // format: "Bearer <token>"

  if ((!authHeader || !authHeader.startsWith("Bearer ")) && req.query && req.query.token) {
    authHeader = `Bearer ${req.query.token}`;
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return fail(res, 401, "UNAUTHORIZED", "Missing or invalid Authorization header.");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const parts = token.split("-");
  
  if (parts.length < 3 || parts[0] !== "mock" || parts[1] !== "token") {
    return fail(res, 401, "UNAUTHORIZED", "Invalid or expired session token format.");
  }

  const userId = parts[2];

  let user = users.find((u) => u.user_id === userId);
  if (!user && config.teamC.mode === "real") {
    try {
      user = await teamCClient.getUser(userId);
    } catch (e) {
      return fail(res, 401, "UNAUTHORIZED", "Invalid or expired session.");
    }
  }

  if (!user) {
    return fail(res, 401, "UNAUTHORIZED", "Invalid or expired session.");
  }

  if (user.status === "DISABLED") {
    return fail(res, 401, "UNAUTHORIZED", "User account is disabled.");
  }

  req.user = user;
  next();
}

module.exports = authMiddleware;
