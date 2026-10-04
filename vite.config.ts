import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Mode démo statique (`vite build --mode demo`, voir web/demo/runtime.tsx) : seul ce mode garde le vrai module ;
 * partout ailleurs, `web/demo/runtime.js` devient `web/demo/off.ts` et aucun code de démo n'entre dans le bundle.
 */
function demoRuntime(demo: boolean): Plugin {
  const off = fileURLToPath(new URL("./web/demo/off.ts", import.meta.url));
  return {
    name: "waysake:demo-runtime",
    enforce: "pre",
    resolveId(source) {
      if (!demo && /(^|\/)demo\/runtime\.js$/.test(source)) return off;
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    root: "web",
    // La démo est publiée sous un sous-chemin (waysake.com/demo/ par défaut ; DEMO_BASE pour un autre).
    base: demo ? (process.env.DEMO_BASE ?? "/demo/") : "/",
    plugins: [react(), maplibreWorker(), demoRuntime(demo)],
    // MapLibre 6 charge son worker (module ES) par chemin relatif : le pré-empaquetage de Vite le casserait.
    optimizeDeps: { exclude: ["maplibre-gl"] },
    build: { outDir: demo ? "../dist-demo" : "../dist", emptyOutDir: true },
    server: { port: Number(process.env.WEB_PORT ?? 5173), host: true, proxy: { "/api/": `http://localhost:${process.env.ATLAS_PORT ?? 8420}` } },
  };
});
