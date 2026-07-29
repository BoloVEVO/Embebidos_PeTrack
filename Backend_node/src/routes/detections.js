// =============================================================================
//  routes/detections.js — Detecciones de mascotas + fotos.
//    POST /detection   (multipart: meta JSON + photo JPEG)  ← ESP32-CAM
//    GET  /detections  (?residence=&limit=)                 ← web
//    GET  /photos/:id                                       ← web
// =============================================================================
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const config = require("../config");
const { authenticate, allow } = require("../auth");

module.exports = function detectionsRouter(store) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_PHOTO_BYTES },
  });

  router.post("/detection", upload.single("photo"), async (req, res, next) => {
    try {
      let meta;
      try {
        meta = JSON.parse(req.body.meta || "{}");
      } catch {
        return res.status(400).json({ error: "meta_invalid_json" });
      }
      // El dispositivo (ESP32-CAM) envía: pet_id (del collar), su PROPIA
      // residencia (dónde se detectó) y el RSSI. Los datos de la mascota/dueño
      // se RESUELVEN en el backend desde el registro `pets` (base fuerte: no
      // viajan por BLE).
      const { device_id, collar_id, pet_id, residence, rssi } = meta;
      const nearbyInput = Array.isArray(meta.nearby_collars) ? meta.nearby_collars : [];
      const nearby = nearbyInput
        .map((item) => ({ collar_id: String(item?.collar_id || ""), pet_id: String(item?.pet_id || ""), rssi: Number.isFinite(Number(item?.rssi)) ? Number(item.rssi) : null,
          inclination_angle: Number.isFinite(Number(item?.inclination_angle)) ? Math.max(0, Math.min(180, Number(item.inclination_angle))) : null }))
        .filter((item) => item.collar_id && item.pet_id);
      if (!nearby.length && pet_id) nearby.push({ collar_id: collar_id || null, pet_id: String(pet_id), rssi: rssi ?? null });
      if (!device_id || !nearby.length) {
        return res
          .status(400)
          .json({ error: "missing_fields", required: ["device_id", "nearby_collars"] });
      }
      if (!req.file) return res.status(400).json({ error: "photo_required" });

      const mainDevice = await store.getDevice(String(device_id));
      if (!mainDevice || mainDevice.type !== "main" || !mainDevice.owner_username) {
        return res.status(403).json({ error: "main_device_not_registered" });
      }

      const buf = req.file.buffer;
      // Validación de JPEG por magic bytes (FF D8 ... FF D9).
      if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) {
        return res.status(400).json({ error: "not_jpeg" });
      }

      // Enriquecimiento desde el registro de mascotas (tolerante a no-registrada).
      const petRecords = await Promise.all(nearby.map((item) => store.getPet(item.pet_id)));
      const detectedPets = nearby.map((item, index) => {
        const registeredPet = petRecords[index];
        return {
          ...item,
          pet: registeredPet?.pet || null,
          owner: registeredPet?.owner || null,
          pet_residence: registeredPet?.residence || null,
          registered: !!registeredPet,
        };
      });
      const primary = detectedPets[0];

      const ts = meta.ts || new Date().toISOString();
      const safePet = String(primary.pet_id).replace(/[^a-zA-Z0-9_-]/g, "") || "pet";
      const photo_id = `${Date.now()}_${safePet}_${crypto
        .randomBytes(3)
        .toString("hex")}.jpg`;
      fs.writeFileSync(path.join(config.PHOTOS_DIR, photo_id), buf);

      let rec;
      try {
        rec = await store.addDetection({
          device_id: device_id || null,
          collar_id: primary.collar_id,
          pet_id: primary.pet_id,
          pet: primary.pet,
          owner: primary.owner,
          pet_residence: primary.pet_residence,
          registered: primary.registered,
          collar_ids: detectedPets.map((item) => item.collar_id),
          pet_ids: detectedPets.map((item) => item.pet_id),
          pets: detectedPets,
          residence: mainDevice.residence, // fuente confiable: registro del dispositivo
          rssi: rssi ?? null,
          inclination_angle: primary.inclination_angle,
          ts,
          photo_id,
        });
      } catch (e) {
        // Si la BD falla, no dejes la foto huérfana.
        try {
          fs.unlinkSync(path.join(config.PHOTOS_DIR, photo_id));
        } catch {}
        throw e;
      }
      res.status(201).json({ ok: true, id: rec.id, photo_id });
    } catch (e) {
      next(e);
    }
  });

  router.get("/detections", authenticate, allow("resident"), async (req, res, next) => {
    try {
      let limit = parseInt(req.query.limit || "20", 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 20;
      limit = Math.min(limit, 200);
      const devices = await store.devices();
      const residentDeviceIds = new Set(Object.values(devices)
        .filter((device) => device.type === "main" && device.owner_username === (req.user.username || req.user.sub))
        .map((device) => device.device_id));
      // La pertenencia del main es la autorización fuerte. No filtramos primero
      // por residencia porque documentos históricos pueden contener una config
      // NVS antigua del dispositivo.
      const candidates = await store.listDetections({ limit: Math.min(limit * 5, 500) });
      const items = candidates.filter((item) => residentDeviceIds.has(item.device_id)).slice(0, limit);
      res.json({ items, count: items.length });
    } catch (e) {
      next(e);
    }
  });

  router.get("/photos/:id", authenticate, (req, res) => {
    const id = path.basename(req.params.id); // anti path-traversal
    const p = path.join(config.PHOTOS_DIR, id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "not_found" });
    res.type("image/jpeg");
    fs.createReadStream(p).pipe(res);
  });

  return router;
};
