// =============================================================================
//  config.js — Configuración central del backend (desde .env, con defaults).
//  Prohibido hardcodear secretos/rutas fuera de aquí.
// =============================================================================
const path = require("path");
require("dotenv").config();

const ROOT = path.resolve(__dirname, "..");

function intEnv(key, def) {
  const v = parseInt(process.env[key] || "", 10);
  return Number.isFinite(v) ? v : def;
}

const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(ROOT, "storage");

module.exports = {
  STORE_MODE: String(process.env.STORE_MODE || "auto").trim().toLowerCase(),
  PORT: intEnv("PORT", 3000),
  STORAGE_DIR,
  PHOTOS_DIR: path.join(STORAGE_DIR, "photos"),
  DB_FILE: path.join(STORAGE_DIR, "db.json"),
  // Service account de Firebase; si el archivo no existe → modo dev (JSON store).
  CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(ROOT, process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(ROOT, "secrets", "serviceAccountKey.json"),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  AUTH_SECRET: process.env.AUTH_SECRET || "petrack-dev-change-this-secret",
  AUTH_COOKIE: process.env.AUTH_COOKIE || "petrack_session",
  AUTH_TTL_S: intEnv("AUTH_TTL_S", 8 * 60 * 60),
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  MAX_PHOTO_BYTES: intEnv("MAX_PHOTO_BYTES", 2 * 1024 * 1024), // 2 MB
  VIDEO_FPS: intEnv("VIDEO_FPS", 10),
  VIDEO_MAX_DURATION_MS: intEnv("VIDEO_MAX_DURATION_MS", 20 * 1000),
  VIDEO_FRAME_TIMEOUT_MS: intEnv("VIDEO_FRAME_TIMEOUT_MS", 10 * 1000),
  DEVICE_OFFLINE_AFTER_S: intEnv("DEVICE_OFFLINE_AFTER_S", 45),
  COLLAR_OFFLINE_AFTER_S: intEnv("COLLAR_OFFLINE_AFTER_S", 75),
  DETECTION_RETENTION_DAYS: intEnv("DETECTION_RETENTION_DAYS", 15),
  CLEANUP_INTERVAL_S: intEnv("CLEANUP_INTERVAL_S", 60 * 60),
};
