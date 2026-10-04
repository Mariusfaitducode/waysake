import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { creditsMarkdown, demoPhotoFor, demoPhotoJpeg, demoPhotoManifest, DOCS_PATH } from "./demo-photos.js";
import { demoShots } from "./demo-trips.js";

const cacheDir = mkdtempSync(join(tmpdir(), "waysake-demo-cache-"));
afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));

describe("photos de démo", () => {
  it("chaque prise de vue du seed a sa propre photo, au bon lieu", () => {
    const places = demoPhotoManifest().places;
    const shots = demoShots();
    const used = new Set<string>();
    for (const s of shots) {
      expect(places[s.place], s.place).toBeDefined();
      expect(s.index).toBeLessThan(places[s.place].length);
      used.add(`${s.place}/${demoPhotoFor(s.place, s.index).photo.file}`);
    }
    expect(used.size).toBe(shots.length);
  });

  it("le manifeste crédite chaque photo et donne un lien direct", () => {
    for (const p of Object.values(demoPhotoManifest().places).flat()) {
      expect(p.title && p.author && p.license).toBeTruthy();
      if (p.license !== "Public domain") expect(p.licenseUrl).toMatch(/^https?:\/\/creativecommons\.org\//);
      expect(p.source).toMatch(/^https:\/\/(commons\.wikimedia\.org\/wiki\/File:|www\.flickr\.com\/photos\/)/);
      expect(p.url).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\/|^https:\/\/live\.staticflickr\.com\//);
    }
  });

  it("docs/demo-photos.md est à jour (pnpm tsx scripts/demo-photos.ts --docs)", () => {
    expect(readFileSync(DOCS_PATH, "utf8")).toBe(creditsMarkdown());
  });

  it("sans réseau : image unie au bon format, sans planter ni écrire dans le cache", async () => {
    const failing = (() => Promise.reject(new Error("hors ligne"))) as typeof fetch;
    const warn = console.warn;
    console.warn = () => {};
    try {
      const a = await demoPhotoJpeg("Bled", 0, 160, 107, { cacheDir, fetch: failing, retryDelayMs: 1, seed: "x" });
      const b = await demoPhotoJpeg("Bled", 0, 160, 107, { cacheDir, offline: true, seed: "x" });
      expect(a.photo).toBeNull();
      expect(a.data.equals(b.data)).toBe(true);
      expect(await sharp(a.data).metadata()).toMatchObject({ width: 160, height: 107, format: "jpeg" });
      expect(existsSync(join(cacheDir, "bled"))).toBe(false);
    } finally {
      console.warn = warn;
    }
  });

  it("télécharge une fois, puis sert le cache, recadré", async () => {
    const source = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#3a7", noise: { type: "gaussian", mean: 128, sigma: 40 } } })
      .jpeg()
      .toBuffer();
    let calls = 0;
    const fake = (async (_url: string, init?: RequestInit) => {
      calls++;
      expect(new Headers(init?.headers).get("user-agent")).toMatch(/Waysake/);
      return new Response(new Uint8Array(source), { status: 200 });
    }) as typeof fetch;
    const first = await demoPhotoJpeg("Hvar", 1, 90, 160, { cacheDir, fetch: fake });
    const again = await demoPhotoJpeg("Hvar", 1, 90, 160, { cacheDir, fetch: fake });
    expect(calls).toBe(1);
    expect(first.photo?.file).toBe(demoPhotoFor("Hvar", 1).photo.file);
    expect(first.data.equals(again.data)).toBe(true);
    expect(await sharp(first.data).metadata()).toMatchObject({ width: 90, height: 160 });
  });
});
