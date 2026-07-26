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
  let db = { detections: [], reports: [], devices: {}, users: {} };
  try {
    db = JSON.parse(fs.readFileSync(config.DB_FILE, "utf-8"));
  } catch {
    /* archivo ausente o corrupto → estado vacío */
  }
  db.detections = db.detections || [];
  db.reports = db.reports || [];
  db.devices = db.devices || {};
  db.users = db.users || {};
  db.device_commands = db.device_commands || {};
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
    async getDetection(id) {
      return db.detections.find((d) => d.id === id) || null;
    },
    async deleteDetectionsBefore(cutoff, limit = 500) {
      const expired = db.detections
        .filter((d) => d.ts && Date.parse(d.ts) <= Date.parse(cutoff))
        .slice(0, limit);
      if (!expired.length) return [];
      const ids = new Set(expired.map((d) => d.id));
      db.detections = db.detections.filter((d) => !ids.has(d.id));
      persist();
      return expired;
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
      db.devices[deviceId] = { ...(db.devices[deviceId] || {}), device_id: deviceId,
        ...info, last_seen: new Date().toISOString() };
      persist();
    },
    async devices() {
      return db.devices;
    },
    async registerDevice(deviceId, data) {
      const old = db.devices[deviceId];
      if (old && old.type && old.type !== data.type) return null;
      db.devices[deviceId] = { ...(old || {}), device_id: deviceId, ...data };
      persist();
      return db.devices[deviceId];
    },
    async getDevice(deviceId) {
      return db.devices[deviceId] || null;
    },
    async deleteDevice(deviceId) {
      const device = db.devices[deviceId];
      if (!device) return null;
      let unlinkedCollars = 0;
      if (device.type === "main") {
        for (const collar of Object.values(db.devices)) {
          if (collar.main_device_id === deviceId) {
            collar.main_device_id = null;
            collar.owner_username = null;
            collar.residence = null;
            unlinkedCollars += 1;
          }
        }
      }
      delete db.devices[deviceId];
      delete db.device_commands[deviceId];
      persist();
      return { device, unlinked_collars: unlinkedCollars };
    },
    async assignCollar(collarId, mainDeviceId, data) {
      const collar = db.devices[collarId];
      if (!collar || collar.type !== "collar") return { error: "collar_not_found" };
      if (collar.main_device_id && collar.main_device_id !== mainDeviceId) {
        return { error: "collar_already_assigned", main_device_id: collar.main_device_id };
      }
      db.devices[collarId] = { ...collar, ...data, main_device_id: mainDeviceId };
      persist();
      return { device: db.devices[collarId] };
    },
    async enqueueCommand(deviceId, command) {
      const rec = { id: crypto.randomUUID(), status: "pending", created_at: new Date().toISOString(), ...command };
      db.device_commands[deviceId] = db.device_commands[deviceId] || [];
      db.device_commands[deviceId].push(rec);
      persist();
      return rec;
    },
    async pendingCommands(deviceId) {
      return (db.device_commands[deviceId] || []).filter((c) => c.status === "pending");
    },
    async ackCommand(deviceId, commandId, status, detail) {
      const command = (db.device_commands[deviceId] || []).find((c) => c.id === commandId);
      if (!command) return null;
      Object.assign(command, { status, detail: detail || null, completed_at: new Date().toISOString() });
      persist();
      return command;
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
    async createUser(username, data) {
      if (db.users[username]) return null;
      db.users[username] = { username, ...data };
      persist();
      return db.users[username];
    },
    async getUser(username) {
      return db.users[username] || null;
    },
    async listUsers() {
      return Object.values(db.users);
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
    async getDetection(id) {
      const snap = await fdb.collection("detections").doc(id).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    },
    async deleteDetectionsBefore(cutoff, limit = 500) {
      const snap = await fdb.collection("detections")
        .where("ts", "<=", cutoff)
        .limit(limit)
        .get();
      if (snap.empty) return [];
      const expired = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const batch = fdb.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return expired;
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
      snap.forEach((d) => (out[d.id] = { device_id: d.id, ...d.data() }));
      return out;
    },
    async registerDevice(deviceId, data) {
      const ref = fdb.collection("devices").doc(deviceId);
      return fdb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const old = snap.exists ? snap.data() : {};
        if (old.type && old.type !== data.type) return null;
        const rec = { ...old, device_id: deviceId, ...data };
        tx.set(ref, rec, { merge: true });
        return rec;
      });
    },
    async getDevice(deviceId) {
      const snap = await fdb.collection("devices").doc(deviceId).get();
      return snap.exists ? { device_id: snap.id, ...snap.data() } : null;
    },
    async deleteDevice(deviceId) {
      const ref = fdb.collection("devices").doc(deviceId);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const device = { device_id: snap.id, ...snap.data() };
      const batch = fdb.batch();
      batch.delete(ref);
      let unlinkedCollars = 0;
      if (device.type === "main") {
        const collars = await fdb.collection("devices").where("main_device_id", "==", deviceId).get();
        collars.docs.forEach((d) => {
          batch.update(d.ref, { main_device_id: null, owner_username: null, residence: null });
          unlinkedCollars += 1;
        });
      }
      const commands = await fdb.collection("device_commands").where("device_id", "==", deviceId).get();
      commands.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return { device, unlinked_collars: unlinkedCollars };
    },
    async assignCollar(collarId, mainDeviceId, data) {
      const ref = fdb.collection("devices").doc(collarId);
      return fdb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data().type !== "collar") return { error: "collar_not_found" };
        const old = snap.data();
        if (old.main_device_id && old.main_device_id !== mainDeviceId) {
          return { error: "collar_already_assigned", main_device_id: old.main_device_id };
        }
        const device = { ...old, ...data, main_device_id: mainDeviceId };
        tx.set(ref, device, { merge: true });
        return { device };
      });
    },
    async enqueueCommand(deviceId, command) {
      const ref = fdb.collection("device_commands").doc();
      const rec = { id: ref.id, device_id: deviceId, status: "pending", created_at: new Date().toISOString(), ...command };
      await ref.set(rec);
      return rec;
    },
    async pendingCommands(deviceId) {
      const snap = await fdb.collection("device_commands")
        .where("device_id", "==", deviceId).limit(50).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.status === "pending").slice(0, 10);
    },
    async ackCommand(deviceId, commandId, status, detail) {
      const ref = fdb.collection("device_commands").doc(commandId);
      const snap = await ref.get();
      if (!snap.exists || snap.data().device_id !== deviceId) return null;
      const updates = { status, detail: detail || null, completed_at: new Date().toISOString() };
      await ref.update(updates);
      return { id: commandId, ...snap.data(), ...updates };
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
    async createUser(username, data) {
      const ref = fdb.collection("users").doc(username);
      return fdb.runTransaction(async (tx) => {
        const old = await tx.get(ref);
        if (old.exists) return null;
        const rec = { username, ...data };
        tx.set(ref, rec);
        return rec;
      });
    },
    async getUser(username) {
      const doc = await fdb.collection("users").doc(username).get();
      return doc.exists ? doc.data() : null;
    },
    async listUsers() {
      const snap = await fdb.collection("users").get();
      return snap.docs.map((d) => d.data());
    },
  };
}

function createStore() {
  if (config.STORE_MODE === "json") {
    console.log("[store] STORE_MODE=json → JSON store (modo dev forzado)");
    return createJsonStore();
  }
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
