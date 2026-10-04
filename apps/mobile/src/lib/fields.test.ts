import { describe, it, expect } from "vitest";
import { uploadFields, localIso, isScreenshotAsset } from "./fields";

describe("localIso", () => {
  it("donne l'heure murale du téléphone, sans fuseau", () => {
    const d = new Date(2026, 8, 3, 10, 5, 9);
    expect(localIso(d.getTime())).toBe("2026-09-03T10:05:09");
  });
});

describe("uploadFields", () => {
  it("envoie date et lieu quand le téléphone les connaît", () => {
    const f = uploadFields({ creationTime: Date.UTC(2026, 8, 3, 8), location: { latitude: 46.37, longitude: 14.11 }, filename: "IMG_1.jpg" });
    expect(f).toMatchObject({ takenAt: String(Date.UTC(2026, 8, 3, 8)), lat: "46.37", lon: "14.11" });
    expect(f.takenAtLocal).toMatch(/^2026-09-03T\d{2}:00:00$/);
    expect(f.screenshot).toBeUndefined();
  });
  it("n'envoie pas de lieu nul ou absent", () => {
    expect(uploadFields({ creationTime: 0, location: { latitude: 0, longitude: 0 }, filename: "a.jpg" })).toEqual({});
    expect(uploadFields({ creationTime: null, filename: "a.jpg" })).toEqual({});
  });
  it("signale les captures d'écran", () => {
    expect(uploadFields({ creationTime: null, filename: "Screenshot_20260901-101010.png" }).screenshot).toBe("1");
    expect(isScreenshotAsset({ filename: "IMG_3.PNG", mediaSubtypes: ["screenshot"] })).toBe(true);
    expect(isScreenshotAsset({ filename: "IMG_3.jpg", albumName: "Screenshots" })).toBe(true);
  });
});
