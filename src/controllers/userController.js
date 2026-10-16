// src/controllers/userController.js

const userService = require("../services/userService");
const { success } = require("../utils/response");

exports.listUsers = async (req, res, next) => {
  try {
    const items = await userService.listUsers();
    return success(res, { items });
  } catch (err) {
    next(err);
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await userService.getUserById(userId);
    return success(res, user);
  } catch (err) {
    next(err);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body, req.user.username);
    return success(res, user, 201);
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await userService.updateUser(userId, req.body);
    return success(res, user);
  } catch (err) {
    next(err);
  }
};

exports.updateUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    const user = await userService.updateUserStatus(userId, status);
    return success(res, user);
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;
    const user = await userService.resetPassword(userId, password);
    return success(res, user);
  } catch (err) {
    next(err);
  }
};
