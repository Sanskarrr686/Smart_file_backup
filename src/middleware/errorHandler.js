// src/middleware/errorHandler.js

const { sanitizeString } = require("../utils/redact");

function errorHandler(err, req, res, next) {
  // Never log stack traces to client response, but log to server console for debugging if needed
  if (process.env.NODE_ENV !== "test") {
    const safeUrl = sanitizeString(req.url);
    const safeMsg = sanitizeString(err.message);
    console.error(`[Error] [${req.method} ${safeUrl}] status:${err.status || 500} code:${err.code || "INTERNAL_ERROR"}: ${safeMsg}`);
  }

  const statusCode = err.status || err.upstreamStatus || 500;
  const code = err.code || (statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");
  const message = err.message || "An unexpected error occurred.";
  const details = err.details || err.upstreamData || [];

  res.status(statusCode).json({
    error: {
      code,
      message,
      details,
    },
    meta: {
      correlation_id: req.correlationId,
    },
  });
}

module.exports = errorHandler;
