// src/services/authService.js

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const teamCClient = require("../clients/teamCClient");
const usersMock = require("../mocks/users");
const config = require("../config/env");

function generateJwtToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      role: user.role,
    },
    config.jwtSecret,
    { expiresIn: "8h" }
  );
}

async function login(username, password) {
  if (!username || !password) {
    const err = new Error("Username and password are required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  let user;
  if (config.teamC.mode === "mock") {
    user = usersMock.find((u) => u.username === username);
  } else {
    user = await teamCClient.findUserByUsername(username);
  }

  if (!user) {
    const err = new Error("Username or password is incorrect.");
    err.status = 401;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }

  const isValidPassword =
    user.password && (user.password.startsWith("$2a$") || user.password.startsWith("$2b$"))
      ? bcrypt.compareSync(password, user.password)
      : user.password === password;

  if (!isValidPassword) {
    const err = new Error("Username or password is incorrect.");
    err.status = 401;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }

  if (user.status === "DISABLED") {
    const err = new Error("User account is disabled.");
    err.status = 401;
    err.code = "ACCOUNT_DISABLED";
    throw err;
  }

  const token = generateJwtToken(user);
  const safeUser = {
    user_id: user.user_id,
    name: user.name,
    username: user.username,
    role: user.role,
    status: user.status || "ACTIVE",
  };

  return { token, user: safeUser };
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    const err = new Error("Current password and new password are required.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  if (newPassword.length < 6) {
    const err = new Error("New password must be at least 6 characters long.");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const result = await teamCClient.changePassword(userId, currentPassword, newPassword);
  if (!result.success) {
    if (result.reason === "INVALID_CURRENT_PASSWORD") {
      const err = new Error("Current password is incorrect.");
      err.status = 400;
      err.code = "INVALID_CURRENT_PASSWORD";
      throw err;
    }
    const err = new Error("User not found.");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  return { message: "Password updated successfully." };
}

module.exports = {
  login,
  changePassword,
};
