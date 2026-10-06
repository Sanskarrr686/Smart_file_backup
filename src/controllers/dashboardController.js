// src/controllers/dashboardController.js

const dashboardService = require("../services/dashboardService");
const { success } = require("../utils/response");

exports.getDashboard = async (req, res, next) => {
  try {
    const dashboardData = await dashboardService.getDashboard(req.user);
    return success(res, dashboardData);
  } catch (err) {
    next(err);
  }
};
