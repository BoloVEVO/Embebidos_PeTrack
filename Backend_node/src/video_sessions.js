const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const config = require("./config");
const { authenticate, allow } = require("./auth");

const ROOT = path.join(config.STORAGE_DIR, "videos");
fs.mkdirSync(ROOT, { recursive: true });
const sessions = new Map();
const activeByDevice = new Map();
const streams = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_PHOTO_BYTES } });

for (const name of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  try {
    const frame_dir = path.join(ROOT, name.name);
    const saved = JSON.parse(fs.readFileSync(path.join(frame_dir, "session.json"), "utf8"));
    const session = { ...saved, frame_dir, encoding: false };
    if (session.status === "live" || session.status === "processing") session.status = "failed", session.error = "Servidor reiniciado durante la sesión";
    sessions.set(session.id, session); streams.set(session.id, new EventEmitter());
  } catch {}
}

function ffmpegExe() {
  if (process.env.FFMPEG_EXE) return process.env.FFMPEG_EXE;
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) return "ffmpeg";
  try {
    const packages = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    const pkg = fs.readdirSync(packages).find((name) => name.startsWith("Gyan.FFmpeg_"));
    const root = pkg && path.join(packages, pkg);
    const version = root && fs.readdirSync(root).find((name) => name.startsWith("ffmpeg-"));
    const exe = version && path.join(root, version, "bin", "ffmpeg.exe");
    if (exe && fs.existsSync(exe)) return exe;
  } catch {}
  return "ffmpeg";
}

function publicSession(s) {
  const { frame_dir, frame_times, ...safe } = s;
  return safe;
}
function persist(s) {
  fs.writeFileSync(path.join(s.frame_dir, "session.json"), JSON.stringify(publicSession(s), null, 2));
}
function encode(s) {
  if (s.encoding) return;
  s.encoding = true; s.status = "processing"; s.ended_at = s.ended_at || new Date().toISOString(); persist(s);
  const output = path.join(s.frame_dir, "recording.mp4");
  const concat = path.join(s.frame_dir, "frames.txt");
  const endMs = Math.min(Date.parse(s.ended_at), Date.parse(s.started_at) + config.VIDEO_MAX_DURATION_MS);
  const times = s.frame_times?.length === s.frame_count ? s.frame_times :
    Array.from({ length: s.frame_count }, (_, index) => Date.parse(s.started_at) + index * (1000 / config.VIDEO_FPS));
  const lines = [];
  for (let index = 0; index < s.frame_count; index += 1) {
    const name = `frame-${String(index + 1).padStart(6, "0")}.jpg`;
    const next = index + 1 < times.length ? times[index + 1] : endMs;
    const duration = Math.max(0.001, Math.min(2, (next - times[index]) / 1000));
    lines.push(`file '${name}'`, `duration ${duration.toFixed(3)}`);
  }
  if (s.frame_count) lines.push(`file 'frame-${String(s.frame_count).padStart(6, "0")}.jpg'`);
  fs.writeFileSync(concat, lines.join("\n"), "utf8");
  const ffmpeg = ffmpegExe();
  const child = spawn(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-vf", `fps=${config.VIDEO_FPS}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { cwd: s.frame_dir, windowsHide: true });
  let detail = ""; child.stderr.on("data", (d) => { detail = (detail + d).slice(-2000); });
  child.on("error", (e) => { s.status = "failed"; s.error = `ffmpeg: ${e.message}`; persist(s); });
  child.on("close", (code) => { if (code === 0) { s.status = "completed"; s.video_ready = true; } else { s.status = "failed"; s.error = detail || `ffmpeg_exit_${code}`; } persist(s); });
}
function closeSession(s, reason) {
  if (!s || s.status !== "live") return;
  activeByDevice.delete(s.device_id); s.end_reason = reason; s.ended_at = new Date().toISOString();
  s.duration_ms = Math.min(Date.parse(s.ended_at) - Date.parse(s.started_at), config.VIDEO_MAX_DURATION_MS);
  streams.get(s.id)?.emit("end"); encode(s);
}

// Cierra sesiones aunque el dispositivo desaparezca sin alcanzar a llamar /video/end.
const watchdog = setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) {
    if (s.status !== "live") continue;
    if (now - Date.parse(s.started_at) >= config.VIDEO_MAX_DURATION_MS) closeSession(s, "max_duration");
    else if (now - Date.parse(s.last_frame_at) >= config.VIDEO_FRAME_TIMEOUT_MS) closeSession(s, "frame_timeout");
  }
}, 1000);
watchdog.unref?.();

module.exports = function videoSessionsRouter(store) {
  const router = express.Router();
  router.post("/video/frame", upload.single("photo"), async (req, res, next) => {
    try {
      const meta = JSON.parse(req.body.meta || "{}");
      const device = await store.getDevice(String(meta.device_id || ""));
      if (!device || device.type !== "main" || !req.file) return res.status(400).json({ error: "invalid_frame" });
      let s = sessions.get(activeByDevice.get(device.device_id));
      const now = Date.now();
      if (s && now - Date.parse(s.started_at) >= config.VIDEO_MAX_DURATION_MS) {
        closeSession(s, "max_duration");
        return res.status(409).json({ error: "video_max_duration" });
      }
      if (!s) {
        const id = crypto.randomUUID(); const frame_dir = path.join(ROOT, id); fs.mkdirSync(frame_dir, { recursive: true });
        const recent = await store.listDetections({ limit: 50 });
        const detection = recent.find((item) => item.device_id === device.device_id &&
          now - Date.parse(item.ts) >= 0 && now - Date.parse(item.ts) <= 30000);
        s = { id, detection_id: detection?.id || null, device_id: device.device_id, owner_username: device.owner_username, residence: device.residence, status: "live", started_at: new Date().toISOString(), last_frame_at: new Date().toISOString(), frame_count: 0, frame_times: [], fps: config.VIDEO_FPS, pets: meta.pets || [], frame_dir, video_ready: false };
        sessions.set(id, s); activeByDevice.set(device.device_id, id); streams.set(id, new EventEmitter());
      }
      s.frame_count += 1; s.last_frame_at = new Date().toISOString(); s.frame_times.push(now); s.pets = meta.pets || s.pets;
      fs.writeFileSync(path.join(s.frame_dir, `frame-${String(s.frame_count).padStart(6, "0")}.jpg`), req.file.buffer); persist(s);
      streams.get(s.id).emit("frame", req.file.buffer);
      res.status(201).json({ ok: true, session_id: s.id, status: s.status });
    } catch (e) { next(e); }
  });
  router.post("/video/end", async (req, res, next) => { try { const s = sessions.get(activeByDevice.get(String(req.body?.device_id || ""))); if (s) closeSession(s, req.body?.reason || "collar_timeout"); res.json({ ok: true, session_id: s?.id || null }); } catch (e) { next(e); } });
  router.get("/video-sessions", authenticate, allow("resident"), (req, res) => {
    const username = req.user.username || req.user.sub;
    const items = [...sessions.values()].filter((s) => s.owner_username === username).sort((a,b) => b.started_at.localeCompare(a.started_at)).map(publicSession);
    res.json({ items });
  });
  router.get("/video-sessions/:id/live.mjpeg", authenticate, (req, res) => {
    const s = sessions.get(req.params.id); if (!s) return res.status(404).end();
    if (req.user.role === "resident" && s.owner_username !== (req.user.username || req.user.sub)) return res.status(403).end();
    res.writeHead(200, { "Content-Type": "multipart/x-mixed-replace; boundary=frame", "Cache-Control": "no-store" });
    const emitter = streams.get(s.id); const send = (jpg) => res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`) && res.write(jpg) && res.write("\r\n");
    emitter?.on("frame", send); emitter?.once("end", () => res.end()); req.on("close", () => emitter?.off("frame", send));
  });
  router.get("/video-sessions/:id/video.mp4", authenticate, (req, res) => { const s = sessions.get(req.params.id); if (s && req.user.role === "resident" && s.owner_username !== (req.user.username || req.user.sub)) return res.status(403).end(); const file = s && path.join(s.frame_dir, "recording.mp4"); if (!file || !fs.existsSync(file)) return res.status(404).json({ error: "video_not_ready" }); res.sendFile(file); });
  return router;
};
