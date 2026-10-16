// src/controllers/authController.js

const authService = require("../services/authService");
const { success } = require("../utils/response");

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

exports.me = (req, res) => {
  const { user_id, name, username, role, status } = req.user;
  return success(res, { user_id, name, username, role, status: status || "ACTIVE" });
};

exports.logout = (req, res) => {
  return success(res, { message: "Logged out." });
};

exports.changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await authService.changePassword(
      req.user.user_id,
      current_password,
      new_password
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
