import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "./db.js";
import { DEFAULT_UPLOAD_RATE, forecast, knownItems, monthlyGrowth, recordUploadRate, uploadRate } from "./space.js";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 4, 12);

function db(): Db {
  return openDb(mkdtempSync(join(tmpdir(), "waysake-space-")), "Alex");
}
let n = 0;
function add(d: Db, m: { name: string; takenAt: number | null; bytes?: number; kind?: "photo" | "video" }) {
  n++;
  d.prepare(
    `INSERT INTO media (sha256, kind, original_path, original_name, mime, bytes, taken_at, uploaded_by, uploaded_at)
     VALUES (?, ?, ?, ?, 'image/jpeg', ?, ?, 'alex', ?)`,
  ).run(`h${n}`, m.kind ?? "photo", `originals/x/${n}.jpg`, m.name, m.bytes ?? 1000, m.takenAt, now);
}

describe("forecast", () => {
  it("dit combien de mois il reste et quand le disque sera plein", () => {
    const f = forecast(12 * 1e9, 1e9, now);
    expect(f.months).toBe(12);
    expect(new Date(f.fullAt!).getUTCFullYear()).toBe(2027);
    expect(new Date(f.fullAt!).getUTCMonth()).toBe(9);
  });
  it("sans rythme connu, aucune prévision", () => {
    expect(forecast(1e9, 0, now)).toEqual({ months: null, fullAt: null });
  });
});

describe("monthlyGrowth", () => {
  it("moyenne des 12 derniers mois de prises de vue, mois vides compris", () => {
    const d = db();
    add(d, { name: "a.jpg", takenAt: now - 10 * DAY, bytes: 6e9 });
    add(d, { name: "b.jpg", takenAt: now - 200 * DAY, bytes: 6e9 });
    add(d, { name: "old.jpg", takenAt: now - 800 * DAY, bytes: 99e9 }); // trop ancien : rattrapage, pas rythme
    expect(monthlyGrowth(d, now).bytes).toBeCloseTo(1e9, -3);
  });
  it("une bibliothèque toute neuve se mesure sur sa propre durée (au moins un mois)", () => {
    const d = db();
    add(d, { name: "a.jpg", takenAt: now - 5 * DAY, bytes: 3e9 });
    expect(monthlyGrowth(d, now).bytes).toBeCloseTo(3e9, -3);
  });
  it("vide : zéro", () => {
    expect(monthlyGrowth(db(), now).bytes).toBe(0);
  });
});

describe("débit d'envoi", () => {
  it("valeur prudente par défaut, puis moyenne glissante des mesures", () => {
    const d = db();
    expect(uploadRate(d)).toEqual({ bytesPerSecond: DEFAULT_UPLOAD_RATE, measured: false });
    recordUploadRate(d, 10e6, 1000); // 10 Mo/s
    expect(uploadRate(d)).toEqual({ bytesPerSecond: 10e6, measured: true });
    recordUploadRate(d, 2e6, 1000); // 2 Mo/s : la moyenne bouge sans sauter
    const r = uploadRate(d).bytesPerSecond;
    expect(r).toBeLessThan(10e6);
    expect(r).toBeGreaterThan(2e6);
  });
});

describe("knownItems", () => {
  it("reconnaît un fichier par son nom et sa date (fuseau horaire toléré)", () => {
    const d = db();
    const t = Date.UTC(2025, 6, 14, 9, 30);
    add(d, { name: "IMG_20250714_113000.jpg", takenAt: t + 2 * 3600_000 }); // EXIF sans fuseau : heure locale
    add(d, { name: "IMG_0001.JPG", takenAt: Date.UTC(2023, 0, 1) });
    expect(
      knownItems(d, [
        { name: "IMG_20250714_113000.jpg", takenAt: t },
        { name: "img_0001.jpg", takenAt: Date.UTC(2025, 6, 14) }, // même nom, deux ans plus tard : autre photo
        { name: "IMG_20250714_120000.jpg", takenAt: t },
      ]),
    ).toEqual([true, false, false]);
  });
});
