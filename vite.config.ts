import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * MapLibre 6 charge son worker à côté du script qui l'importe (`new URL("maplibre-gl-worker.mjs", import.meta.url)`),
 * et ce worker importe `./maplibre-gl-shared.mjs`. On copie donc les deux fichiers dans `assets/` au build.
 */
function maplibreWorker(): Plugin {
  const dist = dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")) + "/dist";
  return {
    name: "waysake:maplibre-worker",
    apply: "build",
    generateBundle() {
      for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
        this.emitFile({ type: "asset", fileName: `assets/${f}`, source: readFileSync(join(dist, f)) });
    },
  };
}

export default defineConfig({
  root: "web",
  plugins: [react(), maplibreWorker()],
  // MapLibre 6 charge son worker (module ES) par chemin relatif : le pré-empaquetage de Vite le casserait.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 5173, host: true, proxy: { "/api/": "http://localhost:8420" } },
});
