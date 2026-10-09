// src/clients/teamCClient.js

const config = require("../config/env");
const { request } = require("./httpClient");
const crypto = require("crypto");

const {
  files,
  fileVersions,
  backups,
  restores,
  storageReport,
  auditLog,
  db,
} = require("../mocks/teamC");

const usersMock = require("../mocks/users");

function makeHeaders(options = {}) {
  const headers = {};
  if (options.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }
  return headers;
}

async function getFiles(userId, role, options = {}) {
  if (config.teamC.mode === "mock") {
    if (role === "IT Admin" || role === "Auditor") {
      return files;
    }
    return files.filter((f) => f.owner_id === userId);
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files?user_id=${encodeURIComponent(
      userId
    )}&role=${encodeURIComponent(role)}`,
    { headers: makeHeaders(options) }
  );
}

async function getFile(fileId, options = {}) {
  if (config.teamC.mode === "mock") {
    return files.find((f) => f.file_id === fileId) || null;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}`,
    { headers: makeHeaders(options) }
  );
}

async function updateFile(fileId, updateData, options = {}) {
  if (config.teamC.mode === "mock") {
    const file = files.find((f) => f.file_id === fileId);
    if (!file) return null;
    Object.assign(file, updateData);
    file.modified = new Date().toISOString();
    db.save();
    return file;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}`,
    {
      method: "PATCH",
      headers: makeHeaders(options),
      body: JSON.stringify(updateData),
    }
  );
}

async function deleteFile(fileId, options = {}) {
  if (config.teamC.mode === "mock") {
    const idx = files.findIndex((f) => f.file_id === fileId);
    if (idx === -1) return { success: false, reason: "NOT_FOUND" };
    files.splice(idx, 1);
    db.save();
    return { success: true };
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: makeHeaders(options),
    }
  );
}

async function getFileVersions(fileId, options = {}) {
  if (config.teamC.mode === "mock") {
    return fileVersions[fileId] || [];
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files/${encodeURIComponent(
      fileId
    )}/versions`,
    { headers: makeHeaders(options) }
  );
}

async function getFileRetention(fileId, options = {}) {
  if (config.teamC.mode === "mock") {
    return { file_id: fileId, retention_days: 90, policy: "STANDARD" };
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files/${encodeURIComponent(
      fileId
    )}/retention`,
    { headers: makeHeaders(options) }
  );
}

async function getVersionChunks(versionId, options = {}) {
  if (config.teamC.mode === "mock") {
    return [
      { chunk_id: "chk_1", checksum: "hash1", size: 4096 },
      { chunk_id: "chk_2", checksum: "hash2", size: 4096 },
    ];
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/versions/${encodeURIComponent(
      versionId
    )}/chunks`,
    { headers: makeHeaders(options) }
  );
}

async function getBackups(userId, role, options = {}) {
  if (config.teamC.mode === "mock") {
    if (role === "IT Admin" || role === "Auditor") {
      return backups;
    }
    return backups.filter((b) => b.user_id === userId);
  }

  // UNCONFIRMED endpoint: GET /api/v1/backups
  try {
    return await request(
      `${config.teamC.baseUrl}/api/v1/backups?user_id=${encodeURIComponent(
        userId
      )}&role=${encodeURIComponent(role)}`,
      { headers: makeHeaders(options) }
    );
  } catch (err) {
    if (
      err.status === 404 ||
      err.status === 502 ||
      err.code === "UPSTREAM_FAILURE" ||
      err.code === "UPSTREAM_TIMEOUT"
    ) {
      return {
        items: [],
        upstream_unavailable: true,
        reason: "Team C has not yet published this endpoint",
      };
    }
    throw err;
  }
}

async function getBackup(backupId, options = {}) {
  if (config.teamC.mode === "mock") {
    return backups.find((b) => b.backup_id === backupId) || null;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/backups/${encodeURIComponent(backupId)}`,
    { headers: makeHeaders(options) }
  );
}

async function createBackup({ file_id, file_name, user_id }, options = {}) {
  if (config.teamC.mode === "mock") {
    const backup_id = "bkp_" + crypto.randomBytes(3).toString("hex");

    const newBackup = {
      backup_id,
      file_id,
      file_name,
      state: "QUEUED",
      date: new Date().toISOString(),
      user_id,
    };

    backups.push(newBackup);
    db.save();
    return newBackup;
  }

  return request(`${config.teamC.baseUrl}/api/v1/backups`, {
    method: "POST",
    headers: makeHeaders(options),
    body: JSON.stringify({
      file_id,
      file_name,
      user_id,
    }),
  });
}

async function cancelBackup(backupId, options = {}) {
  if (config.teamC.mode === "mock") {
    const backup = backups.find((b) => b.backup_id === backupId);
    if (backup) backup.state = "CANCELLED";
    return backup || { backup_id: backupId, state: "CANCELLED" };
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/backups/${encodeURIComponent(
      backupId
    )}/cancel`,
    {
      method: "POST",
      headers: makeHeaders(options),
    }
  );
}

async function getRestores(userId, role, options = {}) {
  if (config.teamC.mode === "mock") {
    if (role === "IT Admin" || role === "Auditor") {
      return restores;
    }
    return restores.filter((r) => r.user_id === userId);
  }

  // UNCONFIRMED endpoint: GET /api/v1/restores
  try {
    return await request(
      `${config.teamC.baseUrl}/api/v1/restores?user_id=${encodeURIComponent(
        userId
      )}&role=${encodeURIComponent(role)}`,
      { headers: makeHeaders(options) }
    );
  } catch (err) {
    if (
      err.status === 404 ||
      err.status === 502 ||
      err.code === "UPSTREAM_FAILURE" ||
      err.code === "UPSTREAM_TIMEOUT"
    ) {
      return {
        items: [],
        upstream_unavailable: true,
        reason: "Team C has not yet published this endpoint",
      };
    }
    throw err;
  }
}

async function getRestore(restoreId, options = {}) {
  if (config.teamC.mode === "mock") {
    return restores.find((r) => r.restore_id === restoreId) || null;
  }

  // UNCONFIRMED endpoint: GET /api/v1/restores/{restoreId}
  try {
    return await request(
      `${config.teamC.baseUrl}/api/v1/restores/${encodeURIComponent(
        restoreId
      )}`,
      { headers: makeHeaders(options) }
    );
  } catch (err) {
    if (
      err.status === 404 ||
      err.status === 502 ||
      err.code === "UPSTREAM_FAILURE" ||
      err.code === "UPSTREAM_TIMEOUT"
    ) {
      return {
        restore_id: restoreId,
        state: "UNAVAILABLE",
        upstream_unavailable: true,
        reason: "Team C has not yet published this endpoint",
      };
    }
    throw err;
  }
}

async function createRestore({ file_id, version_id, user_id }, options = {}) {
  if (config.teamC.mode === "mock") {
    const restore_id = "rst_" + crypto.randomBytes(3).toString("hex");
    const newRestore = {
      restore_id,
      file_id,
      version_id,
      state: "PENDING",
      requested_at: new Date().toISOString(),
      user_id,
    };
    restores.push(newRestore);
    db.save();
    return newRestore;
  }

  // UNCONFIRMED endpoint: POST /internal/v1/restores/commit
  try {
    return await request(
      `${config.teamC.baseUrl}/internal/v1/restores/commit`,
      {
        method: "POST",
        headers: makeHeaders(options),
        body: JSON.stringify({
          file_id,
          version_id,
          user_id,
        }),
      }
    );
  } catch (err) {
    if (
      err.status === 404 ||
      err.status === 502 ||
      err.code === "UPSTREAM_FAILURE" ||
      err.code === "UPSTREAM_TIMEOUT"
    ) {
      const restore_id = "rst_" + crypto.randomBytes(3).toString("hex");
      return {
        restore_id,
        file_id,
        version_id,
        state: "PENDING",
        requested_at: new Date().toISOString(),
        user_id,
        upstream_unavailable: true,
        reason: "Team C has not yet published this endpoint",
      };
    }
    throw err;
  }
}

async function getStorageReport(options = {}) {
  if (config.teamC.mode === "mock") {
    return storageReport;
  }

  return request(`${config.teamC.baseUrl}/api/v1/reports/storage`, {
    headers: makeHeaders(options),
  });
}

async function getAuditLog(options = {}) {
  if (config.teamC.mode === "mock") {
    return auditLog;
  }

  return request(`${config.teamC.baseUrl}/api/v1/audit`, {
    headers: makeHeaders(options),
  });
}

// User Management methods
async function getUsers(options = {}) {
  if (config.teamC.mode === "mock") {
    return usersMock.map(({ password, ...u }) => u);
  }

  return request(`${config.teamC.baseUrl}/api/v1/users`, {
    headers: makeHeaders(options),
  });
}

async function getUser(userId, options = {}) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(userId)}`,
    { headers: makeHeaders(options) }
  );
}

async function findUserByUsername(username, options = {}) {
  if (config.teamC.mode === "mock") {
    return usersMock.find((u) => u.username === username) || null;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/users/by-username?username=${encodeURIComponent(
      username
    )}`,
    { headers: makeHeaders(options) }
  );
}

async function createUser(userData, options = {}) {
  if (config.teamC.mode === "mock") {
    const bcrypt = require("bcryptjs");
    const user_id = "u_" + Math.floor(100 + Math.random() * 900);
    const newUser = {
      user_id,
      name: userData.name,
      username: userData.username,
      password: bcrypt.hashSync(userData.password, 10),
      role: userData.role,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
    };
    usersMock.push(newUser);
    const { password, ...safeUser } = newUser;
    return safeUser;
  }

  return request(`${config.teamC.baseUrl}/api/v1/users`, {
    method: "POST",
    headers: makeHeaders(options),
    body: JSON.stringify(userData),
  });
}

async function updateUser(userId, updateData, options = {}) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    if (updateData.name) user.name = updateData.name;
    if (updateData.role) user.role = updateData.role;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: makeHeaders(options),
      body: JSON.stringify(updateData),
    }
  );
}

async function updateUserStatus(userId, status, options = {}) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    user.status = status;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(
      userId
    )}/status`,
    {
      method: "PATCH",
      headers: makeHeaders(options),
      body: JSON.stringify({ status }),
    }
  );
}

async function resetPassword(userId, newPassword, options = {}) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    const bcrypt = require("bcryptjs");
    user.password = bcrypt.hashSync(newPassword, 10);
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(
      userId
    )}/reset-password`,
    {
      method: "POST",
      headers: makeHeaders(options),
      body: JSON.stringify({ password: newPassword }),
    }
  );
}

async function changePassword(userId, currentPassword, newPassword, options = {}) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return { success: false, reason: "USER_NOT_FOUND" };
    const bcrypt = require("bcryptjs");
    const isValid =
      user.password && (user.password.startsWith("$2a$") || user.password.startsWith("$2b$"))
        ? bcrypt.compareSync(currentPassword, user.password)
        : user.password === currentPassword;
    if (!isValid) {
      return { success: false, reason: "INVALID_CURRENT_PASSWORD" };
    }
    user.password = bcrypt.hashSync(newPassword, 10);
    return { success: true };
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(
      userId
    )}/change-password`,
    {
      method: "POST",
      headers: makeHeaders(options),
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }
  );
}

async function registerFile(fileData, options = {}) {
  if (config.teamC.mode === "mock") {
    const {
      file_id,
      name,
      type = "file",
      size_kb,
      size_bytes,
      owner_id,
      storage_provider,
      storage_bucket,
      storage_key,
      checksum,
      content_type,
    } = fileData;

    const newFile = {
      file_id: file_id || "f_" + crypto.randomBytes(3).toString("hex"),
      name,
      type,
      size_kb: size_kb || (size_bytes ? Math.round(size_bytes / 1024) : 0),
      size_bytes: size_bytes || (size_kb ? size_kb * 1024 : 0),
      modified: new Date().toISOString(),
      versions: 1,
      owner_id,
      storage_provider,
      storage_bucket,
      storage_key,
      storage_ref: {
        provider: storage_provider,
        bucket: storage_bucket,
        key: storage_key,
      },
      checksum,
      content_type,
      storage_status: "AVAILABLE",
    };

    files.push(newFile);

    if (!fileVersions[newFile.file_id]) {
      fileVersions[newFile.file_id] = [
        {
          version_id: "v1",
          state: "CURRENT",
          size_kb: newFile.size_kb,
          checksum: checksum || "sha256_mock_hash",
          created_at: newFile.modified,
          storage_key: storage_key,
        },
      ];
    }

    db.save();
    return newFile;
  }

  return request(`${config.teamC.baseUrl}/api/v1/files`, {
    method: "POST",
    headers: makeHeaders(options),
    body: JSON.stringify(fileData),
  });
}

module.exports = {
  getFiles,
  getFile,
  updateFile,
  deleteFile,
  getFileVersions,
  getFileRetention,
  getVersionChunks,
  registerFile,
  getBackups,
  getBackup,
  createBackup,
  cancelBackup,
  getRestores,
  getRestore,
  createRestore,
  getStorageReport,
  getAuditLog,
  getUsers,
  getUser,
  findUserByUsername,
  createUser,
  updateUser,
  updateUserStatus,
  resetPassword,
  changePassword,
};