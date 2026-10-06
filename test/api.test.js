// test/api.test.js
//
// Automated backend test suite covering all 47 test scenarios required by Phase 1 specification.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const app = require("../src/server");
const config = require("../src/config/env");

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api/v1/ui`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function apiRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();
  return { status: response.status, body: data };
}

// Helper tokens for testing
let employeeToken;
let adminToken;
let auditorToken;

test("AUTH: 1. valid login", async () => {
  const res = await apiRequest("/session", {
    method: "POST",
    body: { username: "employee1", password: "employee123" },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token);
  assert.equal(res.body.data.user.role, "Employee");
  employeeToken = res.body.data.token;
});

test("AUTH: 2. invalid username", async () => {
  const res = await apiRequest("/session", {
    method: "POST",
    body: { username: "nonexistent_user", password: "employee123" },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("AUTH: 3. invalid password", async () => {
  const res = await apiRequest("/session", {
    method: "POST",
    body: { username: "employee1", password: "wrongpassword" },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("AUTH: 4. missing token", async () => {
  const res = await apiRequest("/me");
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("AUTH: 5. /me", async () => {
  const res = await apiRequest("/me", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.username, "employee1");
});

test("AUTH: 6. logout", async () => {
  const res = await apiRequest("/session", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.message, "Logged out.");
});

test("AUTH: 7. password change", async () => {
  // Login as employee1 to get token
  const loginRes = await apiRequest("/session", {
    method: "POST",
    body: { username: "employee1", password: "employee123" },
  });
  const token = loginRes.body.data.token;

  // Change password
  const changeRes = await apiRequest("/session/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { current_password: "employee123", new_password: "newpassword123" },
  });
  assert.equal(changeRes.status, 200);

  // Login with new password
  const newLoginRes = await apiRequest("/session", {
    method: "POST",
    body: { username: "employee1", password: "newpassword123" },
  });
  assert.equal(newLoginRes.status, 200);

  // Revert password back for rest of tests
  const revertToken = newLoginRes.body.data.token;
  await apiRequest("/session/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${revertToken}` },
    body: { current_password: "newpassword123", new_password: "employee123" },
  });
});

test("Setup admin and auditor tokens", async () => {
  const adminRes = await apiRequest("/session", {
    method: "POST",
    body: { username: "admin1", password: "admin123" },
  });
  adminToken = adminRes.body.data.token;

  const auditorRes = await apiRequest("/session", {
    method: "POST",
    body: { username: "auditor1", password: "auditor123" },
  });
  auditorToken = auditorRes.body.data.token;
});

test("AUTHORIZATION: 8. Employee allowed endpoint", async () => {
  const res = await apiRequest("/files", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
});

test("AUTHORIZATION: 9. Employee forbidden admin endpoint", async () => {
  const res = await apiRequest("/users", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("AUTHORIZATION: 10. Auditor forbidden write endpoint", async () => {
  const res = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auditorToken}`,
      "Idempotency-Key": "auditor_test_key",
    },
    body: { file_id: "f_001", file_name: "budget.xlsx" },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("AUTHORIZATION: 11. Admin allowed endpoint", async () => {
  const res = await apiRequest("/users", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("FILES: 12. employee own files", async () => {
  const res = await apiRequest("/files", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  const items = res.body.data.items;
  assert.ok(items.every((item) => item.owner_id === "u_101"));
});

test("FILES: 13. employee restricted files", async () => {
  // f_003 belongs to u_102 (admin1). employee1 (u_101) should be forbidden
  const res = await apiRequest("/files/f_003", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("FILES: 14. admin all files", async () => {
  const res = await apiRequest("/files", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.items.length >= 3);
});

test("FILES: 15. versions", async () => {
  const res = await apiRequest("/files/f_001/versions", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.file_id, "f_001");
  assert.ok(Array.isArray(res.body.data.versions));
});

test("FILES: 16. missing file", async () => {
  const res = await apiRequest("/files/f_99999", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
});

test("BACKUPS: 17. create backup", async () => {
  const res = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": "bkp_key_unique_1",
    },
    body: { file_id: "f_001", file_name: "budget.xlsx" },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.data.backup_id);
});

test("BACKUPS: 18. missing Idempotency-Key", async () => {
  const res = await apiRequest("/backups", {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
    body: { file_id: "f_001", file_name: "budget.xlsx" },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("BACKUPS: 19. duplicate Idempotency-Key", async () => {
  const key = "bkp_key_repeat_123";
  // First attempt
  const res1 = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": key,
    },
    body: { file_id: "f_001", file_name: "budget.xlsx" },
  });
  assert.equal(res1.status, 201);

  // Second attempt with exact same key
  const res2 = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": key,
    },
    body: { file_id: "f_001", file_name: "budget.xlsx" },
  });
  assert.equal(res2.status, 200);
  assert.equal(res2.body.data.backup_id, res1.body.data.backup_id);
});

test("BACKUPS: 20. different Idempotency-Key", async () => {
  const res1 = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": "diff_key_1",
    },
    body: { file_id: "f_001", file_name: "budget.xlsx" },
  });

  const res2 = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": "diff_key_2",
    },
    body: { file_id: "f_001", file_name: "budget.xlsx" },
  });

  assert.equal(res1.status, 201);
  assert.equal(res2.status, 201);
  assert.notEqual(res1.body.data.backup_id, res2.body.data.backup_id);
});

test("BACKUPS: 21. invalid file", async () => {
  const res = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": "invalid_file_key",
    },
    body: { file_id: "f_invalid_99", file_name: "nonexistent.docx" },
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
});

test("BACKUPS: 22. unauthorized backup", async () => {
  // Employee u_101 trying to backup f_003 owned by u_102
  const res = await apiRequest("/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": "unauth_file_key",
    },
    body: { file_id: "f_003", file_name: "design_assets.zip" },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("RESTORE: 23. valid restore", async () => {
  const res = await apiRequest("/files/f_001/versions/v3/restore", {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.data.restore_id);
  assert.equal(res.body.data.version_id, "v3");
});

test("RESTORE: 24. invalid file", async () => {
  const res = await apiRequest("/files/f_nonexistent/versions/v3/restore", {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 404);
});

test("RESTORE: 25. invalid version", async () => {
  const res = await apiRequest("/files/f_001/versions/v999/restore", {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 404);
});

test("RESTORE: 26. unauthorized restore", async () => {
  // Employee u_101 restoring file f_003 owned by u_102
  const res = await apiRequest("/files/f_003/versions/v1/restore", {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 403);
});

test("RESTORE: 27. Team C unavailable", async () => {
  // Save current config
  const originalMode = config.teamC.mode;
  const originalUrl = config.teamC.baseUrl;

  config.teamC.mode = "real";
  config.teamC.baseUrl = "http://127.0.0.1:59999"; // non-existent server

  const res = await apiRequest("/files/f_001/versions/v3/restore", {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });

  // Restore config
  config.teamC.mode = originalMode;
  config.teamC.baseUrl = originalUrl;

  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, "UPSTREAM_FAILURE");
});

test("RESTORE: 28. restore status", async () => {
  const res = await apiRequest("/restores/rst_890", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.restore_id, "rst_890");
});

test("REPORTS: 29. admin", async () => {
  const res = await apiRequest("/reports/storage", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.used_gb);
});

test("REPORTS: 30. auditor", async () => {
  const res = await apiRequest("/reports/storage", {
    headers: { Authorization: `Bearer ${auditorToken}` },
  });
  assert.equal(res.status, 200);
});

test("REPORTS: 31. unauthorized employee", async () => {
  const res = await apiRequest("/reports/storage", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 403);
});

test("AUDIT: 32. admin", async () => {
  const res = await apiRequest("/audit", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("AUDIT: 33. auditor", async () => {
  const res = await apiRequest("/audit", {
    headers: { Authorization: `Bearer ${auditorToken}` },
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("AUDIT: 34. unauthorized employee", async () => {
  const res = await apiRequest("/audit", {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 403);
});

let createdUsername = `testuser_${Date.now()}`;
let createdUserId;

test("USERS: 35. admin creates user", async () => {
  const res = await apiRequest("/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: "New Test User",
      username: createdUsername,
      role: "Employee",
      password: "password123",
    },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.data.user_id);
  assert.equal(res.body.data.username, createdUsername);
  assert.equal(res.body.data.password, undefined); // Passwords must never be returned!
  createdUserId = res.body.data.user_id;
});

test("USERS: 36. employee cannot create user", async () => {
  const res = await apiRequest("/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
    body: {
      name: "Hacker",
      username: "hacker1",
      role: "Employee",
      password: "pass",
    },
  });
  assert.equal(res.status, 403);
});

test("USERS: 37. auditor cannot create user", async () => {
  const res = await apiRequest("/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${auditorToken}` },
    body: {
      name: "Hacker",
      username: "hacker2",
      role: "Employee",
      password: "pass",
    },
  });
  assert.equal(res.status, 403);
});

test("USERS: 38. duplicate username", async () => {
  const res = await apiRequest("/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: "Duplicate User",
      username: createdUsername,
      role: "Employee",
      password: "password123",
    },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "DUPLICATE_USERNAME");
});

test("USERS: 39. invalid role", async () => {
  const res = await apiRequest("/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: "Bad Role User",
      username: `badrole_${Date.now()}`,
      role: "SuperHero",
      password: "password123",
    },
  });
  assert.equal(res.status, 400);
});

test("USERS: 40. newly created user login", async () => {
  const res = await apiRequest("/session", {
    method: "POST",
    body: { username: createdUsername, password: "password123" },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token);
});

test("USERS: 41. disabled user login failure", async () => {
  // Disable created user
  const disableRes = await apiRequest(`/users/${createdUserId}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status: "DISABLED" },
  });
  assert.equal(disableRes.status, 200);
  assert.equal(disableRes.body.data.status, "DISABLED");

  // Attempt login with disabled user
  const loginRes = await apiRequest("/session", {
    method: "POST",
    body: { username: createdUsername, password: "password123" },
  });
  assert.equal(loginRes.status, 401);

  // Enable user back
  await apiRequest(`/users/${createdUserId}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status: "ACTIVE" },
  });
});

test("USERS: 42. password reset", async () => {
  // Admin resets password
  const resetRes = await apiRequest(`/users/${createdUserId}/reset-password`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { password: "resetpassword123" },
  });
  assert.equal(resetRes.status, 200);

  // Login with new reset password
  const loginRes = await apiRequest("/session", {
    method: "POST",
    body: { username: createdUsername, password: "resetpassword123" },
  });
  assert.equal(loginRes.status, 200);
});

test("ERRORS: 43. upstream timeout", async () => {
  const { request } = require("../src/clients/httpClient");
  // Test httpClient directly for timeout handling (using non-routable IP to simulate timeout)
  try {
    await request("http://10.255.255.1:81", { timeout: 100 });
    assert.fail("Should have timed out");
  } catch (err) {
    assert.equal(err.status, 504);
    assert.equal(err.code, "UPSTREAM_TIMEOUT");
  }
});

test("ERRORS: 44. upstream 500", async () => {
  // Create a temporary HTTP server returning 500
  const mockServer = http.createServer((req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Internal Upstream Error" }));
  });
  await new Promise((resolve) => mockServer.listen(0, resolve));
  const mockPort = mockServer.address().port;

  const { request } = require("../src/clients/httpClient");
  try {
    await request(`http://127.0.0.1:${mockPort}/fail`);
    assert.fail("Should have thrown upstream 500");
  } catch (err) {
    assert.equal(err.status, 500);
    assert.equal(err.code, "UPSTREAM_FAILURE");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("ERRORS: 45. malformed response", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("THIS IS NOT VALID JSON");
  });
  await new Promise((resolve) => mockServer.listen(0, resolve));
  const mockPort = mockServer.address().port;

  const { request } = require("../src/clients/httpClient");
  const data = await request(`http://127.0.0.1:${mockPort}/malformed`);
  assert.equal(typeof data, "object");
  assert.ok(data.message.includes("Invalid JSON"));

  await new Promise((resolve) => mockServer.close(resolve));
});

test("ERRORS: 46. validation failure", async () => {
  const res = await apiRequest("/session", {
    method: "POST",
    body: {},
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("ERRORS: 47. 404", async () => {
  const res = await apiRequest("/this-route-does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
});
