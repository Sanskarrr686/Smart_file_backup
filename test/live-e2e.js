// LIVE end-to-end check: Team D -> Team C -> MySQL (+ MinIO + Team A).
//   BASE_URL=http://localhost:3000 TEAM_D_SERVICE_SECRET=... node test/live-e2e.js
// Needs the seed users (divya=Employee id1, arjun=IT Admin id2, kavya=Auditor id3, password Password@123).
const crypto = require("node:crypto");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const SECRET = process.env.TEAM_D_SERVICE_SECRET;
const PW = process.env.SEED_PASSWORD || "Password@123";
if (!SECRET) { console.error("set TEAM_D_SERVICE_SECRET"); process.exit(2); }
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); };
const asUser = (id, role) => ({ Authorization: `Bearer ${SECRET}`, "X-TeamC-User-Id": String(id), "X-TeamC-Role": role });
const svc = { Authorization: `Bearer ${SECRET}` };
async function call(method, path, { headers = {}, json, form } = {}) {
    const h = { ...headers }; let body;
    if (json) { h["Content-Type"] = "application/json"; body = JSON.stringify(json); }
    if (form) body = form;
    const r = await fetch(BASE + path, { method, headers: h, body });
    const raw = Buffer.from(await r.arrayBuffer());
    let j = null; try { j = JSON.parse(raw.toString()); } catch {}
    return { status: r.status, json: j, raw };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    console.log("== Login (service credential only) ==");
    const login = (u, p, h = svc) => call("POST", "/api/v1/auth/verify-credentials", { headers: h, json: { username: u, password: p } });
    let r = await login("Swati", PW);
    ok("Employee login", r.status === 200 && r.json.data.role === "Employee" && r.json.data.user_id === 1, JSON.stringify(r.json));
    ok("no password_hash in response", !JSON.stringify(r.json).includes("password"), JSON.stringify(r.json));
    r = await login("arjun", PW); ok("IT Admin login", r.status === 200 && r.json.data.role === "IT Admin");
    r = await login("kavya", PW); ok("Auditor login", r.status === 200 && r.json.data.role === "Auditor");
    r = await login("Swati", "wrong-password"); ok("wrong password -> 401", r.status === 401 && r.json.error.code === "INVALID_CREDENTIALS");
    const unk = await login("nobody_here", "whatever1");
    ok("unknown user same 401 + same message", unk.status === 401 && unk.json.error.message === r.json.error.message);
    r = await login("Swati", PW, {}); ok("login without service secret -> 401", r.status === 401);
    r = await login("Swati", PW, { Authorization: "Bearer wrong" }); ok("login with wrong secret -> 401", r.status === 401);
    r = await call("POST", "/api/v1/auth/verify-credentials", { headers: svc, json: { username: "Swati" } }); ok("missing password -> 400", r.status === 400);

    console.log("== Create user ==");
    const uname = "emp" + crypto.randomBytes(3).toString("hex");
    r = await call("POST", "/api/v1/users", { headers: asUser(2, "IT Admin"), json: { username: uname, password: "Secret@1234", role: "Employee" } });
    const newId = r.json?.data?.user_id;
    ok("IT Admin creates user, ID returned", r.status === 201 && Number.isInteger(newId) && r.json.data.role === "Employee", JSON.stringify(r.json));
    r = await login(uname, "Secret@1234"); ok("new user can log in; same ID", r.status === 200 && r.json.data.user_id === newId, JSON.stringify(r.json));
    r = await call("GET", `/api/v1/integration/users/${newId}`, { headers: svc }); ok("integration lookup finds new user", r.status === 200 && r.json.data.role === "Employee");
    r = await call("POST", "/api/v1/users", { headers: asUser(1, "Employee"), json: { username: "hacker1", password: "Secret@1234", role: "IT Admin" } }); ok("Employee cannot create user -> 403", r.status === 403);
    r = await call("POST", "/api/v1/users", { headers: asUser(3, "Auditor"), json: { username: "hacker2", password: "Secret@1234", role: "IT Admin" } }); ok("Auditor cannot create user -> 403", r.status === 403);
    r = await call("POST", "/api/v1/users", { headers: asUser(2, "IT Admin"), json: { username: uname, password: "Secret@1234", role: "Employee" } }); ok("duplicate username -> 409", r.status === 409);
    r = await call("POST", "/api/v1/users", { headers: asUser(2, "IT Admin"), json: { username: "shortpw1", password: "123", role: "Employee" } }); ok("weak password -> 400", r.status === 400);
    r = await call("POST", "/api/v1/users", { headers: asUser(2, "IT Admin"), json: { username: "badrole1", password: "Secret@1234", role: "Root" } }); ok("invalid role -> 400", r.status === 400);
    r = await call("PATCH", `/api/v1/users/${newId}`, { headers: asUser(2, "IT Admin"), json: { is_active: false } }); ok("admin disables user", r.status === 200);
    r = await login(uname, "Secret@1234"); ok("disabled user cannot log in -> 403", r.status === 403);
    r = await call("PATCH", "/api/v1/users/2", { headers: asUser(2, "IT Admin"), json: { is_active: false } }); ok("admin cannot disable self -> 409", r.status === 409);
    r = await call("GET", "/api/v1/users", { headers: asUser(2, "IT Admin") }); ok("admin lists users", r.status === 200 && r.json.data.length >= 6);

    console.log("== Protected API with identity ==");
    r = await call("GET", "/api/v1/files", { headers: asUser(1, "Employee") }); ok("protected Team C call succeeds", r.status === 200);
    r = await call("GET", "/api/v1/files", { headers: { Authorization: `Bearer ${SECRET}`, "X-TeamC-User-Id": "1", "X-TeamC-Role": "IT Admin" } }); ok("role mismatch -> 403", r.status === 403);
    r = await call("GET", "/api/v1/files", {}); ok("no credentials -> 401", r.status === 401);

    console.log("== Real file: upload -> backup -> integrity -> restore -> compare ==");
    const content = Buffer.from("Hello Backup System " + crypto.randomBytes(4).toString("hex"));
    const sha = crypto.createHash("sha256").update(content).digest("hex");
    const form = () => { const f = new FormData(); f.append("file", new Blob([content]), "demo.txt"); f.append("file_name", "demo.txt"); f.append("user_id", "1"); return f; };
    const idem = "up-" + crypto.randomBytes(4).toString("hex");
    r = await call("POST", "/api/v1/files", { headers: { ...asUser(1, "Employee"), "Idempotency-Key": idem }, form: form() });
    const fileId = r.json?.data?.file_id, versionId = r.json?.data?.version_id;
    ok("upload returns file_id/version_id/checksum", r.status === 201 && fileId && versionId && r.json.data.checksum === sha, JSON.stringify(r.json));
    const r2 = await call("POST", "/api/v1/files", { headers: { ...asUser(1, "Employee"), "Idempotency-Key": idem }, form: form() });
    ok("upload replay is idempotent (same file_id)", r2.json?.data?.file_id === fileId, JSON.stringify(r2.json));
    r = await call("GET", `/api/v1/files/${fileId}/versions`, { headers: asUser(1, "Employee") }); ok("versions saved in MySQL", r.status === 200 && r.json.data.length === 1);
    r = await call("GET", `/api/v1/files/${fileId}`, { headers: asUser(4, "Employee") }); ok("other employee blocked from file -> 403", r.status === 403);
    r = await call("GET", `/api/v1/files/${fileId}`, { headers: asUser(3, "Auditor") }); ok("auditor can read file", r.status === 200);

    r = await call("POST", "/api/v1/backups", { headers: { ...asUser(1, "Employee"), "Idempotency-Key": "bk-" + idem }, json: { user_id: 1, file_id: fileId, version_id: versionId, backup_type: "FULL" } });
    const backupId = r.json?.data?.backup_id;
    ok("backup accepted", [200, 201, 202].includes(r.status) && backupId, JSON.stringify(r.json));
    let state = null;
    for (let i = 0; i < 30; i++) { await sleep(500); const s = await call("GET", `/api/v1/backups/${backupId}`, { headers: asUser(1, "Employee") }); state = s.json?.data?.state; if (["COMPLETED", "FAILED"].includes(state)) break; }
    ok("backup reaches COMPLETED (copy verified)", state === "COMPLETED", "state=" + state);

    r = await call("POST", "/restore", { headers: asUser(1, "Employee"), json: { backup_id: backupId, version_id: versionId } });
    const restoreId = r.json?.data?.restore_id;
    ok("restore request created (PENDING)", restoreId && r.json.data.commit_status === "PENDING", JSON.stringify(r.json));
    r = await call("POST", "/internal/v1/restores/commit", { headers: asUser(1, "Employee"), json: { restore_id: restoreId } });
    ok("restore commit verified", r.status === 200 && r.json.data.checksum === sha, JSON.stringify(r.json));
    r = await call("GET", `/api/v1/restores/${restoreId}/download`, { headers: asUser(1, "Employee") });
    ok("restored bytes identical to original", r.status === 200 && Buffer.compare(r.raw, content) === 0, `status ${r.status}`);
    ok("restored sha256 matches", crypto.createHash("sha256").update(r.raw).digest("hex") === sha);
    r = await call("GET", `/api/v1/restores/${restoreId}/download`, { headers: asUser(4, "Employee") }); ok("other employee cannot download restore -> 403", r.status === 403);

    console.log("== Audit ==");
    r = await call("GET", "/api/v1/audit", { headers: asUser(3, "Auditor") });
    ok("auditor reads audit incl. user creation + backup", r.status === 200 && r.json.data.some((a) => a.entity_type === "USERS") , JSON.stringify(r.json).slice(0, 200));
    r = await call("GET", "/api/v1/audit", { headers: asUser(1, "Employee") }); ok("employee blocked from audit -> 403", r.status === 403);
    r = await call("DELETE", `/api/v1/files/${fileId}`, { headers: asUser(3, "Auditor") }); ok("auditor cannot delete -> 403", r.status === 403);
    r = await call("DELETE", `/api/v1/files/${fileId}`, { headers: asUser(1, "Employee") }); ok("delete file that has backup history is refused cleanly (409)", r.status === 409 && r.json.error.code === "FILE_HAS_BACKUPS", `${r.status} ${JSON.stringify(r.json)}`);

    console.log(`---- ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
