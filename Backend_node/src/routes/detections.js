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
      const { pet_id, residence, rssi } = meta;
      if (!pet_id || !residence) {
        return res
          .status(400)
          .json({ error: "missing_fields", required: ["pet_id", "residence"] });
      }
      if (!req.file) return res.status(400).json({ error: "photo_required" });

      const buf = req.file.buffer;
      // Validación de JPEG por magic bytes (FF D8 ... FF D9).
      if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) {
        return res.status(400).json({ error: "not_jpeg" });
      }

      // Enriquecimiento desde el registro de mascotas (tolerante a no-registrada).
      const pet = await store.getPet(String(pet_id));

      const ts = meta.ts || new Date().toISOString();
      const safePet = String(pet_id).replace(/[^a-zA-Z0-9_-]/g, "") || "pet";
      const photo_id = `${Date.now()}_${safePet}_${crypto
        .randomBytes(3)
        .toString("hex")}.jpg`;
      fs.writeFileSync(path.join(config.PHOTOS_DIR, photo_id), buf);

      let rec;
      try {
        rec = await store.addDetection({
          pet_id,
          pet: pet ? pet.pet : null,
          owner: pet ? pet.owner : null,
          pet_residence: pet ? pet.residence : null, // residencia/hogar de la mascota
          registered: !!pet,
          residence, // dónde se detectó (residencia del dispositivo/residente)
          rssi: rssi ?? null,
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

  router.get("/detections", async (req, res, next) => {
    try {
      const residence = req.query.residence || null;
      let limit = parseInt(req.query.limit || "20", 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 20;
      limit = Math.min(limit, 200);
      const items = await store.listDetections({ residence, limit });
      res.json({ items, count: items.length });
    } catch (e) {
      next(e);
    }
  });

  router.get("/photos/:id", (req, res) => {
    const id = path.basename(req.params.id); // anti path-traversal
    const p = path.join(config.PHOTOS_DIR, id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "not_found" });
    res.type("image/jpeg");
    fs.createReadStream(p).pipe(res);
  });

  return router;
};
