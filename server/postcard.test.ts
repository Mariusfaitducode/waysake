import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildApp } from "./app.js";
import { ingest } from "./ingest.js";
import { makeJpeg } from "../test/fixtures.js";
import { textPath, wrapLines, routePath } from "./postcard.js";

describe("texte en tracés (sans police installée sur la tour)", () => {
  it("dessine les lettres accentuées et d'Europe centrale, sans glyphe manquant", () => {
    const p = textPath("Škocjan, Bled & Piran", 80);
    expect(p.width).toBeGreaterThan(300);
    expect(p.missing).toBe(0);
    expect(p.d.length).toBeGreaterThan(100);
  });

  it("ne produit que des nombres valides (sinon le rendu SVG s'arrête net)", () => {
    const p = textPath("Italy, Slovenia, Croatia, 25 August – 15 September 2026", 50);
    expect(p.d).not.toMatch(/NaN|Infinity/);
  });

  it("rend les espaces fines et insécables d'Intl comme des espaces (pas de carré)", () => {
    expect(textPath("1\u202F328 km, 25 août\u2009–\u200915 septembre\u00A02026", 50).missing).toBe(0);
  });

  it("coupe un titre long en deux lignes au plus, à la largeur voulue", () => {
    const lines = wrapLines("Italie, Slovénie, Croatie et le tour des Dolomites", 96, 900);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) expect(textPath(l, 96).width).toBeLessThanOrEqual(900);
    expect(wrapLines("Bled", 96, 900)).toEqual(["Bled"]);
  });
});

describe("tracé de l'itinéraire", () => {
  it("tient dans le cadre en gardant les proportions", () => {
    const d = routePath([[12.3, 45.4], [14.1, 46.4], [16.4, 43.5]], { x: 0, y: 0, width: 400, height: 200 });
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(0);
      expect(nums[i]).toBeLessThanOrEqual(400);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
      expect(nums[i + 1]).toBeLessThanOrEqual(200);
    }
    expect(d.startsWith("M")).toBe(true);
    expect(routePath([[12.3, 45.4]], { x: 0, y: 0, width: 400, height: 200 })).toBe("");
  });
});

describe("GET /api/trips/:slug/postcard.jpg", () => {
  it("une image 1080 × 1350 avec la couverture du voyage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    const app = await buildApp({ dataDir: dir });
    for (const [i, day] of ["03", "04", "05"].entries())
      await ingest(app.waysake.db, dir, { name: `IMG_${i}.JPG`, userId: "alex", data: await makeJpeg({ takenAt: `2026:09:${day} 10:00:00`, lat: 46.36 + i * 0.4, lon: 14.11 + i * 0.3, width: 320, height: 200, color: "#3a6" }) });
    app.waysake.rebuild();
    const [trip] = (await app.inject({ url: "/api/trips" })).json();
    const res = await app.inject({ url: `/api/trips/${trip.slug}/postcard.jpg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    const meta = await sharp(res.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
    // L'interface anglaise envoie le titre traduit.
    expect((await app.inject({ url: `/api/trips/${trip.slug}/postcard.jpg?lang=en&title=${encodeURIComponent("Slovenia")}` })).statusCode).toBe(200);
  });

  it("répond 404 pour un voyage inconnu", async () => {
    const app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "atlas-")) });
    const res = await app.inject({ url: "/api/trips/nulle-part/postcard.jpg" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("trip_not_found");
  });
});
