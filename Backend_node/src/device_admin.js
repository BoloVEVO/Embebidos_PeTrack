const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS = {
  main: path.join(ROOT, "Device_esp32cam"),
  collar: path.join(ROOT, "Collar_esp32c3"),
};
const jobs = new Map();
const otaFiles = new Map();

function pioExe() {
  return process.env.PIO_EXE || path.join(os.homedir(), ".platformio", "penv", "Scripts", "pio.exe");
}

function esptool() {
  return {
    python: path.join(os.homedir(), ".platformio", "penv", "Scripts", "python.exe"),
    script: path.join(os.homedir(), ".platformio", "packages", "tool-esptoolpy", "esptool.py"),
  };
}

function classifyChip(output, target) {
  const match = String(output).match(/chip is (ESP32[^\s(]*)/i);
  const chip = match ? match[1].toUpperCase() : "UNKNOWN";
  const isC3 = chip.startsWith("ESP32-C3");
  const isClassic = chip.startsWith("ESP32") && !/^ESP32-(C3|S2|S3|C2|C6|H2)/.test(chip);
  return { chip, valid: target === "collar" ? isC3 : target === "main" ? isClassic : false };
}

function identityFromProbe(output, target) {
  const match = String(output).match(/MAC:\s*([0-9a-f:]{17})/i);
  if (!match) return null;
  const hardwareUid = match[1].replace(/:/g, "").toUpperCase();
  return { hardwareUid, deviceId: `${target === "main" ? "cam" : "col"}-${hardwareUid}` };
}

function cString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function patchWifiConfig(ssid, password) {
  const configPath = path.join(PROJECTS.main, "src", "config.h");
  let source = fs.readFileSync(configPath, "utf8");
  for (const [name, value] of [["DEFAULT_WIFI_SSID", ssid], ["DEFAULT_WIFI_PASS", password]]) {
    const pattern = new RegExp(`(#define\\s+${name}\\s+)"(?:\\\\.|[^"\\\\])*"`);
    if (!pattern.test(source)) throw new Error(`wifi_config_define_not_found:${name}`);
    source = source.replace(pattern, (_match, prefix) => `${prefix}"${cString(value)}"`);
  }
  fs.writeFileSync(configPath, source, "utf8");
}

function listComPorts() {
  return new Promise((resolve) => {
    const script = "[System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object { [pscustomobject]@{DeviceID=$_;Name=$_;PNPDeviceID=''} } | ConvertTo-Json -Compress";
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out || "[]");
        resolve((Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({
          port: p.DeviceID, description: p.Name, hwid: p.PNPDeviceID,
        })).filter((p) => /^COM\d+$/i.test(p.port)));
      } catch { resolve([]); }
    });
    child.on("error", () => resolve([]));
  });
}

function startJob({ target, mode, port, deviceId, ownerUsername, mainDeviceId, petId,
  wifiSsid, wifiPassword, store }) {
  if (!PROJECTS[target]) throw new Error("invalid_target");
  if (mode === "com" && !/^COM\d+$/i.test(port || "")) throw new Error("invalid_port");
  if (mode === "ota" && (target !== "main" || !deviceId)) throw new Error("invalid_ota_target");
  if (target === "main") {
    if (!wifiSsid || Buffer.byteLength(wifiSsid, "utf8") > 32) throw new Error("invalid_wifi_ssid");
    const passwordBytes = Buffer.byteLength(wifiPassword || "", "utf8");
    if (passwordBytes > 63 || (passwordBytes > 0 && passwordBytes < 8)) throw new Error("invalid_wifi_password");
  }
  if ([...jobs.values()].some((j) => ["verifying", "running", "registering"].includes(j.status))) throw new Error("flash_busy");

  const id = crypto.randomUUID();
  const job = { id, target, mode, port: port || null, device_id: deviceId || null,
    status: mode === "com" ? "verifying" : "running", logs: [], created_at: new Date().toISOString() };
  jobs.set(id, job);
  const log = (d) => {
    job.logs.push(String(d).trimEnd());
    if (job.logs.length > 300) job.logs.splice(0, job.logs.length - 300);
  };
  const launchBuild = () => {
    job.status = "running";
    if (target === "main") {
      try {
        patchWifiConfig(wifiSsid, wifiPassword || "");
        log(`[config] WiFi configurado: ${wifiSsid}`);
      } catch (e) {
        job.status = "failed"; job.error = e.message;
        job.completed_at = new Date().toISOString(); return;
      }
    }
    const args = ["run", "-d", PROJECTS[target]];
    if (mode === "com") args.push("-t", "upload", "--upload-port", port);
    const child = spawn(pioExe(), args, { cwd: PROJECTS[target], windowsHide: true });
    child.stdout.on("data", log); child.stderr.on("data", log);
    child.on("error", (e) => { job.status = "failed"; job.error = e.message; });
    child.on("close", async (code) => {
    job.exit_code = code; job.completed_at = new Date().toISOString();
    job.status = code === 0 ? (mode === "com" ? "registering" : "completed") : "failed";
    if (code === 0 && mode === "com" && job.generated_device_id) {
      try {
        if (target === "main") {
          const resident = ownerUsername ? await store.getUser(String(ownerUsername).toLowerCase()) : null;
          const device = await store.registerDevice(job.generated_device_id, {
            type: "main", hardware_uid: job.hardware_uid,
            owner_username: resident?.role === "resident" ? resident.username : null,
            residence: resident?.role === "resident" ? resident.residence : null,
            registered_at: new Date().toISOString(),
          });
          if (!device) throw new Error("device_type_conflict");
          job.logs.push(`[registry] device_id=${job.generated_device_id} registrado`);
        } else {
          const main = mainDeviceId ? await store.getDevice(mainDeviceId) : null;
          if (!main || main.type !== "main") throw new Error("main_required_for_collar");
          await store.registerDevice(job.generated_device_id, {
            type: "collar", hardware_uid: job.hardware_uid, pet_id: petId || null,
            owner_username: main.owner_username || null, residence: main.residence || null,
            registered_at: new Date().toISOString(),
          });
          const assigned = await store.assignCollar(job.generated_device_id, main.device_id, {
            pet_id: petId || null, owner_username: main.owner_username || null,
            residence: main.residence || null,
          });
          if (assigned.error) throw new Error(assigned.error);
          await store.enqueueCommand(main.device_id, {
            type: "pair_collar", collar_id: job.generated_device_id, pet_id: petId || "pet",
          });
          job.logs.push(`[registry] collar_id=${job.generated_device_id} registrado en main=${main.device_id}`);
        }
        job.registered = true;
        job.status = "completed";
      } catch (e) {
        job.status = "failed"; job.error = `registry_failed: ${e.message}`;
        job.logs.push(`[registry] ERROR ${e.message}`);
      }
    }
    if (code === 0 && mode === "ota") {
      const firmware = path.join(PROJECTS.main, ".pio", "build", "esp32cam", "firmware.bin");
      if (!fs.existsSync(firmware)) { job.status = "failed"; job.error = "firmware_not_found"; return; }
      const token = crypto.randomBytes(24).toString("hex");
      otaFiles.set(token, { firmware, deviceId, expires: Date.now() + 60 * 60 * 1000 });
      await store.enqueueCommand(deviceId, { type: "ota", token, firmware_version: "0.3.0-ID" });
      job.ota_queued = true;
    }
    });
  };

  if (mode === "com") {
    const tool = esptool();
    const probe = spawn(tool.python, [tool.script, "--port", port, "chip_id"], { windowsHide: true });
    let probeOutput = "";
    probe.stdout.on("data", (d) => { probeOutput += d; log(d); });
    probe.stderr.on("data", (d) => { probeOutput += d; log(d); });
    probe.on("error", (e) => { job.status = "failed"; job.error = `chip_probe_failed: ${e.message}`; });
    probe.on("close", async (code) => {
      if (job.status === "failed") return;
      const detected = classifyChip(probeOutput, target);
      const valid = code === 0 && detected.valid;
      job.detected_chip = detected.chip;
      if (!valid) {
        job.status = "failed"; job.error = `wrong_chip: expected ${target === "collar" ? "ESP32-C3" : "ESP32-CAM (ESP32 clásico)"}`;
        job.completed_at = new Date().toISOString();
        return;
      }
      const identity = identityFromProbe(probeOutput, target);
      if (!identity) {
        job.status = "failed"; job.error = "hardware_id_not_found";
        job.completed_at = new Date().toISOString(); return;
      }
      job.hardware_uid = identity.hardwareUid;
      job.generated_device_id = identity.deviceId;
      job.device_id = job.generated_device_id;
      job.logs.push(`[identity] ${target === "main" ? "device_id" : "collar_id"}=${job.generated_device_id}`);
      const existing = await store.getDevice(job.generated_device_id);
      if (existing && existing.type && existing.type !== target) {
        job.status = "failed"; job.error = "device_id_conflict";
        job.completed_at = new Date().toISOString(); return;
      }
      if (target === "collar" && existing?.main_device_id &&
          mainDeviceId && existing.main_device_id !== mainDeviceId) {
        job.status = "failed"; job.error = `collar_already_assigned:${existing.main_device_id}`;
        job.completed_at = new Date().toISOString(); return;
      }
      if (existing) job.logs.push(`[identity] ID existente: se actualizará el mismo dispositivo, no se duplicará`);
      launchBuild();
    });
  } else launchBuild();
  return job;
}

function getJob(id) { return jobs.get(id) || null; }
function getOta(token, deviceId) {
  const item = otaFiles.get(token);
  return item && item.deviceId === deviceId && item.expires > Date.now() ? item.firmware : null;
}

module.exports = { listComPorts, startJob, getJob, getOta, classifyChip, identityFromProbe, cString };
