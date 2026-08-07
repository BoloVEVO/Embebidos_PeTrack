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
process.env.GOOGLE_APPLICATION_CREDENTIALS = "__test_credentials_do_not_exist__.json";

const request = require("supertest");
const { createApp } = require("../src/app");
const { cleanupExpiredDetections } = require("../src/cleanup");
const { classifyChip, identityFromProbe, cString, backendHostForRequest } = require("../src/device_admin");

const app = createApp();
// JPEG mínimo válido (FF D8 ... FF D9).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
let staffCookie;
let residentCookie;

test("GET / health", async () => {
  const r = await request(app).get("/");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test("verificación acepta cualquier ESP32 para el collar", () => {
  assert.equal(classifyChip("Chip is ESP32-D0WD-V3 (revision v3.1)", "main").valid, true);
  assert.equal(classifyChip("Chip is ESP32-C3 (revision v0.4)", "collar").valid, true);
  assert.equal(classifyChip("Chip is ESP32-C3 (revision v0.4)", "main").valid, false);
  assert.equal(classifyChip("Chip is ESP32-D0WD-V3", "collar").valid, true);
  assert.equal(classifyChip("Chip is ESP32-S3", "collar").valid, true);
  assert.equal(identityFromProbe("MAC: cc:8d:a2:c2:b7:78", "main").deviceId,
    "cam-CC8DA2C2B778");
  assert.equal(identityFromProbe("MAC: 11:22:33:44:55:66", "collar").deviceId,
    "col-112233445566");
});

test("las credenciales WiFi se escapan como literales C", () => {
  assert.equal(cString('red"casa\\2'), 'red\\"casa\\\\2');
});

test("el flasheo usa la IPv4 LAN cruda del servidor", () => {
  assert.equal(backendHostForRequest({ socket: { localAddress: "::ffff:192.168.100.19" } }), "http://192.168.100.19:3000");
});

test("registro, sesión y roles", async () => {
  const staff = await request(app).post("/auth/register").send({
    username: "admin", password: "segura123", role: "staff",
  });
  assert.equal(staff.status, 201);
  staffCookie = staff.headers["set-cookie"][0].split(";")[0];

  const resident = await request(app).post("/auth/register").send({
    username: "vecino", password: "segura123", role: "resident", residence: "A-12",
  });
  assert.equal(resident.status, 201);
  residentCookie = resident.headers["set-cookie"][0].split(";")[0];

  const me = await request(app).get("/auth/me").set("Cookie", residentCookie);
  assert.equal(me.body.user.residence, "A-12");
  assert.equal((await request(app).get("/reports").set("Cookie", residentCookie)).status, 403);
  assert.equal((await request(app).get("/detections")).status, 401);
});

test("registro de mascota (pets)", async () => {
  const r = await request(app)
    .post("/pets")
    .set("Cookie", staffCookie)
    .send({ pet_id: "dog001", pet: "Firulais", owner: "Bolívar", residence: "B-07" });
  assert.equal(r.status, 201);
  assert.equal(r.body.pet.pet, "Firulais");
});

test("residente puede consultar sesiones de video sin ser bloqueado por pets", async () => {
  const response = await request(app).get("/video-sessions").set("Cookie", residentCookie);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.items));
});

test("flujo detección → enriquecida → listado → foto → reporte", async () => {
  await request(app).post("/admin/devices").set("Cookie", staffCookie)
    .send({ device_id: "cam-AABBCCDDEE01", type: "main", owner_username: "vecino" });
  // El dispositivo solo envía pet_id + su residencia (dónde detectó) + rssi.
  const meta = JSON.stringify({
    device_id: "cam-AABBCCDDEE01", pet_id: "dog001", residence: "A-12", rssi: -55,
    nearby_collars: [
      { collar_id: "col-112233445566", pet_id: "dog001", rssi: -55, inclination_angle: 42.75 },
      { collar_id: "col-665544332211", pet_id: "dog002", rssi: -64 },
    ],
  });
  const det = await request(app)
    .post("/detection")
    .field("meta", meta)
    .attach("photo", JPEG, "x.jpg");
  assert.equal(det.status, 201);
  assert.ok(det.body.photo_id);

  const list = await request(app).get("/detections?residence=OTRA&limit=5").set("Cookie", residentCookie);
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length >= 1);
  const d0 = list.body.items[0];
  assert.equal(d0.pet_id, "dog001");
  assert.equal(d0.device_id, "cam-AABBCCDDEE01");
  assert.equal(d0.pet, "Firulais"); // enriquecido desde el registro
  assert.equal(d0.owner, "Bolívar");
  assert.equal(d0.pet_residence, "B-07"); // hogar de la mascota
  assert.equal(d0.residence, "A-12"); // dónde se detectó
  assert.equal(d0.registered, true);
  assert.equal(d0.inclination_angle, 42.75);
  assert.equal(d0.pets[0].inclination_angle, 42.75);
  assert.equal(d0.pets.length, 2);
  assert.deepEqual(d0.pet_ids, ["dog001", "dog002"]);

  const photo = await request(app).get("/photos/" + det.body.photo_id).set("Cookie", residentCookie);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers["content-type"], "image/jpeg");

  const rep = await request(app)
    .post("/report")
    .set("Cookie", residentCookie)
    .send({
      residence: "OTRA",
      detection_ids: [list.body.items[0].id],
      message: "Desecho en el jardín",
    });
  assert.equal(rep.status, 201);
  assert.ok(rep.body.id);
  const reports = await request(app).get("/reports").set("Cookie", staffCookie);
  assert.equal(reports.body.items[0].residence, "A-12");
  assert.deepEqual(reports.body.items[0].device_ids, ["cam-AABBCCDDEE01"]);
});

test("validación: meta incompleta → 400", async () => {
  const r = await request(app).post("/detection").field("meta", "{}");
  assert.equal(r.status, 400);
});

test("validación: no-JPEG → 400", async () => {
  const r = await request(app)
    .post("/detection")
    .field("meta", JSON.stringify({ device_id: "cam-AABBCCDDEE01", pet_id: "x", residence: "A-12" }))
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

test("heartbeat no puede sobrescribir residencia ni propietario del main", async () => {
  await request(app).post("/admin/devices").set("Cookie", staffCookie).send({
    device_id: "cam-AABBCCDDEE01", type: "main", owner_username: "vecino",
  });
  await request(app).post("/device/heartbeat").send({
    device_id: "cam-AABBCCDDEE01", type: "collar", residence: "FALSA", owner_username: "otro",
    fw: "test", wifi_rssi: -60,
  });
  const inventory = await request(app).get("/admin/devices").set("Cookie", staffCookie);
  const main = inventory.body.devices["cam-AABBCCDDEE01"];
  assert.equal(main.type, "main");
  assert.equal(main.owner_username, "vecino");
  assert.equal(main.residence, "A-12");
});

test("Staff registra mains y un collar no puede pertenecer a dos mains", async () => {
  for (const id of ["cam-AABBCCDDEE01", "cam-AABBCCDDEE02"]) {
    const r = await request(app).post("/admin/devices").set("Cookie", staffCookie)
      .send({ device_id: id, type: "main", owner_username: "vecino" });
    assert.equal(r.status, 201);
  }
  const first = await request(app).post("/admin/devices/cam-AABBCCDDEE01/pair-collar")
    .set("Cookie", staffCookie).send({ collar_id: "col-112233445566", pet_id: "dog001" });
  assert.equal(first.status, 202);
  const duplicate = await request(app).post("/admin/devices/cam-AABBCCDDEE02/pair-collar")
    .set("Cookie", staffCookie).send({ collar_id: "col-112233445566", pet_id: "dog001" });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, "collar_already_assigned");

  // Otro main, incluso del mismo u otro residente, puede informar la presencia BLE.
  const collarHeartbeat = await request(app).post("/device/collar-heartbeat").send({
    source_main_id: "cam-AABBCCDDEE02", collar_id: "col-112233445566", rssi: -61,
    inclination_angle: 37.45,
  });
  assert.equal(collarHeartbeat.status, 200);
  assert.equal(collarHeartbeat.body.accepted, true);
  const throttledHeartbeat = await request(app).post("/device/collar-heartbeat").send({
    source_main_id: "cam-AABBCCDDEE01", collar_id: "col-112233445566", rssi: -58,
  });
  assert.equal(throttledHeartbeat.body.accepted, false);

  const mine = await request(app).get("/devices/mine").set("Cookie", residentCookie);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.mains.length, 2);
  assert.equal(mine.body.collars.length, 1);
  assert.equal(mine.body.collars[0].main_device_id, "cam-AABBCCDDEE01");
  assert.equal(mine.body.collars[0].detected_by_main_id, "cam-AABBCCDDEE02");
  assert.equal(mine.body.collars[0].inclination_angle, 37.45);
  assert.equal(mine.body.collars[0].online, true);
  assert.equal((await request(app).get("/devices/mine").set("Cookie", staffCookie)).status, 403);

  const removed = await request(app).delete("/admin/devices/cam-AABBCCDDEE01")
    .set("Cookie", staffCookie);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.unlinked_collars, 1);
  const inventory = await request(app).get("/admin/devices").set("Cookie", staffCookie);
  assert.equal(inventory.body.devices["cam-AABBCCDDEE01"], undefined);
  assert.equal(inventory.body.devices["col-112233445566"].main_device_id, null);
  assert.equal(inventory.body.devices["col-112233445566"].owner_username, null);
});

test("retención elimina detecciones antiguas, fotos y conserva reportes", async () => {
  const oldTs = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
  const det = await request(app)
    .post("/detection")
    .field("meta", JSON.stringify({ device_id: "cam-AABBCCDDEE02", pet_id: "old", residence: "A-12", ts: oldTs }))
    .attach("photo", JPEG, "old.jpg");
  assert.equal(det.status, 201);

  const report = await request(app).post("/report").set("Cookie", residentCookie).send({
    detection_ids: [det.body.id], message: "Reporte histórico",
  });
  assert.equal(report.status, 201);

  const removed = await cleanupExpiredDetections(app.locals.store, () => {});
  assert.equal(removed, 1);
  const photoPath = path.join(process.env.STORAGE_DIR, "photos", det.body.photo_id);
  assert.equal(fs.existsSync(photoPath), false);

  const detections = await request(app).get("/detections").set("Cookie", residentCookie);
  assert.equal(detections.body.items.some((d) => d.id === det.body.id), false);
  const reports = await request(app).get("/reports").set("Cookie", staffCookie);
  assert.equal(reports.body.items.some((r) => r.id === report.body.id), true);
});
