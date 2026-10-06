// test/upload.test.js
// Automated test suite for Team D Shared Storage & Upload API

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/server");
const config = require("../src/config/env");
const storageClient = require("../src/storage/storageClient");
const teamCClient = require("../src/clients/teamCClient");

let server;
let baseUrl;
let employeeToken;
let adminToken;
let auditorToken;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api/v1/ui`;
      resolve();
    });
  });

  // Get auth tokens
  const empRes = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "employee1", password: "employee123" }),
  });
  const empData = await empRes.json();
  employeeToken = empData.data.token;

  const admRes = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin1", password: "admin123" }),
  });
  const admData = await admRes.json();
  adminToken = admData.data.token;

  const audRes = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "auditor1", password: "auditor123" }),
  });
  const audData = await audRes.json();
  auditorToken = audData.data.token;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("UPLOAD: 1. Authentication failure - missing token", async () => {
  const formData = new FormData();
  formData.append("file", new Blob(["sample content"]), "sample.txt");

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    body: formData,
  });

  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error.code, "UNAUTHORIZED");
});

test("UPLOAD: 2. Authorization failure - Auditor role forbidden from uploading", async () => {
  const formData = new FormData();
  formData.append("file", new Blob(["sample content"]), "sample.txt");

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auditorToken}`,
    },
    body: formData,
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.error.code, "FORBIDDEN");
});

test("UPLOAD: 3. Missing file in request", async () => {
  const formData = new FormData();

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
    },
    body: formData,
  });

  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.code, "VALIDATION_ERROR");
  assert.match(json.error.message, /No file provided/i);
});

test("UPLOAD: 4. Empty file upload", async () => {
  const formData = new FormData();
  formData.append("file", new Blob([""]), "empty.txt");

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
    },
    body: formData,
  });

  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.code, "VALIDATION_ERROR");
  assert.match(json.error.message, /empty/i);
});

test("UPLOAD: 5. Successful file upload & Team C registration", async () => {
  const formData = new FormData();
  const fileContent = "This is a real shared file upload test.";
  formData.append("file", new Blob([fileContent], { type: "text/plain" }), "quarterly_summary.txt");

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
    },
    body: formData,
  });

  assert.equal(res.status, 201);
  const json = await res.json();
  assert.ok(json.data.file_id);
  assert.equal(json.data.name, "quarterly_summary.txt");
  assert.equal(json.data.status, "REGISTERED");
  assert.equal(json.data.owner_id, "u_101");
  assert.ok(json.data.storage_reference);
  assert.ok(json.data.storage_reference.provider);
  assert.ok(json.data.storage_reference.bucket);
  assert.ok(json.data.storage_reference.key);
  assert.match(json.data.storage_reference.key, /^files\/\d{4}\/\d{2}\/\d{2}\/f_[a-f0-9]+\/quarterly_summary\.txt$/);

  // Verify object exists in storage abstraction
  const exists = await storageClient.objectExists({
    bucket: json.data.storage_reference.bucket,
    key: json.data.storage_reference.key,
  });
  assert.equal(exists, true);

  // Verify credentials are NOT exposed anywhere in response
  const bodyStr = JSON.stringify(json);
  assert.equal(bodyStr.includes("minioadmin"), false);
  assert.equal(bodyStr.includes("accessKey"), false);
  assert.equal(bodyStr.includes("secretKey"), false);
});

test("UPLOAD: 6. Idempotent upload request retry", async () => {
  const idempotencyKey = `idem_test_${Date.now()}`;
  const formData1 = new FormData();
  formData1.append("file", new Blob(["idempotency test content"]), "report.pdf");

  const res1 = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: formData1,
  });
  assert.equal(res1.status, 201);
  const json1 = await res1.json();

  // Retry with same Idempotency-Key
  const formData2 = new FormData();
  formData2.append("file", new Blob(["idempotency test content"]), "report.pdf");

  const res2 = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: formData2,
  });
  assert.equal(res2.status, 201);
  const json2 = await res2.json();

  assert.equal(json1.data.file_id, json2.data.file_id);
  assert.equal(json1.data.storage_reference.key, json2.data.storage_reference.key);
});

test("UPLOAD: 7. Team C registration failure & storage cleanup", async () => {
  // Temporarily override teamCClient.registerFile to simulate failure
  const originalRegister = teamCClient.registerFile;
  teamCClient.registerFile = async () => {
    const err = new Error("Team C metadata database unreachable.");
    err.status = 502;
    throw err;
  };

  try {
    const formData = new FormData();
    formData.append("file", new Blob(["test failure cleanup"]), "fail_test.txt");

    const res = await fetch(`${baseUrl}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${employeeToken}`,
      },
      body: formData,
    });

    assert.equal(res.status, 502);
    const json = await res.json();
    assert.equal(json.error.code, "UPSTREAM_FAILURE");
    assert.match(json.error.message, /could not be completed/i);
  } finally {
    teamCClient.registerFile = originalRegister;
  }
});

test("UPLOAD: 8. Storage upload failure", async () => {
  const originalUpload = storageClient.mockStorage.uploadObject;
  storageClient.mockStorage.uploadObject = async () => {
    const err = new Error("Storage disk write error");
    err.status = 502;
    throw err;
  };

  try {
    const formData = new FormData();
    formData.append("file", new Blob(["storage fail test"]), "fail_storage.txt");

    const res = await fetch(`${baseUrl}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${employeeToken}`,
      },
      body: formData,
    });

    assert.equal(res.status, 502);
    const json = await res.json();
    assert.equal(json.error.code, "STORAGE_ERROR");
  } finally {
    storageClient.mockStorage.uploadObject = originalUpload;
  }
});

test("UPLOAD: 9. Presigned download URL generation for Team B / clients", async () => {
  // First upload a file
  const formData = new FormData();
  formData.append("file", new Blob(["team b read test"]), "teamb_data.csv");

  const upRes = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
    body: formData,
  });
  const upJson = await upRes.json();
  const fileId = upJson.data.file_id;

  // Request signed download URL
  const res = await fetch(`${baseUrl}/files/${fileId}/download-url`, {
    method: "GET",
    headers: { Authorization: `Bearer ${employeeToken}` },
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.data.file_id, fileId);
  assert.ok(json.data.signed_url);
  assert.ok(json.data.storage_reference);
  assert.equal(json.data.storage_reference.bucket, "backup-files");

  // Verify fetching signed_url downloads actual file content
  const testUrl = json.data.signed_url.replace(/:\d+\//, `:${server.address().port}/`);
  const dlRes = await fetch(testUrl);
  assert.equal(dlRes.status, 200);
  const dlContent = await dlRes.text();
  assert.equal(dlContent, "team b read test");
});
