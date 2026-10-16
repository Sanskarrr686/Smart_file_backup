// src/routes/streamRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const sseManager = require("../utils/sse");

router.get("/stream", auth, (req, res) => {
  sseManager.addClient(req, res);
});

module.exports = router;
