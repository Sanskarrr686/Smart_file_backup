// test/phase2.test.js
// Additional test suite for Phase 2 endpoints: SSE stream, retry restore, notifications, global search

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/server");

let server;
let baseUrl;
let employeeToken;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api/v1/ui`;
      resolve();
    });
  });

  const empRes = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "employee1", password: "employee123" }),
  });
  const empData = await empRes.json();
  employeeToken = empData.data.token;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("PHASE2: 1. GET /notifications", async () => {
  const res = await fetch(`${baseUrl}/notifications`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.data.items));
});

test("PHASE2: 2. GET /search", async () => {
  const res = await fetch(`${baseUrl}/search?q=budget`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.data.files));
  assert.ok(Array.isArray(json.data.backups));
  assert.ok(Array.isArray(json.data.restores));
  assert.ok(json.data.files.length > 0 || json.data.backups.length > 0);
});

test("PHASE2: 3. POST /restores/:restoreId/retry", async () => {
  const res = await fetch(`${baseUrl}/restores/rst_890/retry`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.data.restore_id, "rst_890");
  assert.ok(json.data.state === "COMPLETED" || json.data.state === "FAILED");
});

test("PHASE2: 4. GET /stream (SSE connection)", async () => {
  const res = await fetch(`${baseUrl}/stream?token=${employeeToken}`, {
    headers: { Accept: "text/event-stream" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  // Cancel stream connection
  if (res.body && res.body.cancel) {
    res.body.cancel();
  }
});
