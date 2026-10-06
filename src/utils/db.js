// src/utils/db.js
// Small JSON-file-backed data store (./data/db.json) for persistent operation state

const fs = require("fs");
const path = require("path");

const dbPath = path.join(process.cwd(), "data", "db.json");

const initialSeed = {
  files: [
    { file_id: "f_001", name: "budget.xlsx", type: "file", size_kb: 2150, size_bytes: 2201600, modified: "2026-07-29T14:00:00Z", versions: 3, owner_id: "u_101", storage_provider: "mock", storage_bucket: "backup-files", storage_key: "files/budget.xlsx" },
    { file_id: "f_002", name: "Q3 Report", type: "folder", modified: "2026-07-28T09:00:00Z", owner_id: "u_101" },
    { file_id: "f_003", name: "design_assets.zip", type: "file", size_kb: 51200, size_bytes: 52428800, modified: "2026-07-27T11:30:00Z", versions: 2, owner_id: "u_102", storage_provider: "mock", storage_bucket: "backup-files", storage_key: "files/design_assets.zip" },
  ],
  fileVersions: {
    f_001: [
      { version_id: "v4", state: "CURRENT", size_kb: 2150, checksum: "a1b2c3", created_at: "2026-07-29T14:00:00Z", storage_key: "files/budget.xlsx" },
      { version_id: "v3", state: "ARCHIVED", size_kb: 2100, checksum: "d4e5f6", created_at: "2026-07-20T10:00:00Z", storage_key: "v3" },
      { version_id: "v2", state: "ARCHIVED", size_kb: 2050, checksum: "g7h8i9", created_at: "2026-07-10T08:00:00Z", storage_key: "v2" },
    ],
    f_003: [
      { version_id: "v2", state: "CURRENT", size_kb: 51200, checksum: "z9y8x7", created_at: "2026-07-27T11:30:00Z", storage_key: "files/design_assets.zip" },
      { version_id: "v1", state: "ARCHIVED", size_kb: 48000, checksum: "w6v5u4", created_at: "2026-07-20T09:00:00Z", storage_key: "v1" },
    ],
  },
  backups: [
    { backup_id: "bkp_54", file_id: "f_001", file_name: "report.pdf", state: "FAILED", date: "2026-07-28T11:05:00Z", user_id: "u_101" },
    { backup_id: "bkp_55", file_id: "f_001", file_name: "budget.xlsx", state: "COMPLETED", date: "2026-07-29T14:20:00Z", user_id: "u_101" },
    { backup_id: "bkp_56", file_id: "f_003", file_name: "design_assets.zip", state: "COMMITTED", date: "2026-07-30T09:10:00Z", user_id: "u_102" },
  ],
  restores: [
    { restore_id: "rst_890", file_id: "f_001", version_id: "v3", state: "COMPLETED", requested_at: "2026-07-31T09:00:00Z", user_id: "u_101" },
  ],
  storageReport: {
    used_gb: 452.7,
    total_gb: 1000,
    dedup_savings_pct: 34,
    series: [
      { date: "2026-07-29", used_gb: 448.1, saved_gb: 150.9 },
      { date: "2026-07-30", used_gb: 452.7, saved_gb: 156.2 },
    ],
  },
  auditLog: [
    { actor: "admin1", action: "BACKUP_CREATED", target: "bkp_56", timestamp: "2026-07-30T09:10:00Z" },
    { actor: "employee1", action: "RESTORE_REQUESTED", target: "rst_890", timestamp: "2026-07-31T09:00:00Z" },
  ],
  notifications: [],
};

class JSONDatabase {
  constructor() {
    this.data = this._loadData();
  }

  _loadData() {
    try {
      const dataDir = path.dirname(dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, "utf8");
        const parsed = JSON.parse(raw);
        // Ensure all required fields exist
        return {
          files: parsed.files || JSON.parse(JSON.stringify(initialSeed.files)),
          fileVersions: parsed.fileVersions || JSON.parse(JSON.stringify(initialSeed.fileVersions)),
          backups: parsed.backups || JSON.parse(JSON.stringify(initialSeed.backups)),
          restores: parsed.restores || JSON.parse(JSON.stringify(initialSeed.restores)),
          storageReport: parsed.storageReport || JSON.parse(JSON.stringify(initialSeed.storageReport)),
          auditLog: parsed.auditLog || JSON.parse(JSON.stringify(initialSeed.auditLog)),
          notifications: parsed.notifications || [],
        };
      }
    } catch (e) {
      console.error("[JSONDatabase] Error loading db.json, re-initializing from seed:", e.message);
    }

    const seedCopy = JSON.parse(JSON.stringify(initialSeed));
    this.saveData(seedCopy);
    return seedCopy;
  }

  saveData(customData) {
    const toWrite = customData || this.data;
    try {
      const dataDir = path.dirname(dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(dbPath, JSON.stringify(toWrite, null, 2), "utf8");
    } catch (err) {
      console.error("[JSONDatabase] Error saving db.json:", err.message);
    }
  }

  save() {
    this.saveData();
  }
}

const dbInstance = new JSONDatabase();
module.exports = dbInstance;
