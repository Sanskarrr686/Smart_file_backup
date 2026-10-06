// src/utils/response.js
//
// Every single response in this project (success or error) uses the
// same shape. Writing that shape by hand in every controller invites
// typos, so every controller calls these two helpers instead.

function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    data,
    meta: {
      correlation_id: res.req.correlationId,
      api_version: "v1",
    },
  });
}

function fail(res, statusCode, code, message, details = []) {
  return res.status(statusCode).json({
    error: { code, message, details },
    meta: {
      correlation_id: res.req.correlationId,
    },
  });
}

module.exports = { success, fail };
