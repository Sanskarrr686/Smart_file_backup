const dotenv = require("dotenv");

dotenv.config();

const config = {
  port: Number(process.env.PORT) || 4000,

  apiVersion: process.env.API_VERSION || "v1",

  teamA: {
    mode: process.env.TEAM_A_MODE || "mock",
    baseUrl: process.env.TEAM_A_BASE_URL || "",
  },

  teamB: {
    mode: process.env.TEAM_B_MODE || "mock",
    baseUrl: process.env.TEAM_B_BASE_URL || "",
  },

  teamC: {
    mode: process.env.TEAM_C_MODE || "mock",
    baseUrl: process.env.TEAM_C_BASE_URL || "",
  },

  jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-key-change-in-production-123456",
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || "http://localhost:4000,http://localhost:3000",

  storage: {
    mode: process.env.STORAGE_MODE || "mock",
    endpoint: process.env.STORAGE_ENDPOINT || "http://localhost:9000",
    region: process.env.STORAGE_REGION || "us-east-1",
    accessKey: process.env.STORAGE_ACCESS_KEY || "minioadmin",
    secretKey: process.env.STORAGE_SECRET_KEY || "minioadmin",
    bucket: process.env.STORAGE_BUCKET || "backup-files",
    useSSL: process.env.STORAGE_USE_SSL === "true",
    maxSizeBytes: Number(process.env.STORAGE_MAX_SIZE_BYTES) || 100 * 1024 * 1024,
  },
};

module.exports = config;