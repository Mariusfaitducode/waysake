import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { openDb, type Db } from "./db.js";
import { ingest, derivedPath, UnsupportedTypeError, UnreadableImageError } from "./ingest.js";
import { readFileSync } from "node:fs";
import { makeJpeg } from "../test/fixtures.js";

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-"));
  db = openDb(dir);
});

const row = (id: number) => db.prepare("SELECT * FROM media WHERE id = ?").get(id) as any;

describe("ingest", () => {
  it("range l'original, extrait les métadonnées et génère les miniatures", async () => {
    const data = await makeJpeg({ takenAt: "2026:09:03 10:00:00", lat: 46.55, lon: 11.75, width: 120, height: 80 });
    const { id, duplicate } = await ingest(db, dir, { name: "IMG_0001.JPG", data, userId: "alex" });
    expect(duplicate).toBe(false);
    const r = row(id);
    expect(r.original_path).toBe(`originals/2026/09/${r.sha256}.jpg`);
    expect(existsSync(join(dir, r.original_path))).toBe(true);
    expect(existsSync(derivedPath(dir, r.sha256, 400))).toBe(true);
    expect(existsSync(derivedPath(dir, r.sha256, 1600))).toBe(true);
    expect([r.width, r.height]).toEqual([120, 80]);
    expect(r.lat).toBeCloseTo(46.55, 3);
    expect(r.taken_at_local).toBe("2026-09-03T10:00:00");
    expect(r.has_thumbs).toBe(1);
    expect(r.uploaded_by).toBe("alex");
  });

  it("détecte un doublon même sous un autre nom", async () => {
    const data = await makeJpeg({ takenAt: "2026:09:03 10:00:00" });
    const a = await ingest(db, dir, { name: "a.jpg", data, userId: "alex" });
    const b = await ingest(db, dir, { name: "copie 😀 é.jpg", data, userId: "sam" });
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(db.prepare("SELECT count(*) AS n FROM media").get()).toEqual({ n: 1 });
  });

  it("refuse les types non supportés", async () => {
    await expect(ingest(db, dir, { name: "notes.txt", data: Buffer.from("hi"), userId: "alex" })).rejects.toBeInstanceOf(
      UnsupportedTypeError,
    );
  });

  it("refuse une image illisible sans laisser de fichier", async () => {
    await expect(
      ingest(db, dir, { name: "broken.jpg", data: randomBytes(2048), userId: "alex" }),
    ).rejects.toBeInstanceOf(UnreadableImageError);
    expect(existsSync(join(dir, "originals")) ? readdirSync(join(dir, "originals"), { recursive: true }) : []).toEqual([]);
    expect(existsSync(join(dir, "derived")) ? readdirSync(join(dir, "derived")) : []).toEqual([]);
    expect(db.prepare("SELECT count(*) AS n FROM media").get()).toEqual({ n: 0 });
  });

  it("range une photo sans date dans undated/", async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#123" } }).png().toBuffer();
    const { id } = await ingest(db, dir, { name: "capture.png", data: png, userId: "sam" });
    const r = row(id);
    expect(r.original_path).toBe(`originals/undated/${r.sha256}.png`);
    expect(r.taken_at).toBeNull();
  });

  it("corrige l'orientation EXIF pour les dimensions", async () => {
    const src = await sharp({ create: { width: 90, height: 30, channels: 3, background: "#456" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const { id } = await ingest(db, dir, { name: "portrait.jpg", data: src, userId: "alex" });
    expect([row(id).width, row(id).height]).toEqual([30, 90]);
  });

  it("enregistre les dimensions de l'original, pas de la miniature", async () => {
    const data = await makeJpeg({ width: 2400, height: 1200 });
    const { id } = await ingest(db, dir, { name: "big.jpg", data, userId: "alex" });
    expect([row(id).width, row(id).height]).toEqual([2400, 1200]);
  });

  it("gère les HEIC d'iPhone (repli libheif)", async () => {
    const data = readFileSync(join(import.meta.dirname, "../test/assets/sample.heic"));
    const { id } = await ingest(db, dir, { name: "IMG_4242.HEIC", data, userId: "sam" });
    const r = row(id);
    expect([r.width, r.height]).toEqual([300, 200]);
    expect(r.lat).toBeCloseTo(45.08, 3);
    expect(r.taken_at_local).toBe("2026-09-10T18:30:00");
    expect(existsSync(derivedPath(dir, r.sha256, 400))).toBe(true);
    expect(r.original_path).toMatch(/\.heic$/);
  });

  it("deux envois simultanés du même fichier → un seul média, l'autre marqué doublon", async () => {
    const data = await makeJpeg({ takenAt: "2026:09:03 10:00:00" });
    const [a, b] = await Promise.all([
      ingest(db, dir, { name: "IMG_1234.jpg", data, userId: "alex" }),
      ingest(db, dir, { name: "IMG_1234 (1).jpg", data, userId: "sam" }),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(db.prepare("SELECT count(*) AS n FROM media").get()).toEqual({ n: 1 });
  });

  it("compte les personnes et repère les captures d'écran", async () => {
    const group = readFileSync(join(import.meta.dirname, "../test/assets/group-7.jpg"));
    const a = await ingest(db, dir, { name: "equipage.jpg", data: group, userId: "alex" });
    expect(row(a.id).people).toBeGreaterThanOrEqual(6);
    const shot = await sharp({ create: { width: 30, height: 60, channels: 3, background: "#fff" } }).png().toBuffer();
    const b = await ingest(db, dir, { name: "Screenshot_20260901-101010.png", data: shot, userId: "alex" });
    expect(row(b.id)).toMatchObject({ screenshot: 1, people: 0 });
    const c = await ingest(db, dir, { name: "IMG_9.jpg", data: await makeJpeg({ color: "#123" }), userId: "alex", hints: { screenshot: true } });
    expect(row(c.id).screenshot).toBe(1);
  });
});
