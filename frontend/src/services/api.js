// frontend/src/services/api.js
// Centralized API communication service for Team D BFF

const API_BASE = "/api/v1/ui";

function generateCorrelationId() {
  return "corr_fe_" + Math.random().toString(36).substring(2, 10);
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("td_token");
  
  const headers = {
    "Content-Type": "application/json",
    "X-Correlation-ID": generateCorrelationId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const contentType = response.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorObj = new Error(
        data?.error?.message || `API request failed with status ${response.status}`
      );
      errorObj.status = response.status;
      errorObj.code = data?.error?.code || "API_ERROR";
      errorObj.details = data?.error?.details || [];
      throw errorObj;
    }

    return data?.data !== undefined ? data.data : data;
  } catch (err) {
    if (!err.status) {
      err.status = 500;
      err.code = "NETWORK_ERROR";
      err.message = err.message || "Failed to connect to server.";
    }
    throw err;
  }
}

export const api = {
  // Auth
  login: (username, password) =>
    request("/session", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request("/session", {
      method: "DELETE",
    }),

  getMe: () => request("/me"),

  changePassword: (current_password, new_password) =>
    request("/session/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),

  // Dashboard
  getDashboard: () => request("/dashboard"),

  // Files
  getFiles: () => request("/files"),
  getFile: (fileId) => request(`/files/${encodeURIComponent(fileId)}`),
  getFileVersions: (fileId) => request(`/files/${encodeURIComponent(fileId)}/versions`),
  getDownloadUrl: (fileId) => request(`/files/${encodeURIComponent(fileId)}/download-url`),
  uploadFile: (file, idempotencyKey) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("td_token");

    const headers = {
      "X-Correlation-ID": generateCorrelationId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    };

    return fetch(`${API_BASE}/files/upload`, {
      method: "POST",
      headers,
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data?.error?.message || "File upload failed.");
        err.status = res.status;
        err.code = data?.error?.code;
        err.details = data?.error?.details || [];
        throw err;
      }
      return data?.data !== undefined ? data.data : data;
    });
  },

  // Backups
  getBackups: () => request("/backups"),
  getBackup: (backupId) => request(`/backups/${encodeURIComponent(backupId)}`),
  createBackup: (file_id, file_name, idempotencyKey) =>
    request("/backups", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ file_id, file_name }),
    }),

  // Restores
  getRestores: () => request("/restores"),
  getRestore: (restoreId) => request(`/restores/${encodeURIComponent(restoreId)}`),
  createRestore: (fileId, versionId) =>
    request(`/files/${encodeURIComponent(fileId)}/versions/${encodeURIComponent(versionId)}/restore`, {
      method: "POST",
    }),

  // Reports
  getStorageReport: () => request("/reports/storage"),
  getBackupReport: () => request("/reports/backups"),
  getIntegrityReport: () => request("/reports/integrity"),

  // Audit
  getAudit: () => request("/audit"),

  // Notifications
  getNotifications: () => request("/notifications"),
  markNotificationsRead: () => request("/notifications/read", { method: "POST" }),

  // Search
  globalSearch: (query) => request(`/search?q=${encodeURIComponent(query)}`),

  // User Management (IT Admin)
  getUsers: () => request("/users"),
  getUser: (userId) => request(`/users/${encodeURIComponent(userId)}`),
  createUser: (name, username, role, password) =>
    request("/users", {
      method: "POST",
      body: JSON.stringify({ name, username, role, password }),
    }),
  updateUser: (userId, updateData) =>
    request(`/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    }),
  updateUserStatus: (userId, status) =>
    request(`/users/${encodeURIComponent(userId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  resetPassword: (userId, password) =>
    request(`/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  retryRestore: (restoreId) =>
    request(`/restores/${encodeURIComponent(restoreId)}/retry`, {
      method: "POST",
    }),
};
