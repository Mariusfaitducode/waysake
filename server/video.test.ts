import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readVideo } from "./video.js";
import { openDb } from "./db.js";
import { ingest, derivedPath, UnreadableImageError } from "./ingest.js";
import { makeVideo } from "../test/video.js";

const tmpFile = (data: Buffer) => {
  const p = join(mkdtempSync(join(tmpdir(), "waysake-")), "v.mov");
  writeFileSync(p, data);
  return p;
};

describe("readVideo", () => {
  it("lit la date, la position et extrait une image", async () => {
    const v = await readVideo(tmpFile(makeVideo({ creationTime: "2026-09-01T10:00:00Z", location: "+45.4375+012.3358/" })));
    expect(v.takenAt).toBe(Date.UTC(2026, 8, 1, 10, 0, 0));
    expect(v.takenAtLocal).toBe("2026-09-01T10:00:00");
    expect(v.lat).toBeCloseTo(45.4375, 4);
    expect(v.lon).toBeCloseTo(12.3358, 4);
    expect(v.frame?.length).toBeGreaterThan(500);
  });

  it("gère l'hémisphère sud/ouest et l'absence de métadonnées", async () => {
    const v = await readVideo(tmpFile(makeVideo({ location: "-33.9000-018.4000+010.000/" })));
    expect([v.lat, v.lon]).toEqual([-33.9, -18.4]);
    expect(v.takenAt).toBeNull();
  });

  it("lit aussi les MP4 d'Android", async () => {
    const v = await readVideo(tmpFile(makeVideo({ ext: "mp4", creationTime: "2025-05-04T09:00:00Z" })));
    expect(v.takenAtLocal).toBe("2025-05-04T09:00:00");
    expect(v.frame?.length).toBeGreaterThan(500);
  });

  it("extrait une image même d'une vidéo de moins d'une seconde", async () => {
    const v = await readVideo(tmpFile(makeVideo({ seconds: 0.5 })));
    expect(v.frame?.length).toBeGreaterThan(500);
  });
});

describe("sécurité", () => {
  it("n'interprète jamais une fausse vidéo comme une liste de lecture (lecture de fichiers locaux)", async () => {
    const secretDir = mkdtempSync(join(tmpdir(), "waysake-secret-"));
    const secret = join(secretDir, "secret.mov");
    writeFileSync(secret, makeVideo());
    const playlist = `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nfile://${secret}\n#EXT-X-ENDLIST\n`;
    const concat = `ffconcat version 1.0\nfile '${secret}'\n`;
    for (const content of [playlist, concat]) {
      const v = await readVideo(tmpFile(Buffer.from(content)));
      expect(v.frame).toBeNull();
    }
    // Variante réaliste : chemin relatif depuis data/tmp vers data/originals.
    const root = mkdtempSync(join(tmpdir(), "waysake-data-"));
    mkdirSync(join(root, "originals"));
    mkdirSync(join(root, "tmp"));
    writeFileSync(join(root, "originals", "x.mov"), makeVideo());
    const relative = join(root, "tmp", "evil.mov");
    for (const content of [
      "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\n../originals/x.mov\n#EXT-X-ENDLIST\n",
      "ffconcat version 1.0\nfile '../originals/x.mov'\n",
    ]) {
      writeFileSync(relative, content);
      expect((await readVideo(relative)).frame).toBeNull();
    }
  });
});

describe("ingest vidéo", () => {
  it("crée la miniature et enregistre date et lieu", async () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    const db = openDb(dir);
    const data = makeVideo({ creationTime: "2026-09-02T18:30:00Z", location: "+46.3683+014.1146/" });
    const { id } = await ingest(db, dir, { name: "IMG_0042.MOV", data, userId: "alex" });
    const r = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as any;
    expect(r).toMatchObject({ kind: "video", has_thumbs: 1, width: 320, height: 180, taken_at_local: "2026-09-02T18:30:00" });
    expect(r.lat).toBeCloseTo(46.3683, 3);
    expect(existsSync(derivedPath(dir, r.sha256, 400))).toBe(true);
    expect(r.original_path).toBe(`originals/2026/09/${r.sha256}.mov`);
  });

  it("refuse une vidéo illisible", async () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    await expect(ingest(openDb(dir), dir, { name: "clip.mp4", data: randomBytes(4096), userId: "alex" })).rejects.toBeInstanceOf(UnreadableImageError);
  });
});
