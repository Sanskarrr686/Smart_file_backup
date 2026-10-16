// src/middleware/roleGuard.js
//
// Usage: router.get("/reports", auth, roleGuard(["IT Admin", "Auditor"]), controller)
// This is the SERVER-SIDE enforcement of the Role Access Matrix from the
// design plan. The frontend also hides menu items by role, but that's
// just UX — this middleware is the real security boundary, because a
// request can always be sent directly (Postman, curl) bypassing the UI.

const { fail } = require("../utils/response");

function roleGuard(allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return fail(res, 401, "UNAUTHORIZED", "You must be logged in.");
    }
    if (!allowedRoles.includes(req.user.role)) {
      return fail(
        res,
        403,
        "FORBIDDEN",
        `Role '${req.user.role}' is not allowed to access this resource.`
      );
    }
    next();
  };
}

module.exports = roleGuard;
