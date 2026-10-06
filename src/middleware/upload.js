// src/middleware/upload.js
// Multer memory storage middleware for file upload handling

const multer = require("multer");
const config = require("../config/env");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: config.storage.maxSizeBytes || 100 * 1024 * 1024, // 100MB default
  },
});

function handleUploadSingle(fieldName) {
  const single = upload.single(fieldName);
  return (req, res, next) => {
    single(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            const limitMb = Math.round((config.storage.maxSizeBytes || 100 * 1024 * 1024) / (1024 * 1024));
            const error = new Error(`File size exceeds maximum allowed limit of ${limitMb}MB.`);
            error.status = 400;
            error.code = "VALIDATION_ERROR";
            return next(error);
          }
          const error = new Error(`Upload error: ${err.message}`);
          error.status = 400;
          error.code = "VALIDATION_ERROR";
          return next(error);
        }
        return next(err);
      }
      next();
    });
  };
}

module.exports = {
  uploadSingle: handleUploadSingle,
};
