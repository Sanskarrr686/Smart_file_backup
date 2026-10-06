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

async function getFiles(userId, role) {
  if (config.teamC.mode === "mock") {
    if (role === "IT Admin" || role === "Auditor") {
      return files;
    }
    return files.filter((f) => f.owner_id === userId);
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files?user_id=${encodeURIComponent(
      userId
    )}&role=${encodeURIComponent(role)}`
  );
}

async function getFile(fileId) {
  if (config.teamC.mode === "mock") {
    return files.find((f) => f.file_id === fileId) || null;
  }

  return request(`${config.teamC.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}`);
}

async function getFileVersions(fileId) {
  if (config.teamC.mode === "mock") {
    return fileVersions[fileId] || [];
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/files/${encodeURIComponent(
      fileId
    )}/versions`
  );
}

async function getBackups(userId, role) {
  if (config.teamC.mode === "mock") {
    if (role === "IT Admin" || role === "Auditor") {
      return backups;
    }
    return backups.filter((b) => b.user_id === userId);
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/backups?user_id=${encodeURIComponent(
      userId
    )}&role=${encodeURIComponent(role)}`
  );
}

async function getBackup(backupId) {
  if (config.teamC.mode === "mock") {
    return backups.find((b) => b.backup_id === backupId) || null;
  }

  return request(`${config.teamC.baseUrl}/api/v1/backups/${encodeURIComponent(backupId)}`);
}

async function createBackup({ file_id, file_name, user_id }) {
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
    body: JSON.stringify({
      file_id,
      file_name,
      user_id,
    }),
  });
}

async function getRestores(userId, role) {
  if (config.teamC.mode === "mock") {
    if (role === "IT Admin" || role === "Auditor") {
      return restores;
    }
    return restores.filter((r) => r.user_id === userId);
  }

  return request(
    `${config.teamC.baseUrl}/api/v1/restores?user_id=${encodeURIComponent(
      userId
    )}&role=${encodeURIComponent(role)}`
  );
}

async function getRestore(restoreId) {
  if (config.teamC.mode === "mock") {
    return restores.find((r) => r.restore_id === restoreId) || null;
  }

  return request(`${config.teamC.baseUrl}/api/v1/restores/${encodeURIComponent(restoreId)}`);
}

async function createRestore({ file_id, version_id, user_id }) {
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

  return request(`${config.teamC.baseUrl}/api/v1/restores`, {
    method: "POST",
    body: JSON.stringify({
      file_id,
      version_id,
      user_id,
    }),
  });
}

async function getStorageReport() {
  if (config.teamC.mode === "mock") {
    return storageReport;
  }

  return request(`${config.teamC.baseUrl}/api/v1/reports/storage`);
}

async function getAuditLog() {
  if (config.teamC.mode === "mock") {
    return auditLog;
  }

  return request(`${config.teamC.baseUrl}/api/v1/audit`);
}

// User Management methods
async function getUsers() {
  if (config.teamC.mode === "mock") {
    return usersMock.map(({ password, ...u }) => u);
  }

  return request(`${config.teamC.baseUrl}/api/v1/users`);
}

async function getUser(userId) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(`${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(userId)}`);
}

async function findUserByUsername(username) {
  if (config.teamC.mode === "mock") {
    return usersMock.find((u) => u.username === username) || null;
  }

  return request(`${config.teamC.baseUrl}/api/v1/users/by-username?username=${encodeURIComponent(username)}`);
}

async function createUser(userData) {
  if (config.teamC.mode === "mock") {
    const user_id = "u_" + Math.floor(100 + Math.random() * 900);
    const newUser = {
      user_id,
      name: userData.name,
      username: userData.username,
      password: userData.password,
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
    body: JSON.stringify(userData),
  });
}

async function updateUser(userId, updateData) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    if (updateData.name) user.name = updateData.name;
    if (updateData.role) user.role = updateData.role;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(`${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(updateData),
  });
}

async function updateUserStatus(userId, status) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    user.status = status;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(`${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

async function resetPassword(userId, newPassword) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return null;
    user.password = newPassword;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  return request(`${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password: newPassword }),
  });
}

async function changePassword(userId, currentPassword, newPassword) {
  if (config.teamC.mode === "mock") {
    const user = usersMock.find((u) => u.user_id === userId);
    if (!user) return { success: false, reason: "USER_NOT_FOUND" };
    if (user.password !== currentPassword) {
      return { success: false, reason: "INVALID_CURRENT_PASSWORD" };
    }
    user.password = newPassword;
    return { success: true };
  }

  return request(`${config.teamC.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/change-password`, {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

async function registerFile(fileData) {
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
      file_id: file_id || ("f_" + crypto.randomBytes(3).toString("hex")),
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
    body: JSON.stringify(fileData),
  });
}

module.exports = {
  getFiles,
  getFile,
  getFileVersions,
  registerFile,
  getBackups,
  getBackup,
  createBackup,
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