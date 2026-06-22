// =============================================================================
//  routes/devices.js — Salud de dispositivos (patrón del Proyecto 1).
//    POST /device/heartbeat  { device_id, ... }   ← ESP32-CAM (y collar opc.)
//    GET  /device/status                           ← panel/diagnóstico
// =============================================================================
const express = require("express");
const config = require("../config");

module.exports = function devicesRouter(store) {
  const router = express.Router();

  router.post("/device/heartbeat", async (req, res, next) => {
    try {
      const { device_id, ...info } = req.body || {};
      if (!device_id) return res.status(400).json({ error: "missing_device_id" });
      await store.heartbeat(device_id, info);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.get("/device/status", async (req, res, next) => {
    try {
      const devices = await store.devices();
      const now = Date.now();
      const out = {};
      for (const [id, info] of Object.entries(devices)) {
        const last = info.last_seen ? Date.parse(info.last_seen) : 0;
        out[id] = {
          ...info,
          online: last > 0 && (now - last) / 1000 <= config.DEVICE_OFFLINE_AFTER_S,
        };
      }
      res.json({ devices: out });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
