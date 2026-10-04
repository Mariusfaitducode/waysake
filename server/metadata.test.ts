import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { readMetadata } from "./metadata.js";
import { makeJpeg } from "../test/fixtures.js";

describe("readMetadata", () => {
  it("lit date, GPS et appareil", async () => {
    const m = await readMetadata(await makeJpeg({ takenAt: "2026:09:01 14:03:22", lat: 46.41, lon: 11.84 }));
    expect(m.takenAtLocal).toBe("2026-09-01T14:03:22");
    expect(m.takenAt).toBe(Date.UTC(2026, 8, 1, 14, 3, 22));
    expect(m.lat).toBeCloseTo(46.41, 3);
    expect(m.lon).toBeCloseTo(11.84, 3);
    expect(m.camera).toBe("Apple iPhone 15");
  });

  it("applique le décalage horaire", async () => {
    const m = await readMetadata(await makeJpeg({ takenAt: "2026:09:01 14:00:00", offset: "+02:00" }));
    expect(m.takenAt).toBe(Date.UTC(2026, 8, 1, 12, 0, 0));
  });

  it("gère l'hémisphère sud et l'ouest", async () => {
    const m = await readMetadata(await makeJpeg({ lat: -33.9, lon: -18.4 }));
    expect(m.lat).toBeCloseTo(-33.9, 3);
    expect(m.lon).toBeCloseTo(-18.4, 3);
  });

  it("renvoie des nulls pour une image sans EXIF", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    expect(await readMetadata(png)).toEqual({ takenAt: null, takenAtLocal: null, lat: null, lon: null, camera: null });
  });
});
