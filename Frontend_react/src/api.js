// api.js — Cliente del backend (centraliza las llamadas REST).
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

async function req(path, opts) {
  const r = await fetch(API_URL + path, opts);
  if (!r.ok) {
    let detail = "";
    try { detail = JSON.stringify(await r.json()); } catch {}
    throw new Error(`HTTP ${r.status} ${detail}`);
  }
  return r.json();
}

export const apiUrl = API_URL;

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
