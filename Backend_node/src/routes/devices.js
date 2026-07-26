// =============================================================================
//  routes/devices.js — Salud de dispositivos (patrón del Proyecto 1).
//    POST /device/heartbeat  { device_id, ... }   ← ESP32-CAM (y collar opc.)
//    GET  /device/status                           ← panel/diagnóstico
// =============================================================================
const express = require("express");
const config = require("../config");
const { authenticate, allow, publicUser } = require("../auth");
const admin = require("../device_admin");

module.exports = function devicesRouter(store) {
  const router = express.Router();

  router.post("/device/heartbeat", async (req, res, next) => {
    try {
      const { device_id, ...info } = req.body || {};
      if (!device_id) return res.status(400).json({ error: "missing_device_id" });
      const existing = await store.getDevice(device_id);
      // El dispositivo solo puede actualizar telemetría. Identidad, propietario y
      // residencia son datos administrativos y nunca se confían al firmware.
      const telemetry = {
        fw: info.fw || existing?.fw || null,
        firmware_version: info.firmware_version || existing?.firmware_version || null,
        wifi_rssi: Number.isFinite(Number(info.wifi_rssi)) ? Number(info.wifi_rssi) : null,
      };
      if (existing?.type) telemetry.type = existing.type;
      if (existing?.owner_username) {
        const owner = await store.getUser(existing.owner_username);
        telemetry.owner_username = existing.owner_username;
        telemetry.residence = owner?.residence || existing.residence || null;
      }
      await store.heartbeat(device_id, telemetry);
      const commands = await store.pendingCommands(device_id);
      res.json({ ok: true, commands });
    } catch (e) {
      next(e);
    }
  });

  router.post("/device/collar-heartbeat", async (req, res, next) => {
    try {
      const collarId = String(req.body?.collar_id || "").trim();
      const sourceMainId = String(req.body?.source_main_id || "").trim();
      const [collar, sourceMain] = await Promise.all([
        store.getDevice(collarId), store.getDevice(sourceMainId),
      ]);
      if (!collar || collar.type !== "collar") return res.status(404).json({ error: "collar_not_registered" });
      if (!sourceMain || sourceMain.type !== "main") return res.status(403).json({ error: "source_main_not_registered" });
      const lastSeen = collar.last_seen ? Date.parse(collar.last_seen) : 0;
      if (lastSeen > 0 && Date.now() - lastSeen < 30 * 1000) {
        return res.json({ ok: true, accepted: false, reason: "heartbeat_window_active" });
      }
      await store.heartbeat(collarId, {
        detected_by_main_id: sourceMainId,
        detected_rssi: Number.isFinite(Number(req.body?.rssi)) ? Number(req.body.rssi) : null,
        heartbeat_source: "ble_proxy",
      });
      res.json({ ok: true, accepted: true });
    } catch (e) { next(e); }
  });

  router.get("/device/status", async (req, res, next) => {
    try {
      const devices = await store.devices();
      const now = Date.now();
      const out = {};
      for (const [id, info] of Object.entries(devices)) {
        const last = info.last_seen ? Date.parse(info.last_seen) : 0;
        const threshold = info.type === "collar" ? config.COLLAR_OFFLINE_AFTER_S : config.DEVICE_OFFLINE_AFTER_S;
        out[id] = {
          ...info,
          online: last > 0 && (now - last) / 1000 <= threshold,
        };
      }
      res.json({ devices: out });
    } catch (e) {
      next(e);
    }
  });

  router.get("/devices/mine", authenticate, allow("resident"), async (req, res, next) => {
    try {
      const username = req.user.username || req.user.sub;
      const devices = await store.devices();
      const now = Date.now();
      const mains = Object.values(devices).filter((device) =>
        device.type === "main" && device.owner_username === username);
      const mainIds = new Set(mains.map((device) => device.device_id));
      const collars = Object.values(devices).filter((device) =>
        device.type === "collar" && mainIds.has(device.main_device_id));
      const withStatus = (device) => {
        const lastSeen = device.last_seen ? Date.parse(device.last_seen) : 0;
        const threshold = device.type === "collar" ? config.COLLAR_OFFLINE_AFTER_S : config.DEVICE_OFFLINE_AFTER_S;
        return { ...device, online: lastSeen > 0 && (now - lastSeen) / 1000 <= threshold };
      };
      res.json({
        mains: mains.map(withStatus),
        collars: collars.map(withStatus),
        count: mains.length + collars.length,
      });
    } catch (e) { next(e); }
  });

  router.post("/device/commands/:id/ack", async (req, res, next) => {
    try {
      const { device_id, status, detail } = req.body || {};
      if (!device_id || !["completed", "failed"].includes(status)) {
        return res.status(400).json({ error: "invalid_ack" });
      }
      const command = await store.ackCommand(device_id, req.params.id, status, detail);
      if (!command) return res.status(404).json({ error: "command_not_found" });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.get("/device/firmware/:token", (req, res) => {
    const firmware = admin.getOta(req.params.token, String(req.query.device_id || ""));
    if (!firmware) return res.status(404).json({ error: "firmware_not_found" });
    res.download(firmware, "petrack-main.bin");
  });

  router.get("/admin/residents", authenticate, allow("staff"), async (_req, res, next) => {
    try {
      const users = (await store.listUsers()).filter((u) => u.role === "resident").map(publicUser);
      res.json({ items: users });
    } catch (e) { next(e); }
  });

  router.get("/admin/devices", authenticate, allow("staff"), async (_req, res, next) => {
    try {
      const devices = await store.devices();
      const now = Date.now();
      for (const device of Object.values(devices)) {
        const lastSeen = device.last_seen ? Date.parse(device.last_seen) : 0;
        const threshold = device.type === "collar" ? config.COLLAR_OFFLINE_AFTER_S : config.DEVICE_OFFLINE_AFTER_S;
        device.online = lastSeen > 0 && (now - lastSeen) / 1000 <= threshold;
      }
      res.json({ devices });
    } catch (e) { next(e); }
  });

  router.post("/admin/devices", authenticate, allow("staff"), async (req, res, next) => {
    try {
      const deviceId = String(req.body?.device_id || "").trim();
      const type = req.body?.type;
      const owner = String(req.body?.owner_username || "").trim().toLowerCase();
      if (!/^(cam|col)-[A-Fa-f0-9]{12}$/.test(deviceId) || !["main", "collar"].includes(type)) {
        return res.status(400).json({ error: "invalid_device" });
      }
      let resident = null;
      if (owner) {
        resident = await store.getUser(owner);
        if (!resident || resident.role !== "resident") return res.status(400).json({ error: "resident_not_found" });
      }
      const rec = await store.registerDevice(deviceId, {
        type, owner_username: owner || null,
        residence: resident?.residence || null,
        pet_id: type === "collar" ? (req.body.pet_id || null) : null,
        registered_at: new Date().toISOString(),
      });
      if (!rec) return res.status(409).json({ error: "device_type_conflict" });
      res.status(201).json({ ok: true, device: rec });
    } catch (e) { next(e); }
  });

  router.delete("/admin/devices/:id", authenticate, allow("staff"), async (req, res, next) => {
    try {
      const result = await store.deleteDevice(req.params.id);
      if (!result) return res.status(404).json({ error: "device_not_found" });
      res.json({ ok: true, deleted_device_id: req.params.id,
        unlinked_collars: result.unlinked_collars });
    } catch (e) { next(e); }
  });

  router.post("/admin/devices/:mainId/pair-collar", authenticate, allow("staff"), async (req, res, next) => {
    try {
      const main = await store.getDevice(req.params.mainId);
      if (!main || main.type !== "main") return res.status(404).json({ error: "main_not_found" });
      const collarId = String(req.body?.collar_id || "").trim();
      const petId = String(req.body?.pet_id || "").trim();
      if (!/^col-[A-Fa-f0-9]{12}$/.test(collarId) || !petId) return res.status(400).json({ error: "invalid_collar" });
      const existing = await store.getDevice(collarId);
      if (existing?.main_device_id && existing.main_device_id !== main.device_id) {
        return res.status(409).json({ error: "collar_already_assigned", main_device_id: existing.main_device_id });
      }
      await store.registerDevice(collarId, { type: "collar", pet_id: petId,
        owner_username: main.owner_username || null, residence: main.residence || null,
        registered_at: new Date().toISOString() });
      const assigned = await store.assignCollar(collarId, main.device_id, { pet_id: petId,
        owner_username: main.owner_username || null, residence: main.residence || null });
      if (assigned.error) return res.status(409).json(assigned);
      const command = await store.enqueueCommand(main.device_id, { type: "pair_collar", collar_id: collarId, pet_id: petId });
      res.status(202).json({ ok: true, device: assigned.device, command });
    } catch (e) { next(e); }
  });

  router.get("/admin/com-ports", authenticate, allow("staff"), async (_req, res) => {
    res.json({ items: await admin.listComPorts() });
  });
  router.post("/admin/flash", authenticate, allow("staff"), (req, res) => {
    try {
      const job = admin.startJob({ target: req.body?.target, mode: req.body?.mode,
        port: req.body?.port, deviceId: req.body?.device_id,
        ownerUsername: req.body?.owner_username,
        mainDeviceId: req.body?.main_device_id, petId: req.body?.pet_id, store });
      res.status(202).json({ job });
    } catch (e) { res.status(e.message === "flash_busy" ? 409 : 400).json({ error: e.message }); }
  });
  router.get("/admin/flash/:id", authenticate, allow("staff"), (req, res) => {
    const job = admin.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "job_not_found" });
    res.json({ job });
  });

  return router;
};
