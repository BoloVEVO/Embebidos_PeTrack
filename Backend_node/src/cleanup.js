const fs = require("fs");
const path = require("path");
const config = require("./config");

async function cleanupExpiredDetections(store, onLog = console.log) {
  const retentionMs = config.DETECTION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - retentionMs).toISOString();
  let total = 0;

  while (true) {
    const expired = await store.deleteDetectionsBefore(cutoff, 500);
    for (const detection of expired) {
      if (!detection.photo_id) continue;
      const photoPath = path.join(config.PHOTOS_DIR, path.basename(detection.photo_id));
      try { fs.unlinkSync(photoPath); } catch (e) {
        if (e.code !== "ENOENT") onLog(`[cleanup] no se pudo borrar ${detection.photo_id}: ${e.message}`);
      }
    }
    total += expired.length;
    if (expired.length < 500) break;
  }

  if (total) onLog(`[cleanup] ${total} detección(es) con más de ${config.DETECTION_RETENTION_DAYS} días eliminadas`);
  return total;
}

function startCleanupScheduler(store, onLog = console.log) {
  const run = () => cleanupExpiredDetections(store, onLog)
    .catch((e) => onLog(`[cleanup] ERROR: ${e.message}`));
  setImmediate(run);
  const timer = setInterval(run, Math.max(config.CLEANUP_INTERVAL_S, 60) * 1000);
  timer.unref();
  return timer;
}

module.exports = { cleanupExpiredDetections, startCleanupScheduler };
