// =============================================================================
//  app.js — Construcción de la app Express (separada de index.js para tests).
// =============================================================================
const express = require("express");
const cors = require("cors");
const config = require("./config");
const { createStore } = require("./store");

function createApp() {
  const app = express();
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json()); // multipart lo maneja multer en /detection (no afecta)

  const store = createStore();
  app.locals.store = store;

  // Health-check (libre).
  app.get("/", (_req, res) =>
    res.json({
      ok: true,
      service: "petprox-backend",
      version: "0.2.0",
      store: store.mode,
      ts: new Date().toISOString(),
    }),
  );

  // Routers modulares.
  app.use(require("./routes/detections")(store));
  app.use(require("./routes/reports")(store));
  app.use(require("./routes/devices")(store));
  app.use(require("./routes/pets")(store));

  // 404.
  app.use((req, res) => res.status(404).json({ error: "not_found", path: req.path }));

  // Manejo central de errores.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: "photo_too_large", max_bytes: config.MAX_PHOTO_BYTES });
    }
    console.error("[error]", err);
    res.status(500).json({ error: "internal", message: err.message });
  });

  return app;
}

module.exports = { createApp };
