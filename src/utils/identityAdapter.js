// src/utils/identityAdapter.js
// Identity Adapter to map Team D authenticated accounts (e.g., u_101)
// to verified Team C numeric user_ids (e.g., 1).

const config = require("../config/env");

/**
 * Parses configured identity map from environment or config object.
 * Returns a Map of Team D user_id -> Team C numeric user_id (as Number).
 */
function parseIdentityMap() {
  const map = new Map();

  const rawMap = config.teamC?.identityMap || process.env.TEAM_C_IDENTITY_MAP;

  if (rawMap) {
    if (typeof rawMap === "object" && !Array.isArray(rawMap)) {
      for (const [dId, cId] of Object.entries(rawMap)) {
        const num = Number(cId);
        if (Number.isInteger(num) && num > 0) {
          map.set(String(dId), num);
        }
      }
    } else if (typeof rawMap === "string") {
      const trimmed = rawMap.trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          for (const [dId, cId] of Object.entries(parsed)) {
            const num = Number(cId);
            if (Number.isInteger(num) && num > 0) {
              map.set(String(dId), num);
            }
          }
        } catch (e) {
          console.error("Failed to parse TEAM_C_IDENTITY_MAP JSON:", e.message);
        }
      } else {
        // Format: "u_101:1,u_102:2,u_103:3" or "u_101=1,u_102=2"
        const pairs = trimmed.split(",");
        for (const pair of pairs) {
          const [dId, cId] = pair.split(/[:=]/).map((s) => s.trim());
          if (dId && cId) {
            const num = Number(cId);
            if (Number.isInteger(num) && num > 0) {
              map.set(dId, num);
            }
          }
        }
      }
    }
  }

  return map;
}

/**
 * Returns the verified numeric Team C user_id for an authenticated Team D user.
 * In live mode, throws an explicit IDENTITY_MAPPING_ERROR if the mapping is missing or invalid.
 */
function getRequiredTeamCUserId(user) {
  if (!user || !user.user_id) {
    const err = new Error("Authenticated user identity is missing.");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }

  const map = parseIdentityMap();
  const teamCUserId = map.get(String(user.user_id));

  if (teamCUserId !== undefined && teamCUserId !== null && Number.isInteger(teamCUserId) && teamCUserId > 0) {
    return teamCUserId;
  }

  // In mock mode, allow fallback to user.user_id for local mock demonstrations & dynamic users
  if (config.teamC.mode === "mock") {
    const num = Number(user.user_id);
    if (Number.isInteger(num) && num > 0) return num;
    return user.user_id;
  }

  // In live mode, fail closed with explicit IDENTITY_MAPPING_ERROR
  const err = new Error(`No verified Team C numeric user_id mapping configured for Team D user '${user.user_id}'.`);
  err.status = 400;
  err.code = "IDENTITY_MAPPING_ERROR";
  err.details = [
    `Team D user_id '${user.user_id}' has no matching positive integer Team C user_id in the identity map configuration.`,
  ];
  throw err;
}

/**
 * Helper to check if a Team D account or Team C user_id matches ownership.
 */
function matchesUser(fileOrRecordUserId, authenticatedUser) {
  if (fileOrRecordUserId === undefined || fileOrRecordUserId === null) return false;
  if (!authenticatedUser) return false;

  const targetStr = String(fileOrRecordUserId);
  const authUserStr = String(authenticatedUser.user_id);

  if (targetStr === authUserStr) return true;

  try {
    const mappedCId = String(getRequiredTeamCUserId(authenticatedUser));
    if (targetStr === mappedCId) return true;
  } catch (e) {
    // Identity mapping missing in live mode
  }

  return false;
}

module.exports = {
  parseIdentityMap,
  getRequiredTeamCUserId,
  matchesUser,
};
