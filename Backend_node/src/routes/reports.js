// =============================================================================
//  routes/reports.js — Reportes del residente al Staff de la ciudadela.
//    POST   /report         { residence, detection_ids[], message }
//    GET    /reports        (?status=pending|resolved&limit=)
//    PATCH  /reports/:id    { status: "resolved" | "dismissed" }
// =============================================================================
const express = require("express");
const { authenticate, allow } = require("../auth");

module.exports = function reportsRouter(store) {
  const router = express.Router();

  router.post("/report", authenticate, allow("resident"), async (req, res, next) => {
    try {
      const { detection_ids, message } = req.body || {};
      const residence = req.user.residence;
      const residentUsername = req.user.username || req.user.sub;
      const ids = Array.isArray(detection_ids) ? [...new Set(detection_ids.map(String))] : [];
      if (!ids.length) return res.status(400).json({ error: "detections_required" });
      const detections = await Promise.all(ids.map((id) => store.getDetection(id)));
      if (detections.some((detection) => !detection)) {
        return res.status(404).json({ error: "detection_not_found" });
      }
      const devices = await Promise.all(detections.map((detection) => store.getDevice(detection.device_id)));
      const invalid = detections.some((detection, index) => {
        const device = devices[index];
        return !detection.device_id || !device || device.type !== "main" ||
          device.owner_username !== residentUsername;
      });
      if (invalid) return res.status(403).json({ error: "detection_not_owned" });
      const deviceIds = [...new Set(detections.map((detection) => detection.device_id))];
      const rec = await store.addReport({
        residence,
        resident_username: residentUsername,
        detection_ids: ids,
        device_ids: deviceIds,
        message: typeof message === "string" ? message : "",
        status: "pending",
        ts: new Date().toISOString(),
      });
      res.status(201).json({ ok: true, id: rec.id });
    } catch (e) {
      next(e);
    }
  });

  router.get("/reports", authenticate, allow("staff"), async (req, res, next) => {
    try {
      let limit = parseInt(req.query.limit || "50", 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 50;
      let items = await store.listReports({ limit: Math.min(limit, 200) });
      // Filtro por status en memoria (evita índice compuesto en Firestore)
      if (req.query.status) {
        items = items.filter((r) => r.status === req.query.status);
      }
      res.json({ items, count: items.length });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/reports/:id", authenticate, allow("staff"), async (req, res, next) => {
    try {
      const { status } = req.body || {};
      const VALID = ["pending", "resolved", "dismissed"];
      if (!VALID.includes(status)) {
        return res.status(400).json({ error: "invalid_status", valid: VALID });
      }
      const rec = await store.updateReport(req.params.id, {
        status,
        resolved_at: new Date().toISOString(),
      });
      if (!rec) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true, report: rec });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
