// src/routes/userRoutes.js

const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const auth = require("../middleware/auth");
const roleGuard = require("../middleware/roleGuard");

// Only IT Admin can manage users
router.get("/users", auth, roleGuard(["IT Admin"]), userController.listUsers);
router.get("/users/:userId", auth, roleGuard(["IT Admin"]), userController.getUser);
router.post("/users", auth, roleGuard(["IT Admin"]), userController.createUser);
router.patch("/users/:userId", auth, roleGuard(["IT Admin"]), userController.updateUser);
router.patch("/users/:userId/status", auth, roleGuard(["IT Admin"]), userController.updateUserStatus);
router.post("/users/:userId/reset-password", auth, roleGuard(["IT Admin"]), userController.resetPassword);

module.exports = router;
