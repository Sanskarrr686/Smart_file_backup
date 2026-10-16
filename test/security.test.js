const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

process.env.NODE_ENV = "test";
process.env.DOTENV_CONFIG_QUIET = "true";
process.env.PORT = "0";
const testServiceSecret = require("node:crypto").randomBytes(32).toString("hex");
process.env.TEAM_D_SERVICE_SECRET = testServiceSecret;
process.env.MINIO_ENDPOINT = "http://minio.invalid";
process.env.MINIO_ACCESS_KEY = "mock";
process.env.MINIO_SECRET_KEY = "mock";
process.env.MINIO_REGION = "us-east-1";
process.env.TEAM_A_BASE_URL = "http://team-a.mock";
process.env.TEAM_B_BASE_URL = "";

const s3Calls = [];
const mockObjects = new Map();
const mockChunksByHash = new Map();
const mockVersionChunks = new Map();
let nextChunkId = 1;
mockObjects.set("version-100", Buffer.from("restore bytes"));
const mockBackupStates = new Map([[50, "COMPLETED"]]);
let failPut = false;
let failFileInsert = true;
let fileInsertCalls = 0;
let mockUploadRecord = null;
class MockS3Client { async send(command) { s3Calls.push(command); if (command.constructor.name === "PutObjectCommand" && failPut) throw new Error("mock storage failure"); if (command.constructor.name === "PutObjectCommand") mockObjects.set(command.input.Key, Buffer.from(command.input.Body)); if (command.constructor.name === "GetObjectCommand") { const value = mockObjects.get(command.input.Key); if (!value) throw Object.assign(new Error("not found"), { name: "NoSuchKey" }); return { Body: { transformToByteArray: async () => value } }; } if (command.constructor.name === "DeleteObjectCommand") mockObjects.delete(command.input.Key); return {}; } }
class PutObjectCommand { constructor(input) { this.input = input; } }
class DeleteObjectCommand { constructor(input) { this.input = input; } }
class GetObjectCommand { constructor(input) { this.input = input; } }

const fakeDb = {
    connect() {},
    beginTransaction(callback) { callback(null); },
    commit(callback) { callback(null); },
    rollback(callback) { callback(null); },
    query(sql, params, callback) {
        if (typeof params === "function") { callback = params; params = []; }
        const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
        let rows = [];
        if (q.includes("from users u join roles r")) {
            const id = Number(params[0]);
            const roles = { 1: "Employee", 2: "IT Admin", 3: "Auditor" };
            if (id === 7) rows = q.includes("as role") ? [{ user_id: id, is_active: 0, role: "Employee" }] : [{ user_id: id, is_active: 0, role_name: "Employee" }];
            else if (roles[id]) rows = q.includes("as role") ? [{ user_id: id, is_active: 1, role: roles[id] }] : [{ user_id: id, is_active: 1, role_name: roles[id] }];
        } else if (q.includes("from files where file_id")) {
            const owners = { 10: 1, 20: 2 };
            if (owners[Number(params[0])]) rows = [{ user_id: owners[Number(params[0])] }];
        } else if (q.includes("from file_versions v join files f")) {
            const owners = { 100: 1, 200: 2 };
            if (owners[Number(params[0])]) rows = [{ user_id: owners[Number(params[0])] }];
        } else if (q.includes("from backup_jobs where backup_id")) {
            const owners = { 50: 1, 60: 2 };
            if (owners[Number(params[0])]) rows = [{ user_id: owners[Number(params[0])] }];
        } else if (q.startsWith("select file_id, source_path as object_key")) {
            rows = [{ file_id: 10, object_key: "version-100" }];
        } else if (q.startsWith("select version_id, version_number")) {
            rows = [{ version_id: 100, version_number: 1 }];
        } else if (q.startsWith("select fv.object_key, f.source_path")) {
            rows = [{ object_key: "version-100", source_path: "version-100", checksum: require("node:crypto").createHash("sha256").update("restore bytes").digest("hex"), size_bytes: 13 }];
        } else if (q.startsWith("insert into backup_jobs")) {
            mockBackupStates.set(51, "REQUESTED"); callback(null, { insertId: 51 }); return;
        } else if (q.startsWith("update backup_jobs set state='running'")) {
            mockBackupStates.set(Number(params[0]), "RUNNING"); callback(null, { affectedRows: 1 }); return;
        } else if (q.startsWith("update backup_jobs set state='completed'")) {
            mockBackupStates.set(Number(params[1]), "COMPLETED"); callback(null, { affectedRows: 1 }); return;
        } else if (q.startsWith("update backup_jobs set state='failed'")) {
            mockBackupStates.set(Number(params[1]), "FAILED"); callback(null, { affectedRows: 1 }); return;
        } else if (q.startsWith("insert into chunks")) {
            for (const [chunkHash, chunkSize, storageRef] of params[0]) {
                if (!mockChunksByHash.has(chunkHash)) mockChunksByHash.set(chunkHash, { chunk_id: nextChunkId++, chunk_size: chunkSize, storage_ref: storageRef });
            }
            callback(null, { affectedRows: params[0].length }); return;
        } else if (q.startsWith("select chunk_id, chunk_hash from chunks")) {
            rows = params[0].filter((chunkHash) => mockChunksByHash.has(chunkHash)).map((chunkHash) => ({
                chunk_id: mockChunksByHash.get(chunkHash).chunk_id,
                chunk_hash: chunkHash
            }));
        } else if (q.startsWith("delete from version_chunks")) {
            mockVersionChunks.delete(Number(params[0])); callback(null, { affectedRows: 1 }); return;
        } else if (q.startsWith("insert into version_chunks")) {
            mockVersionChunks.set(Number(params[0][0][0]), params[0]); callback(null, { affectedRows: params[0].length }); return;
        } else if (q.startsWith("select version_number from file_versions")) {
            rows = [{ version_number: 1 }];
        } else if (q.startsWith("select bj.backup_id")) {
            const id = Number(params[0]); if (id === 50 || id === 51) rows = [{ backup_id: id, user_id: 1, file_id: 10, version_id: 100, backup_type: "FULL", state: mockBackupStates.get(id), file_name: "restore.txt", idempotency_key: "backup-test-key", correlation_id: "test", created_at: new Date(), committed_at: null }];
        } else if (q.includes("from backup_jobs bj") && q.startsWith("select bj.backup_id")) {
            if (Number(params[0]) === 50) rows = [{ backup_id: 50, user_id: 1, file_id: 10, state: "COMPLETED" }];
        } else if (q.includes("from restore_requests rr")) {
            if (Number(params[0]) === 70) rows = [{ restore_id: 70, backup_id: 50, version_id: 100, user_id: 1, commit_status: "PENDING", restored_object_key: null, correlation_id: "test", file_id: 10, backup_state: "COMPLETED", file_name: "restore.txt", source_path: "version-100", version_object_key: "version-100", checksum: require("node:crypto").createHash("sha256").update("restore bytes").digest("hex"), size_bytes: 13, version_state: "COMMITTED", duration_days: 30, age_days: 1 }];
        } else if (q.startsWith("select restored_object_key, commit_status")) {
            rows = [{ restored_object_key: "users/1/restores/70/restore.txt", commit_status: "COMPLETED" }];
        } else if (q.includes("from restore_requests where restore_id")) {
            const owners = { 70: 1, 80: 2 };
            if (owners[Number(params[0])]) rows = [{ user_id: owners[Number(params[0])] }];
        } else if (q.startsWith("update restore_requests")) {
            callback(null, { affectedRows: 1 }); return;
        } else if (q.startsWith("insert into files")) {
            fileInsertCalls += 1;
            if (failFileInsert) { callback(new Error("controlled insert failure")); return; }
            mockUploadRecord = { file_id: 91, user_id: Number(params[0]), file_name: params[3], object_key: params[4], upload_idempotency_key: params[5] };
            callback(null, { insertId: 91 }); return;
        } else if (q.startsWith("select f.file_id, f.file_name")) {
            if (mockUploadRecord && mockUploadRecord.user_id === Number(params[0]) && mockUploadRecord.upload_idempotency_key === params[1]) {
                rows = [{ ...mockUploadRecord, version_id: 101, checksum: mockUploadRecord.checksum }];
            }
        } else if (q.startsWith("insert into file_versions")) {
            if (mockUploadRecord) mockUploadRecord.checksum = params[1];
            callback(null, { insertId: 101 }); return;
        }
        callback(null, rows);
    }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === "mysql2") return { createConnection: () => fakeDb };
    if (request === "@aws-sdk/client-s3") return { S3Client: MockS3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
    return originalLoad.call(this, request, parent, isMain);
};
const { app } = require("../server");
Module._load = originalLoad;
const nativeFetch = global.fetch;
global.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://team-a.mock/")) {
        const body = url.includes("locks/acquire") ? { data: { leaseId: "lease-test" } } : { data: { job_id: "backup-51" } };
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return nativeFetch(input, init);
};

let server;
let baseUrl;
test.before(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => server.close(resolve)));

function headers(userId = 1, role = "Employee") {
    return { Authorization: `Bearer ${testServiceSecret}`, "X-TeamC-User-Id": String(userId), "X-TeamC-Role": role };
}
async function get(path, h = headers()) { return fetch(`${baseUrl}${path}`, { headers: h }); }

test("protected routes reject missing and invalid credentials", async () => {
    assert.equal((await get("/api/v1/files", {})).status, 401);
    assert.equal((await get("/api/v1/files", { Authorization: `Bearer ${testServiceSecret}` })).status, 401);
    assert.equal((await get("/api/v1/files", { ...headers(), Authorization: "test-only-service-secret" })).status, 401);
    assert.equal((await get("/api/v1/files", { ...headers(), Authorization: "Bearer invalid-token-value" })).status, 401);
    assert.equal((await get("/api/v1/files", headers(999, "Employee"))).status, 401);
    assert.equal((await get("/api/v1/files", headers(7, "Employee"))).status, 403);
    assert.equal((await get("/api/v1/files", { ...headers(), "X-TeamC-User-Id": "1.0" })).status, 401);
    assert.equal((await get("/api/v1/files", headers(1, "Auditor"))).status, 403);
    assert.equal((await get("/api/v1/files", { ...headers(), "X-User-ID": "2" })).status, 200);
});

test("employee file, version, backup, and restore ownership is enforced", async () => {
    assert.equal((await get("/api/v1/files/20/versions")).status, 403);
    assert.equal((await get("/api/v1/versions/200/chunks")).status, 403);
    assert.equal((await get("/api/v1/backups/60")).status, 403);
    assert.equal((await get("/restore/80")).status, 403);
    assert.equal((await get("/api/v1/files/10/versions")).status, 200);
    assert.equal((await get("/api/v1/backups/50")).status, 200);
    assert.equal((await get("/restore/70")).status, 200);
    const patchOther = await fetch(`${baseUrl}/api/v1/files/20`, { method: "PATCH", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ file_name: "changed.txt" }) });
    assert.equal(patchOther.status, 403);
    const deleteOther = await fetch(`${baseUrl}/api/v1/files/20`, { method: "DELETE", headers: headers() });
    assert.equal(deleteOther.status, 403);
    const cancelOther = await fetch(`${baseUrl}/api/v1/backups/60/cancel`, { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: "{}" });
    assert.equal(cancelOther.status, 403);
    const requestBackupOther = await fetch(`${baseUrl}/api/v1/backups`, { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ user_id: 1, file_id: 20, version_id: 200, backup_type: "FULL" }) });
    assert.equal(requestBackupOther.status, 403);
    const commitOther = await fetch(`${baseUrl}/internal/v1/restores/commit`, { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ restore_id: 80 }) });
    assert.equal(commitOther.status, 403);
});

test("auditor reads approved reporting and cannot write", async () => {
    assert.equal((await get("/api/v1/reports/storage", headers(3, "Auditor"))).status, 200);
    assert.equal((await get("/api/v1/audit", headers(3, "Auditor"))).status, 200);
    const response = await fetch(`${baseUrl}/api/v1/files/10`, { method: "PATCH", headers: { ...headers(3, "Auditor"), "Content-Type": "application/json" }, body: JSON.stringify({ file_name: "x" }) });
    assert.equal(response.status, 403);
    assert.equal((await get("/api/v1/reports/storage")).status, 403);
});

test("IT Admin may read cross-user backup and reports", async () => {
    assert.notEqual((await get("/api/v1/backups/60", headers(2, "IT Admin"))).status, 403);
    assert.notEqual((await get("/api/v1/reports/storage", headers(2, "IT Admin"))).status, 403);
});

test("backup state cannot be manually fabricated and restore returns verified stored bytes", async () => {
    const backup = await fetch(`${baseUrl}/api/v1/backups/50/complete`, { method: "POST", headers: headers(2, "IT Admin") });
    assert.equal(backup.status, 409);
    assert.equal((await backup.json()).error.code, "WORKER_OWNED_STATE");
    const restore = await fetch(`${baseUrl}/internal/v1/restores/commit`, { method: "POST", headers: { ...headers(2, "IT Admin"), "Content-Type": "application/json" }, body: JSON.stringify({ restore_id: 70 }) });
    assert.equal(restore.status, 200, await restore.clone().text());
    assert.equal((await restore.json()).data.commit_status, "COMPLETED");
    const download = await fetch(`${baseUrl}/api/v1/restores/70/download`, { headers: headers(1) });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), "restore bytes");
    assert.equal((await fetch(`${baseUrl}/api/v1/backups/0`, { headers: headers(2, "IT Admin") })).status, 400);
});

test("backup worker copies and verifies the version object before marking success", async () => {
    const response = await fetch(`${baseUrl}/api/v1/backups`, { method: "POST", headers: { ...headers(), "Content-Type": "application/json", "Idempotency-Key": "backup-test-key-51" }, body: JSON.stringify({ user_id: 1, file_id: 10, version_id: 100, backup_type: "FULL" }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.state, "REQUESTED");
    const started = Date.now();
    while (mockBackupStates.get(51) !== "COMPLETED" && Date.now() - started < 1000) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(mockBackupStates.get(51), "COMPLETED");
    assert.deepEqual(mockObjects.get("users/1/backups/51/100"), Buffer.from("restore bytes"));
    assert.equal(mockChunksByHash.size, 1);
    assert.equal(mockVersionChunks.get(100).length, 1);
});

test("upload uses authenticated identity and cleans object after DB insert failure", async () => {
    const form = new FormData();
    form.set("file", new Blob(["abc"]), "test.txt");
    form.set("file_name", "test.txt");
    form.set("user_id", "1");
    const before = s3Calls.length;
    const response = await fetch(`${baseUrl}/api/v1/files`, { method: "POST", headers: { ...headers(), "Idempotency-Key": "upload-test-key-001" }, body: form });
    assert.equal(response.status, 500);
    assert.equal(s3Calls.length - before, 2);
    assert.equal(s3Calls[before].constructor.name, "PutObjectCommand");
    assert.equal(s3Calls[before + 1].constructor.name, "DeleteObjectCommand");
    const insertsBeforeStorageFailure = fileInsertCalls;
    failPut = true;
    const storageFailed = new FormData();
    storageFailed.set("file", new Blob(["abc"]), "test.txt"); storageFailed.set("file_name", "test.txt"); storageFailed.set("user_id", "1");
    const storageResponse = await fetch(`${baseUrl}/api/v1/files`, { method: "POST", headers: { ...headers(), "Idempotency-Key": "upload-test-key-003" }, body: storageFailed });
    failPut = false;
    assert.equal(storageResponse.status, 502);
    assert.equal(fileInsertCalls, insertsBeforeStorageFailure);
    failFileInsert = false;
    const successfulForm = new FormData();
    successfulForm.set("file", new Blob(["actual bytes"]), "real.txt"); successfulForm.set("file_name", "real.txt"); successfulForm.set("user_id", "1");
    const successfulHeaders = { ...headers(), "Idempotency-Key": "upload-test-key-002" };
    const created = await fetch(`${baseUrl}/api/v1/files`, { method: "POST", headers: successfulHeaders, body: successfulForm });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.version_id, 101);
    const objectsAfterCreate = s3Calls.length;
    const retryForm = new FormData();
    retryForm.set("file", new Blob(["actual bytes"]), "real.txt"); retryForm.set("file_name", "real.txt"); retryForm.set("user_id", "1");
    const retry = await fetch(`${baseUrl}/api/v1/files`, { method: "POST", headers: successfulHeaders, body: retryForm });
    assert.equal(retry.status, 200);
    assert.equal(s3Calls.length, objectsAfterCreate);
    const mismatch = new FormData();
    mismatch.set("file", new Blob(["abc"]), "test.txt"); mismatch.set("file_name", "test.txt"); mismatch.set("user_id", "2");
    assert.equal((await fetch(`${baseUrl}/api/v1/files`, { method: "POST", headers: { ...headers(), "Idempotency-Key": "upload-test-key-004" }, body: mismatch })).status, 403);
    const empty = new FormData();
    empty.set("file", new Blob([""]), "empty.txt"); empty.set("file_name", "empty.txt"); empty.set("user_id", "1");
    assert.equal((await fetch(`${baseUrl}/api/v1/files`, { method: "POST", headers: { ...headers(), "Idempotency-Key": "upload-test-key-005" }, body: empty })).status, 400);
});

test("integration lookup requires service credential and returns minimum identity", async () => {
    assert.equal((await get("/api/v1/integration/users/1", {})).status, 401);
    const response = await get("/api/v1/integration/users/1", headers());
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { user_id: 1, role: "Employee" });
});
