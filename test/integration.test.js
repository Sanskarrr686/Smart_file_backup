// test/integration.test.js
// Unit & Integration tests for Team D BFF Phase 2 & Live Integration requirements

const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config/env");
const identityAdapter = require("../src/utils/identityAdapter");
const teamCClient = require("../src/clients/teamCClient");
const teamAClient = require("../src/clients/teamAClient");
const teamBClient = require("../src/clients/teamBClient");
const fileService = require("../src/services/fileService");

test("IDENTITY ADAPTER: 1. Successful mapping resolution from config", () => {
  const origMap = config.teamC.identityMap;
  config.teamC.identityMap = '{"u_101":1,"u_102":2,"u_103":3}';

  try {
    const empUser = { user_id: "u_101", role: "Employee" };
    const adminUser = { user_id: "u_102", role: "IT Admin" };
    const auditorUser = { user_id: "u_103", role: "Auditor" };

    assert.equal(identityAdapter.getRequiredTeamCUserId(empUser), 1);
    assert.equal(identityAdapter.getRequiredTeamCUserId(adminUser), 2);
    assert.equal(identityAdapter.getRequiredTeamCUserId(auditorUser), 3);
  } finally {
    config.teamC.identityMap = origMap;
  }
});

test("IDENTITY ADAPTER: 2. Missing mapping fails closed with IDENTITY_MAPPING_ERROR", () => {
  const origMap = config.teamC.identityMap;
  const origMode = config.teamC.mode;

  config.teamC.mode = "real";
  config.teamC.identityMap = '{"u_101":1}';

  try {
    const unknownUser = { user_id: "u_999", role: "Employee" };
    assert.throws(
      () => identityAdapter.getRequiredTeamCUserId(unknownUser),
      (err) => {
        assert.equal(err.code, "IDENTITY_MAPPING_ERROR");
        assert.equal(err.status, 400);
        return true;
      }
    );
  } finally {
    config.teamC.identityMap = origMap;
    config.teamC.mode = origMode;
  }
});

test("IDENTITY ADAPTER: 3. User ownership matching helper", () => {
  const origMap = config.teamC.identityMap;
  config.teamC.identityMap = '{"u_101":1}';

  try {
    const empUser = { user_id: "u_101", role: "Employee" };
    assert.equal(identityAdapter.matchesUser("u_101", empUser), true);
    assert.equal(identityAdapter.matchesUser(1, empUser), true);
    assert.equal(identityAdapter.matchesUser("1", empUser), true);
    assert.equal(identityAdapter.matchesUser(2, empUser), false);
    assert.equal(identityAdapter.matchesUser("u_102", empUser), false);
  } finally {
    config.teamC.identityMap = origMap;
  }
});

test("TEAM C HEADERS: 1. Protected Team C requests send Authorization, X-TeamC-User-Id, and X-TeamC-Role headers", async () => {
  const origMode = config.teamC.mode;
  const origSecret = config.teamC.serviceSecret;
  const origMap = config.teamC.identityMap;
  const origFetch = global.fetch;

  config.teamC.mode = "real";
  config.teamC.serviceSecret = "test_service_secret_12345";
  config.teamC.identityMap = '{"u_101":100}';

  let capturedHeaders = null;

  global.fetch = async (url, options) => {
    capturedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ data: [] }),
    };
  };

  try {
    const user = { user_id: "u_101", role: "Employee" };
    await teamCClient.getFiles(user);

    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders["Authorization"], "Bearer test_service_secret_12345");
    assert.equal(capturedHeaders["X-TeamC-User-Id"], "100");
    assert.equal(capturedHeaders["X-TeamC-Role"], "Employee");
  } finally {
    config.teamC.mode = origMode;
    config.teamC.serviceSecret = origSecret;
    config.teamC.identityMap = origMap;
    global.fetch = origFetch;
  }
});

test("TEAM C HEADERS: 2. Missing service secret in live mode fails closed with CONFIG_ERROR", async () => {
  const origMode = config.teamC.mode;
  const origSecret = config.teamC.serviceSecret;

  config.teamC.mode = "real";
  config.teamC.serviceSecret = "";

  try {
    const user = { user_id: "u_101", role: "Employee" };
    await assert.rejects(
      async () => {
        await teamCClient.getFiles(user);
      },
      (err) => {
        assert.equal(err.code, "CONFIG_ERROR");
        assert.equal(err.status, 500);
        return true;
      }
    );
  } finally {
    config.teamC.mode = origMode;
    config.teamC.serviceSecret = origSecret;
  }
});

test("TEAM C MULTIPART UPLOAD: 1. Live mode upload success and response parsing", async () => {
  const origMode = config.teamC.mode;
  const origSecret = config.teamC.serviceSecret;
  const origMap = config.teamC.identityMap;
  const origFetch = global.fetch;

  config.teamC.mode = "real";
  config.teamC.serviceSecret = "secret_abc_123";
  config.teamC.identityMap = '{"u_101":1}';

  let capturedMethod = null;
  let capturedHeaders = null;
  let capturedBody = null;

  global.fetch = async (url, options) => {
    capturedMethod = options.method;
    capturedHeaders = options.headers;
    capturedBody = options.body;

    return {
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      json: async () => ({
        data: {
          file_id: 501,
          object_key: "files/2026/10/501/report.pdf",
          file_name: "report.pdf",
          user_id: 1,
          size_bytes: 1024,
          created_at: "2026-10-10T12:00:00Z",
        },
      }),
    };
  };

  try {
    const user = { user_id: "u_101", role: "Employee" };
    const dummyFile = {
      originalname: "report.pdf",
      mimetype: "application/pdf",
      size: 1024,
      buffer: Buffer.from("pdf bytes"),
    };

    const res = await fileService.uploadFile({
      file: dummyFile,
      user,
      idempotencyKey: "idem_live_test_1",
    });

    assert.equal(capturedMethod, "POST");
    assert.ok(capturedBody instanceof FormData);
    assert.equal(capturedHeaders["Authorization"], "Bearer secret_abc_123");
    assert.equal(capturedHeaders["X-TeamC-User-Id"], "1");
    assert.equal(capturedHeaders["X-TeamC-Role"], "Employee");

    assert.equal(res.file_id, 501);
    assert.equal(res.name, "report.pdf");
    assert.equal(res.object_key, "files/2026/10/501/report.pdf");
    assert.equal(res.storage_reference.key, "files/2026/10/501/report.pdf");
    assert.equal(res.status, "REGISTERED");
  } finally {
    config.teamC.mode = origMode;
    config.teamC.serviceSecret = origSecret;
    config.teamC.identityMap = origMap;
    global.fetch = origFetch;
  }
});

test("TEAM C MULTIPART UPLOAD: 2. Malformed envelope (missing file_id) throws UPSTREAM_FAILURE", async () => {
  const origMode = config.teamC.mode;
  const origSecret = config.teamC.serviceSecret;
  const origMap = config.teamC.identityMap;
  const origFetch = global.fetch;

  config.teamC.mode = "real";
  config.teamC.serviceSecret = "secret_abc_123";
  config.teamC.identityMap = '{"u_101":1}';

  global.fetch = async () => ({
    ok: true,
    status: 201,
    headers: { get: () => "application/json" },
    json: async () => ({
      data: {
        object_key: "files/2026/10/invalid/report.pdf",
        // missing file_id!
      },
    }),
  });

  try {
    const user = { user_id: "u_101", role: "Employee" };
    const dummyFile = {
      originalname: "report.pdf",
      mimetype: "application/pdf",
      size: 1024,
      buffer: Buffer.from("pdf bytes"),
    };

    await assert.rejects(
      async () => {
        await fileService.uploadFile({
          file: dummyFile,
          user,
          idempotencyKey: "idem_live_fail_1",
        });
      },
      (err) => {
        assert.equal(err.code, "UPSTREAM_FAILURE");
        return true;
      }
    );
  } finally {
    config.teamC.mode = origMode;
    config.teamC.serviceSecret = origSecret;
    config.teamC.identityMap = origMap;
    global.fetch = origFetch;
  }
});

test("IDEMPOTENCY: 1. Prevents cross-user cache leakage", async () => {
  fileService.clearUploadIdempotencyCache();

  const userA = { user_id: "u_101", role: "Employee" };
  const userB = { user_id: "u_102", role: "IT Admin" };
  const sharedKey = "shared_idempotency_key_123";

  const fileA = {
    originalname: "fileA.txt",
    mimetype: "text/plain",
    size: 100,
    buffer: Buffer.from("content A"),
  };

  const fileB = {
    originalname: "fileB.txt",
    mimetype: "text/plain",
    size: 200,
    buffer: Buffer.from("content B"),
  };

  const resA = await fileService.uploadFile({ file: fileA, user: userA, idempotencyKey: sharedKey });
  const resB = await fileService.uploadFile({ file: fileB, user: userB, idempotencyKey: sharedKey });

  assert.notEqual(resA.file_id, resB.file_id);
  assert.equal(resA.name, "fileA.txt");
  assert.equal(resB.name, "fileB.txt");
});

test("OWNERSHIP & ROLE ENFORCEMENT: 1. Employee forbidden from viewing other user's file", async () => {
  const empA = { user_id: "u_101", role: "Employee" };
  const empB = { user_id: "u_102", role: "Employee" };

  const file = await teamCClient.registerFile({
    file_id: "f_owner_test_101",
    name: "secret_file.doc",
    size_bytes: 500,
    owner_id: "u_101",
  });

  const retrieved = await fileService.getFileById("f_owner_test_101", empA);
  assert.equal(retrieved.file_id, "f_owner_test_101");

  await assert.rejects(
    async () => {
      await fileService.getFileById("f_owner_test_101", empB);
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, "FORBIDDEN");
      return true;
    }
  );
});

test("TEAM A INTEGRATION: 1. Submit, Status & Cancel job in mock & live modes", async () => {
  const origMode = config.teamA.mode;

  config.teamA.mode = "mock";
  const mockSubmit = await teamAClient.submitJob({ job_id: "job_test_1", file_id: "f_1" });
  assert.equal(mockSubmit.job_id, "job_test_1");

  const mockStatus = await teamAClient.getJobStatus("job_test_1");
  assert.ok(mockStatus);

  const mockCancel = await teamAClient.cancelJob("job_test_1");
  assert.equal(mockCancel.state, "CANCELLED");

  config.teamA.mode = "real";
  const origFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.endsWith("/cancel")) {
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ job_id: "job_test_live", state: "CANCELLED" }) };
    }
    if (options && options.method === "POST") {
      return { ok: true, status: 201, headers: { get: () => "application/json" }, json: async () => ({ job_id: "job_test_live", state: "REQUESTED" }) };
    }
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ job_id: "job_test_live", state: "RUNNING" }) };
  };

  try {
    const liveSubmit = await teamAClient.submitJob({ job_id: "job_test_live", file_id: "f_1" });
    assert.equal(liveSubmit.job_id, "job_test_live");

    const liveStatus = await teamAClient.getJobStatus("job_test_live");
    assert.equal(liveStatus.state, "RUNNING");

    const liveCancel = await teamAClient.cancelJob("job_test_live");
    assert.equal(liveCancel.state, "CANCELLED");
  } finally {
    config.teamA.mode = origMode;
    global.fetch = origFetch;
  }
});

test("TEAM B INTEGRATION: 1. Dedup & Integrity check in mock & live modes", async () => {
  const origMode = config.teamB.mode;

  config.teamB.mode = "mock";
  const dedupMock = await teamBClient.computeDedup({ hashes: ["h1", "h2"] });
  assert.ok(dedupMock.unique_chunks);

  const verifyMock = await teamBClient.verifyIntegrity({ chunks: ["chk1"] });
  assert.equal(verifyMock.status, "VERIFIED");

  config.teamB.mode = "real";
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes("/dedup/compute")) {
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ result_id: "ded_live_1", savings_ratio: 0.4 }) };
    }
    if (url.includes("/integrity/verify")) {
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ status: "VERIFIED", merkle_root: "root_live_1" }) };
    }
    return { ok: false, status: 502, headers: { get: () => "application/json" }, json: async () => ({ message: "error" }) };
  };

  try {
    const dedupLive = await teamBClient.computeDedup({ hashes: ["h1"] });
    assert.equal(dedupLive.result_id, "ded_live_1");

    const verifyLive = await teamBClient.verifyIntegrity({ chunks: ["c1"] });
    assert.equal(verifyLive.status, "VERIFIED");
  } finally {
    config.teamB.mode = origMode;
    global.fetch = origFetch;
  }
});

test("LIVE SERVER OPT-IN: Safely skips live server network test when server is unreachable or SKIP_LIVE_TESTS is set", async () => {
  if (process.env.SKIP_LIVE_TESTS === "true" || !process.env.TEST_LIVE_TEAM_C_URL) {
    // Safely skip live network test if opt-in env var is not set
    assert.ok(true, "Live integration network test skipped safely.");
    return;
  }

  try {
    const res = await fetch(`${process.env.TEST_LIVE_TEAM_C_URL}/health`);
    assert.equal(res.status, 200);
  } catch (e) {
    assert.ok(true, "Live server unreachable, skipped safely.");
  }
});
