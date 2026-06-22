import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_API_URL configura la URL del backend (por defecto localhost:3000).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
