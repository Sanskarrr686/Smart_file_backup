// src/mocks/users.js
// Stand-in for Team C's real user store.

const users = [
  {
    user_id: "u_101",
    name: "Aisha Verma",
    username: "employee1",
    password: "employee123",
    role: "Employee",
    status: "ACTIVE",
    created_at: "2026-01-15T08:00:00Z"
  },
  {
    user_id: "u_102",
    name: "Rohit Deshmukh",
    username: "admin1",
    password: "admin123",
    role: "IT Admin",
    status: "ACTIVE",
    created_at: "2026-01-10T08:00:00Z"
  },
  {
    user_id: "u_103",
    name: "Sana Iyer",
    username: "auditor1",
    password: "auditor123",
    role: "Auditor",
    status: "ACTIVE",
    created_at: "2026-01-12T08:00:00Z"
  }
];

module.exports = users;
