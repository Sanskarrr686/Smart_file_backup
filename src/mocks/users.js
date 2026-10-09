// src/mocks/users.js
// Stand-in for Team C's real user store with bcrypt hashed passwords.

const bcrypt = require("bcryptjs");

const users = [
  {
    user_id: "u_101",
    name: "Aisha Verma",
    username: "employee1",
    password: bcrypt.hashSync("employee123", 10),
    role: "Employee",
    status: "ACTIVE",
    created_at: "2026-01-15T08:00:00Z"
  },
  {
    user_id: "u_102",
    name: "Rohit Deshmukh",
    username: "admin1",
    password: bcrypt.hashSync("admin123", 10),
    role: "IT Admin",
    status: "ACTIVE",
    created_at: "2026-01-10T08:00:00Z"
  },
  {
    user_id: "u_103",
    name: "Sana Iyer",
    username: "auditor1",
    password: bcrypt.hashSync("auditor123", 10),
    role: "Auditor",
    status: "ACTIVE",
    created_at: "2026-01-12T08:00:00Z"
  }
];

module.exports = users;
