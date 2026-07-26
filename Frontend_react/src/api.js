// api.js — Cliente del backend (centraliza las llamadas REST).
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

async function req(path, opts) {
  const r = await fetch(API_URL + path, { credentials: "include", ...opts });
  if (!r.ok) {
    let detail = "";
    try { detail = JSON.stringify(await r.json()); } catch {}
    throw new Error(`HTTP ${r.status} ${detail}`);
  }
  return r.json();
}

export const apiUrl = API_URL;

export const getSession = () => req("/auth/me");
export const login = (username, password) => req("/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
export const register = (username, password, role, residence) => req("/auth/register", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password, role, residence }),
});
export const logout = () => req("/auth/logout", { method: "POST" });

// --- Residente ---
export const getHealth     = () => req("/");
export const getDetections = (residence, limit = 30) =>
  req(`/detections?residence=${encodeURIComponent(residence)}&limit=${limit}`);
export const sendReport    = (residence, detectionIds, message) =>
  req("/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ residence, detection_ids: detectionIds, message }),
  });
export const getMyDevices = () => req("/devices/mine");
export const getVideoSessions = () => req("/video-sessions");
export const liveVideoUrl = (id) => `${API_URL}/video-sessions/${encodeURIComponent(id)}/live.mjpeg`;
export const recordedVideoUrl = (id) => `${API_URL}/video-sessions/${encodeURIComponent(id)}/video.mp4`;
export const photoUrl = (id) => `${API_URL}/photos/${id}`;

// --- Staff ---
export const getReports = (status, limit = 50) => {
  const qs = new URLSearchParams({ limit });
  if (status) qs.set("status", status);
  return req(`/reports?${qs}`);
};
export const resolveReport = (id) =>
  req(`/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "resolved" }),
  });

// --- Administración de dispositivos (Staff) ---
export const getResidents = () => req("/admin/residents");
export const getPets = () => req("/pets");
export const getDevices = () => req("/admin/devices");
export const registerDevice = (data) => req("/admin/devices", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});
export const deleteDevice = (id) => req(`/admin/devices/${encodeURIComponent(id)}`, {
  method: "DELETE",
});
export const pairCollar = (mainId, collar_id, pet_id) => req(`/admin/devices/${encodeURIComponent(mainId)}/pair-collar`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collar_id, pet_id }),
});
export const getComPorts = () => req("/admin/com-ports");
export const startFlash = (data) => req("/admin/flash", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});
export const getFlashJob = (id) => req(`/admin/flash/${id}`);
