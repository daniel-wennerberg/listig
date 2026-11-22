import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5180,
    // I utveckling går API-anropen till servern (npm run dev i server/)
    proxy: { "/api": "http://localhost:3001" },
  },
});
