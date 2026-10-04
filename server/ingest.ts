import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Db } from "./db.js";
import { detectType } from "./media-types.js";
import { readMetadata, type Metadata } from "./metadata.js";
import { makeThumbs, THUMB_SIZES, type ThumbSize } from "./thumbs.js";
import { readVideo } from "./video.js";
import { countFaces } from "./faces.js";
import { isScreenshot } from "./screenshot.js";

export class UnsupportedTypeError extends Error {}
export class UnreadableImageError extends Error {}

export const derivedPath = (dataDir: string, sha256: string, size: ThumbSize) =>
  join(dataDir, "derived", `${sha256}-${size}.webp`);

/** Dossier des envois en cours : sur le même disque que les originaux, pour un simple renommage. */
export function tmpPath(dataDir: string) {
  mkdirSync(join(dataDir, "tmp"), { recursive: true });
  return join(dataDir, "tmp", randomUUID());
}

/** Ce que le téléphone sait de la photo (date, lieu) : ne sert qu'à combler ce que l'EXIF n'a pas. */
export type Hints = { takenAt?: number; takenAtLocal?: string; lat?: number; lon?: number; screenshot?: boolean };

type Incoming = { name: string; tmpPath: string; sha256: string; bytes: number; userId: string; importId?: number; hints?: Hints };

function withHints(meta: Metadata, h: Hints | undefined): Metadata {
  if (!h) return meta;
  const out = { ...meta };
  if (!out.takenAtLocal && h.takenAtLocal) {
    out.takenAtLocal = h.takenAtLocal;
    out.takenAt = h.takenAt ?? Date.parse(`${h.takenAtLocal}Z`);
  } else if (out.takenAt === null && h.takenAt !== undefined) {
    out.takenAt = h.takenAt;
    out.takenAtLocal = new Date(h.takenAt).toISOString().slice(0, 19);
  }
  if (out.lat === null && out.lon === null && h.lat !== undefined && h.lon !== undefined) {
    out.lat = h.lat;
    out.lon = h.lon;
  }
  return out;
}

/**
 * Range un fichier déjà écrit sur disque (envoi en flux) : dédoublonnage, métadonnées, miniatures,
 * puis déplacement vers originals/. Le fichier temporaire est toujours consommé.
 */
export async function ingestFile(db: Db, dataDir: string, file: Incoming): Promise<{ id: number; duplicate: boolean }> {
  try {
    const type = detectType(file.name);
    if (!type) throw new UnsupportedTypeError(`Format non pris en charge : ${file.name}`);

    const existing = db.prepare("SELECT id FROM media WHERE sha256 = ?").get(file.sha256) as { id: number } | undefined;
    if (existing) {
      if (file.importId) db.prepare("UPDATE import SET duplicates = duplicates + 1 WHERE id = ?").run(file.importId);
      return { id: existing.id, duplicate: true };
    }

    let meta: Metadata;
    let thumbSource: Buffer | null;
    if (type.kind === "photo") {
      thumbSource = readFileSync(file.tmpPath);
      meta = await readMetadata(thumbSource);
    } else {
      const v = await readVideo(file.tmpPath);
      if (!v.frame) throw new UnreadableImageError(`Vidéo illisible : ${file.name}`);
      thumbSource = v.frame;
      meta = { takenAt: v.takenAt, takenAtLocal: v.takenAtLocal, lat: v.lat, lon: v.lon, camera: null };
    }
    const gpsInFile = meta.lat !== null;
    meta = withHints(meta, file.hints);
    const locationSource = meta.lat === null ? null : gpsInFile ? "exif" : "phone";
    // Analyse : combien de personnes, et est-ce une capture d'écran ?
    const people = type.kind === "photo" ? await countFaces(thumbSource) : null;
    const screenshot = type.kind === "photo" && isScreenshot({ name: file.name, mime: type.mime, camera: meta.camera, hint: file.hints?.screenshot });

    mkdirSync(join(dataDir, "derived"), { recursive: true });
    let dims: { width: number; height: number };
    try {
      dims = await makeThumbs(thumbSource, join(dataDir, "derived", file.sha256));
    } catch {
      for (const size of THUMB_SIZES) rmSync(derivedPath(dataDir, file.sha256, size), { force: true });
      throw new UnreadableImageError(`${type.kind === "photo" ? "Image" : "Vidéo"} illisible : ${file.name}`);
    }

    const folder = meta.takenAtLocal ? `${meta.takenAtLocal.slice(0, 4)}/${meta.takenAtLocal.slice(5, 7)}` : "undated";
    const originalPath = `originals/${folder}/${file.sha256}.${type.ext}`;
    mkdirSync(dirname(join(dataDir, originalPath)), { recursive: true });
    renameSync(file.tmpPath, join(dataDir, originalPath));

    // ON CONFLICT : un envoi simultané du même fichier a pu insérer entre-temps.
    const inserted = db
      .prepare(
        `INSERT INTO media (sha256, kind, original_path, original_name, mime, bytes, width, height,
           taken_at, taken_at_local, lat, lon, camera, uploaded_by, uploaded_at, has_thumbs, status, import_id, people, screenshot, excluded, location_source)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)
         ON CONFLICT(sha256) DO NOTHING RETURNING id`,
      )
      .get(
        file.sha256, type.kind, originalPath, file.name, type.mime, file.bytes, dims.width, dims.height,
        meta.takenAt, meta.takenAtLocal, meta.lat, meta.lon, meta.camera, file.userId, Date.now(),
        file.importId ? "pending" : "ready", file.importId ?? null, people, screenshot ? 1 : 0,
        // Dans un import, une capture d'écran est mise de côté par défaut (récupérable avant validation).
        screenshot && file.importId ? 1 : 0,
        locationSource,
      ) as { id: number } | undefined;
    if (inserted) return { id: inserted.id, duplicate: false };
    const winner = db.prepare("SELECT id FROM media WHERE sha256 = ?").get(file.sha256) as { id: number };
    return { id: winner.id, duplicate: true };
  } finally {
    rmSync(file.tmpPath, { force: true });
  }
}

/** Variante en mémoire (tests, jeu de démo). */
export async function ingest(db: Db, dataDir: string, file: { name: string; data: Buffer; userId: string; importId?: number; hints?: Hints }) {
  const path = tmpPath(dataDir);
  writeFileSync(path, file.data);
  const sha256 = createHash("sha256").update(file.data).digest("hex");
  return ingestFile(db, dataDir, { ...file, tmpPath: path, sha256, bytes: file.data.length });
}
