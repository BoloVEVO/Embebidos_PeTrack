// =============================================================================
//  index.js — Punto de entrada del backend (arranca el servidor).
//  Arranque:  npm install && node index.js   ->  http://localhost:3000/
// =============================================================================
const { createApp } = require("./src/app");
const config = require("./src/config");

const app = createApp();
app.listen(config.PORT, () => {
  console.log(`[petprox-backend] escuchando en http://localhost:${config.PORT}`);
});

module.exports = app;
