// src/routes/searchRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const searchService = require("../services/searchService");
const { success } = require("../utils/response");

router.get("/search", auth, async (req, res, next) => {
  try {
    const query = req.query.q || "";
    const result = await searchService.globalSearch(query, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
