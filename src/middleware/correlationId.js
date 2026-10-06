// src/middleware/correlationId.js
//
// The project-wide rule: "One ID generated at Team D or Team C and
// propagated through every service and log." Since Team D is often the
// first stop for a browser request, THIS is usually where that ID is
// born. This middleware runs before every route.

const crypto = require("crypto");

function correlationIdMiddleware(req, res, next) {
  // If the browser already sent one (e.g. it was generated earlier in
  // the flow), reuse it. Otherwise create a new one.
  const incoming = req.headers["x-correlation-id"];
  req.correlationId = incoming || "corr_" + crypto.randomBytes(6).toString("hex");

  // Echo it back on the response too, so the frontend/dev tools can see it.
  res.setHeader("X-Correlation-ID", req.correlationId);
  next();
}

module.exports = correlationIdMiddleware;
