// =============================================================================
//  routes/pets.js — Registro de mascotas (pet_id → datos del dueño/residencia).
//  El collar solo emite un `pet_id` compacto por BLE; aquí viven el nombre de la
//  mascota, el dueño y su residencia de origen. Lo gestiona el Staff/ciudadela.
//    POST /pets        { pet_id, pet, owner, residence }
//    GET  /pets
//    GET  /pets/:id
// =============================================================================
const express = require("express");
const { authenticate, allow } = require("../auth");

module.exports = function petsRouter(store) {
  const router = express.Router();
  router.use(authenticate, allow("staff"));

  router.post("/pets", async (req, res, next) => {
    try {
      const { pet_id, pet, owner, residence } = req.body || {};
      if (!pet_id) return res.status(400).json({ error: "missing_pet_id" });
      const rec = await store.setPet(String(pet_id), {
        pet: pet || null,
        owner: owner || null,
        residence: residence || null,
      });
      res.status(201).json({ ok: true, pet: rec });
    } catch (e) {
      next(e);
    }
  });

  router.get("/pets", async (_req, res, next) => {
    try {
      const items = await store.listPets();
      res.json({ items, count: items.length });
    } catch (e) {
      next(e);
    }
  });

  router.get("/pets/:id", async (req, res, next) => {
    try {
      const pet = await store.getPet(req.params.id);
      if (!pet) return res.status(404).json({ error: "not_found" });
      res.json(pet);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
