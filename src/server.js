// src/server.js
//
// The entry point. Wires together middleware, routes, and error handlers.

const express = require("express");
const cors = require("cors");
const path = require("path");

const correlationId = require("./middleware/correlationId");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const filesRoutes = require("./routes/filesRoutes");
const backupRoutes = require("./routes/backupRoutes");
const restoreRoutes = require("./routes/restoreRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const auditRoutes = require("./routes/auditRoutes");
const userRoutes = require("./routes/userRoutes");
const streamRoutes = require("./routes/streamRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const searchRoutes = require("./routes/searchRoutes");

const app = express();
const config = require("./config/env");

app.use(cors());
app.use(express.json());
app.use(correlationId); // runs on EVERY request, before any route

// Serve built React frontend assets if available, fallback to public test console
app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));
app.use(express.static(path.join(__dirname, "..", "public")));

// Basic health check endpoint
app.get("/health", (req, res) => res.json({ status: "ok" }));

// All UI-facing routes live under /api/v1/ui
app.use("/api/v1/ui", authRoutes);
app.use("/api/v1/ui", dashboardRoutes);
app.use("/api/v1/ui", filesRoutes);
app.use("/api/v1/ui", backupRoutes);
app.use("/api/v1/ui", restoreRoutes);
app.use("/api/v1/ui", reportsRoutes);
app.use("/api/v1/ui", auditRoutes);
app.use("/api/v1/ui", userRoutes);
app.use("/api/v1/ui", streamRoutes);
app.use("/api/v1/ui", notificationRoutes);
app.use("/api/v1/ui", searchRoutes);

// SPA routing fallback for non-API requests
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Route '${req.method} ${req.path}' not found.`,
        details: [],
      },
      meta: {
        correlation_id: req.correlationId,
      },
    });
  }
  res.sendFile(path.join(__dirname, "..", "frontend", "dist", "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "..", "public", "test.html"));
    }
  });
});

// Must be registered LAST
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`\nTeam D BFF running at http://localhost:${config.port}`);
    console.log(`React Application: http://localhost:${config.port}/`);
    console.log(`Test Console:      http://localhost:${config.port}/test.html`);
    console.log(`Health:            http://localhost:${config.port}/health\n`);
  });
}

module.exports = app;
