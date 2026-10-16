// src/utils/redact.js
// Utility to redact passwords, tokens, secrets, and authorization headers from log messages and data.

const SENSITIVE_KEYS = [
  "password",
  "current_password",
  "new_password",
  "pass",
  "pwd",
  "token",
  "jwt",
  "authorization",
  "secret",
  "accesskey",
  "secretkey",
];

function redactValue(key, val) {
  if (val === null || val === undefined) return val;
  const lowerKey = String(key).toLowerCase();

  if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
    return "[REDACTED]";
  }

  if (typeof val === "string") {
    if (val.toLowerCase().startsWith("bearer ")) {
      return "Bearer [REDACTED]";
    }
  }

  return val;
}

function sanitizeObject(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "string") {
      // Clean up string containing bearer token
      if (obj.toLowerCase().startsWith("bearer ")) {
        return "Bearer [REDACTED]";
      }
    }
    return obj;
  }

  if (seen.has(obj)) {
    return "[CIRCULAR]";
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, seen));
  }

  const sanitized = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((sk) => k.toLowerCase().includes(sk))) {
      sanitized[k] = "[REDACTED]";
    } else {
      sanitized[k] = sanitizeObject(v, seen);
    }
  }
  return sanitized;
}

function sanitizeString(str) {
  if (typeof str !== "string") return str;
  // Redact authorization header patterns or tokens in URLs/strings
  let result = str.replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, "Bearer [REDACTED]");
  result = result.replace(/(password|token|secret)=([^&]+)/gi, "$1=[REDACTED]");
  return result;
}

module.exports = {
  sanitizeObject,
  sanitizeString,
  redactValue,
};
