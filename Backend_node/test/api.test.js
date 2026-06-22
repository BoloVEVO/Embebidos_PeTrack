// =============================================================================
//  api.test.js — Pruebas E2E del backend (node:test + supertest).
//  Usa un STORAGE_DIR temporal para no ensuciar el real.
//  Ejecutar:  npm test
// =============================================================================
const os = require("os");
const path = require("path");
const fs = require("fs");
const test = require("node:test");
const assert = require("node:assert");

// Aislar el almacenamiento ANTES de cargar config/app.
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "petprox-test-"));

const request = require("supertest");
const { createApp } = require("../src/app");

const app = createApp();
// JPEG mínimo válido (FF D8 ... FF D9).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

test("GET / health", async () => {
  const r = await request(app).get("/");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test("registro de mascota (pets)", async () => {
  const r = await request(app)
    .post("/pets")
    .send({ pet_id: "dog001", pet: "Firulais", owner: "Bolívar", residence: "B-07" });
  assert.equal(r.status, 201);
  assert.equal(r.body.pet.pet, "Firulais");
});

test("flujo detección → enriquecida → listado → foto → reporte", async () => {
  // El dispositivo solo envía pet_id + su residencia (dónde detectó) + rssi.
  const meta = JSON.stringify({ pet_id: "dog001", residence: "A-12", rssi: -55 });
  const det = await request(app)
    .post("/detection")
    .field("meta", meta)
    .attach("photo", JPEG, "x.jpg");
  assert.equal(det.status, 201);
  assert.ok(det.body.photo_id);

  const list = await request(app).get("/detections?residence=A-12&limit=5");
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length >= 1);
  const d0 = list.body.items[0];
  assert.equal(d0.pet_id, "dog001");
  assert.equal(d0.pet, "Firulais"); // enriquecido desde el registro
  assert.equal(d0.owner, "Bolívar");
  assert.equal(d0.pet_residence, "B-07"); // hogar de la mascota
  assert.equal(d0.residence, "A-12"); // dónde se detectó
  assert.equal(d0.registered, true);

  const photo = await request(app).get("/photos/" + det.body.photo_id);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers["content-type"], "image/jpeg");

  const rep = await request(app)
    .post("/report")
    .send({
      residence: "A-12",
      detection_ids: [list.body.items[0].id],
      message: "Desecho en el jardín",
    });
  assert.equal(rep.status, 201);
  assert.ok(rep.body.id);
});

test("validación: meta incompleta → 400", async () => {
  const r = await request(app).post("/detection").field("meta", "{}");
  assert.equal(r.status, 400);
});

test("validación: no-JPEG → 400", async () => {
  const r = await request(app)
    .post("/detection")
    .field("meta", JSON.stringify({ pet_id: "x", residence: "A-1" }))
    .attach("photo", Buffer.from([0x00, 0x01, 0x02]), "x.jpg");
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "not_jpeg");
});

test("heartbeat → status online", async () => {
  await request(app)
    .post("/device/heartbeat")
    .send({ device_id: "esp32cam", fw: "0.2.0", wifi_rssi: -50 });
  const st = await request(app).get("/device/status");
  assert.equal(st.status, 200);
  assert.equal(st.body.devices.esp32cam.online, true);
});
