// =============================================================================
//  store.js — Abstracción de persistencia con DOS implementaciones:
//    - Firestore (firebase-admin) si hay service account.
//    - JSON local (modo dev) si NO hay credenciales → el sistema funciona y se
//      puede probar sin Firebase (base fuerte: nunca bloquea el desarrollo).
//  Interfaz común: addDetection, listDetections, addReport, listReports,
//                  heartbeat, devices.
// =============================================================================
const fs = require("fs");
const crypto = require("crypto");
const config = require("./config");

function ensureDirs() {
  fs.mkdirSync(config.PHOTOS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
//  JSON store (modo dev / fallback)
// ---------------------------------------------------------------------------
function createJsonStore() {
  ensureDirs();
  let db = { detections: [], reports: [], devices: {} };
  try {
    db = JSON.parse(fs.readFileSync(config.DB_FILE, "utf-8"));
  } catch {
    /* archivo ausente o corrupto → estado vacío */
  }
  db.detections = db.detections || [];
  db.reports = db.reports || [];
  db.devices = db.devices || {};
  db.pets = db.pets || {}; // registro pet_id → {pet, owner, residence}

  function persist() {
    const tmp = config.DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, config.DB_FILE); // escritura atómica
  }

  return {
    mode: "json",
    async addDetection(doc) {
      const rec = { id: crypto.randomUUID(), ...doc };
      db.detections.push(rec);
      persist();
      return rec;
    },
    async listDetections({ residence, limit }) {
      let arr = db.detections;
      if (residence) arr = arr.filter((d) => d.residence === residence);
      return arr.slice(-limit).reverse(); // más recientes primero
    },
    async addReport(doc) {
      const rec = { id: crypto.randomUUID(), ...doc };
      db.reports.push(rec);
      persist();
      return rec;
    },
    async listReports({ limit }) {
      return db.reports.slice(-limit).reverse();
    },
    async updateReport(id, updates) {
      const idx = db.reports.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      db.reports[idx] = { ...db.reports[idx], ...updates };
      persist();
      return db.reports[idx];
    },
    async heartbeat(deviceId, info) {
      db.devices[deviceId] = { ...info, last_seen: new Date().toISOString() };
      persist();
    },
    async devices() {
      return db.devices;
    },
    async setPet(petId, data) {
      db.pets[petId] = { pet_id: petId, ...data };
      persist();
      return db.pets[petId];
    },
    async getPet(petId) {
      return db.pets[petId] || null;
    },
    async listPets() {
      return Object.values(db.pets);
    },
  };
}

// ---------------------------------------------------------------------------
//  Firestore store (producción)
// ---------------------------------------------------------------------------
function createFirestoreStore() {
  const admin = require("firebase-admin");
  const cred = require(config.CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(cred),
    projectId: config.FIREBASE_PROJECT_ID || undefined,
  });
  const fdb = admin.firestore();
  ensureDirs(); // las fotos siguen en disco

  return {
    mode: "firestore",
    async addDetection(doc) {
      const ref = await fdb.collection("detections").add(doc);
      return { id: ref.id, ...doc };
    },
    async listDetections({ residence, limit }) {
      // orderBy ts desc + filtro de residencia en memoria → evita exigir índice
      // compuesto en Firestore (base fuerte: sin errores de índice en runtime).
      const cap = residence ? Math.min(limit * 5, 500) : limit;
      const snap = await fdb
        .collection("detections")
        .orderBy("ts", "desc")
        .limit(cap)
        .get();
      let arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (residence) arr = arr.filter((d) => d.residence === residence);
      return arr.slice(0, limit);
    },
    async addReport(doc) {
      const ref = await fdb.collection("reports").add(doc);
      return { id: ref.id, ...doc };
    },
    async listReports({ limit }) {
      const snap = await fdb
        .collection("reports")
        .orderBy("ts", "desc")
        .limit(limit)
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async updateReport(id, updates) {
      await fdb.collection("reports").doc(id).update(updates);
      const doc = await fdb.collection("reports").doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    async heartbeat(deviceId, info) {
      await fdb
        .collection("devices")
        .doc(deviceId)
        .set({ ...info, last_seen: new Date().toISOString() }, { merge: true });
    },
    async devices() {
      const snap = await fdb.collection("devices").get();
      const out = {};
      snap.forEach((d) => (out[d.id] = d.data()));
      return out;
    },
    async setPet(petId, data) {
      const rec = { pet_id: petId, ...data };
      await fdb.collection("pets").doc(petId).set(rec, { merge: true });
      return rec;
    },
    async getPet(petId) {
      const doc = await fdb.collection("pets").doc(petId).get();
      return doc.exists ? { pet_id: petId, ...doc.data() } : null;
    },
    async listPets() {
      const snap = await fdb.collection("pets").get();
      return snap.docs.map((d) => ({ pet_id: d.id, ...d.data() }));
    },
  };
}

function createStore() {
  if (fs.existsSync(config.CREDENTIALS)) {
    try {
      const s = createFirestoreStore();
      console.log("[store] Firestore ACTIVO");
      return s;
    } catch (e) {
      console.warn(`[store] Firestore falló (${e.message}); usando JSON store (dev)`);
    }
  } else {
    console.log("[store] sin credenciales Firebase → JSON store (modo dev)");
  }
  return createJsonStore();
}

module.exports = { createStore, ensureDirs };
