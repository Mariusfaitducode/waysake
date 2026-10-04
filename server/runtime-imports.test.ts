import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * L'image Docker ne contient que server/ et, de web/, les seuls fichiers listés ici (voir Dockerfile).
 * Un import du serveur vers un autre fichier de web/ marche en développement et plante en production.
 */
const SHIPPED_FROM_WEB = new Set(["../web/brand.js"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

describe("imports du serveur en production", () => {
  it("n'importe de web/ que des fichiers copiés dans l'image", () => {
    const outside = files("server").flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/from\s+"((?:\.\.\/)+web\/[^"]+)"/g)]
        .map((m) => m[1].replace(/^(\.\.\/)+/, "../"))
        .filter((spec) => !SHIPPED_FROM_WEB.has(spec))
        .map((spec) => `${f} → ${spec}`),
    );
    expect(outside).toEqual([]);
  });

  it("le Dockerfile copie bien chaque fichier de web/ autorisé", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    for (const spec of SHIPPED_FROM_WEB) expect(dockerfile).toContain(spec.replace("../", "/app/").replace(/\.js$/, ".ts"));
  });
});
