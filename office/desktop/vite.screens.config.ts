import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Serves ONLY the screens (no Electron) at http://localhost:5173, for checking UI in a
 * browser. Same aliases and plugins as the renderer in electron.vite.config.ts.
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  envDir: resolve(__dirname),
  resolve: { alias: { "@": resolve(__dirname, "src/renderer/src") } },
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
});
