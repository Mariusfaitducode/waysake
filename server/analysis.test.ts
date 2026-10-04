import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { countFaces } from "./faces.js";
import { isScreenshot } from "./screenshot.js";

const asset = (n: string) => readFileSync(join(import.meta.dirname, "../test/assets", n));

describe("countFaces", () => {
  it("compte les 7 membres d'équipage (photo NASA, domaine public)", async () => {
    const n = await countFaces(asset("group-7.jpg"));
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(8);
  });

  it("ne voit personne sur une image sans visage", async () => {
    const plain = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#7a9" } }).jpeg().toBuffer();
    expect(await countFaces(plain)).toBe(0);
  });

  it("renvoie null pour une image illisible, sans lever d'erreur", async () => {
    expect(await countFaces(Buffer.from("pas une image"))).toBeNull();
  });
});

describe("isScreenshot", () => {
  it("suit l'indication du téléphone", () => {
    expect(isScreenshot({ name: "IMG_1.jpg", mime: "image/jpeg", camera: "Apple iPhone 15", hint: true })).toBe(true);
  });
  it("reconnaît les captures Android et iPhone par leur nom, sans appareil photo", () => {
    expect(isScreenshot({ name: "Screenshot_20260901-101010.png", mime: "image/png", camera: null })).toBe(true);
    expect(isScreenshot({ name: "Capture d’écran 2026-09-01.png", mime: "image/png", camera: null })).toBe(true);
  });
  it("une photo d'appareil n'est jamais une capture, même nommée bizarrement", () => {
    expect(isScreenshot({ name: "screenshot-du-lac.jpg", mime: "image/jpeg", camera: "Google Pixel 8" })).toBe(false);
  });
  it("un PNG sans appareil ni nom parlant n'est pas présumé capture", () => {
    expect(isScreenshot({ name: "carte.png", mime: "image/png", camera: null })).toBe(false);
  });
});
