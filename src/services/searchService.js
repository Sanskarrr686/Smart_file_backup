// src/services/searchService.js

const db = require("../utils/db");

async function globalSearch(query, user) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    return { files: [], backups: [], restores: [] };
  }

  const role = user ? user.role : "Employee";
  const userId = user ? user.user_id : null;

  let allFiles = db.data.files || [];
  let allBackups = db.data.backups || [];
  let allRestores = db.data.restores || [];

  if (role === "Employee" && userId) {
    allFiles = allFiles.filter((f) => f.owner_id === userId);
    allBackups = allBackups.filter((b) => b.user_id === userId);
    allRestores = allRestores.filter((r) => r.user_id === userId);
  }

  const matchingFiles = allFiles.filter(
    (f) =>
      (f.file_id && f.file_id.toLowerCase().includes(q)) ||
      (f.name && f.name.toLowerCase().includes(q))
  );

  const matchingBackups = allBackups.filter(
    (b) =>
      (b.backup_id && b.backup_id.toLowerCase().includes(q)) ||
      (b.file_id && b.file_id.toLowerCase().includes(q)) ||
      (b.file_name && b.file_name.toLowerCase().includes(q))
  );

  const matchingRestores = allRestores.filter(
    (r) =>
      (r.restore_id && r.restore_id.toLowerCase().includes(q)) ||
      (r.file_id && r.file_id.toLowerCase().includes(q)) ||
      (r.version_id && r.version_id.toLowerCase().includes(q))
  );

  return {
    files: matchingFiles,
    backups: matchingBackups,
    restores: matchingRestores,
  };
}

module.exports = {
  globalSearch,
};
