import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:8787", timeout: 120000, proxyTimeout: 120000 },
      "/ws": { target: "ws://localhost:8787", ws: true }
    }
  }
});
