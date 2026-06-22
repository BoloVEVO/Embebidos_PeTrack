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
  PORT: intEnv("PORT", 3000),
  STORAGE_DIR,
  PHOTOS_DIR: path.join(STORAGE_DIR, "photos"),
  DB_FILE: path.join(STORAGE_DIR, "db.json"),
  // Service account de Firebase; si el archivo no existe → modo dev (JSON store).
  CREDENTIALS:
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(ROOT, "secrets", "serviceAccountKey.json"),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  MAX_PHOTO_BYTES: intEnv("MAX_PHOTO_BYTES", 2 * 1024 * 1024), // 2 MB
  DEVICE_OFFLINE_AFTER_S: intEnv("DEVICE_OFFLINE_AFTER_S", 45),
};
