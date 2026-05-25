import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = process.env.TART_API_ORIGIN ?? "http://127.0.0.1:8787";
const devHost = process.env.VITE_DEV_HOST ?? "127.0.0.1";
const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: devHost,
    port: devPort,
    proxy: {
      "/api": {
        target: apiOrigin,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: process.env.VITE_PREVIEW_HOST ?? "127.0.0.1",
    port: Number(process.env.VITE_PREVIEW_PORT ?? 4173)
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  }
});
