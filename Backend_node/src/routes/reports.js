// =============================================================================
//  routes/reports.js — Reportes del residente al Staff de la ciudadela.
//    POST   /report         { residence, detection_ids[], message }
//    GET    /reports        (?status=pending|resolved&limit=)
//    PATCH  /reports/:id    { status: "resolved" | "dismissed" }
// =============================================================================
const express = require("express");

module.exports = function reportsRouter(store) {
  const router = express.Router();

  router.post("/report", async (req, res, next) => {
    try {
      const { residence, detection_ids, message } = req.body || {};
      if (!residence) return res.status(400).json({ error: "missing_residence" });
      const rec = await store.addReport({
        residence,
        detection_ids: Array.isArray(detection_ids) ? detection_ids : [],
        message: typeof message === "string" ? message : "",
        status: "pending",
        ts: new Date().toISOString(),
      });
      res.status(201).json({ ok: true, id: rec.id });
    } catch (e) {
      next(e);
    }
  });

  router.get("/reports", async (req, res, next) => {
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

  router.patch("/reports/:id", async (req, res, next) => {
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
