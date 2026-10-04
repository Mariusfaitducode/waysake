import type { FastifyInstance } from "fastify";
import { withSocial } from "../social.js";
import { createReadStream, existsSync } from "node:fs";
import type { Db } from "../db.js";
import { createHash } from "node:crypto";
import { createWriteStream, rmSync } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ingestFile, derivedPath, tmpPath, UnsupportedTypeError, UnreadableImageError } from "../ingest.js";
import { detectType } from "../media-types.js";
import { identify } from "./users.js";
import type { Hints } from "../ingest.js";

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Champs envoyés avec le fichier par l'app ou le raccourci ; toute valeur invalide est ignorée. */
export function parseHints(fields: Record<string, unknown>): Hints {
  const value = (k: string) => {
    const f = fields[k] as { value?: unknown } | { value?: unknown }[] | undefined;
    const v = Array.isArray(f) ? f[0]?.value : f?.value;
    return typeof v === "string" ? v.trim() : undefined;
  };
  const num = (k: string, min: number, max: number) => {
    const v = value(k);
    const n = v === undefined || v === "" ? NaN : Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  };
  const h: Hints = {};
  const takenAt = num("takenAt", 0, 8.64e15);
  if (takenAt !== undefined) h.takenAt = Math.round(takenAt);
  const local = value("takenAtLocal")?.slice(0, 19);
  const m = local?.match(LOCAL);
  if (m && !Number.isNaN(Date.parse(`${local}Z`)) && new Date(`${local}Z`).toISOString().startsWith(`${m[1]}-${m[2]}-${m[3]}`)) h.takenAtLocal = local;
  const lat = num("lat", -90, 90);
  const lon = num("lon", -180, 180);
  if (lat !== undefined && lon !== undefined && (lat !== 0 || lon !== 0)) Object.assign(h, { lat, lon });
  if (value("screenshot") === "1" || value("screenshot") === "true") h.screenshot = true;
  return h;
}

export type MediaRow = {
  id: number; sha256: string; kind: "photo" | "video"; original_path: string; original_name: string; mime: string;
  width: number | null; height: number | null; taken_at: number | null; taken_at_local: string | null;
  lat: number | null; lon: number | null; uploaded_by: string; has_thumbs: number; geo: string | null;
  location_source: LocationSource | null;
};

export type LocationSource = "exif" | "phone" | "manual" | "game";

export type MediaDto = ReturnType<typeof mediaDto>;

export const mediaUrls = (id: number) => ({
  thumb: `/api/media/${id}/thumb`,
  preview: `/api/media/${id}/preview`,
  original: `/api/media/${id}/original`,
});

export function mediaDto(r: MediaRow) {
  return {
    id: r.id,
    kind: r.kind,
    width: r.width,
    height: r.height,
    takenAt: r.taken_at,
    takenAtLocal: r.taken_at_local,
    lat: r.lat,
    lon: r.lon,
    locationSource: r.location_source,
    uploadedBy: r.uploaded_by,
    hasThumbs: r.has_thumbs === 1,
    place: r.geo ? ((JSON.parse(r.geo) as { place: string | null }).place ?? null) : null,
    ...mediaUrls(r.id),
  };
}

export function mediaRoutes(app: FastifyInstance, db: Db, dataDir: string, onIngested: () => void = () => {}) {
  app.post<{ Querystring: { import?: string } }>("/api/media", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send({ error: "Choisis ton profil d'abord", code: "profile_required" });
    const importId = req.query.import !== undefined ? Number(req.query.import) : undefined;
    if (importId !== undefined && !db.prepare("SELECT 1 FROM import WHERE id = ? AND status = 'pending'").get(importId))
      return reply.code(404).send({ error: "Cet import est terminé ou n'existe plus.", code: "import_closed" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Aucun fichier", code: "no_file" });
    if (!detectType(file.filename)) {
      file.file.resume();
      return reply.code(415).send({ error: `Format non pris en charge : ${file.filename}`, code: "unsupported_format", file: file.filename });
    }
    // Écriture en flux sur disque, hash calculé au passage : une vidéo de 2 Go n'occupe pas 2 Go de RAM.
    const path = tmpPath(dataDir);
    const hash = createHash("sha256");
    let bytes = 0;
    const tap = new Transform({
      transform(chunk: Buffer, _enc, done) {
        hash.update(chunk);
        bytes += chunk.length;
        done(null, chunk);
      },
    });
    try {
      await pipeline(file.file, tap, createWriteStream(path));
    } catch (err) {
      rmSync(path, { force: true });
      throw err;
    }
    if (file.file.truncated) {
      rmSync(path, { force: true });
      return reply.code(413).send({ error: `Fichier trop lourd (2 Go maximum) : ${file.filename}`, code: "file_too_large_named", file: file.filename });
    }
    try {
      const result = await ingestFile(db, dataDir, {
        name: file.filename, tmpPath: path, sha256: hash.digest("hex"), bytes, userId: user.id,
        importId, hints: parseHints(file.fields as Record<string, unknown>),
      });
      if (!result.duplicate) onIngested();
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof UnsupportedTypeError) return reply.code(415).send({ error: err.message, code: "unsupported_type" });
      if (err instanceof UnreadableImageError) return reply.code(422).send({ error: err.message, code: "unreadable_image" });
      throw err;
    }
  });

  app.get<{ Querystring: { limit?: string; cursor?: string } }>("/api/media", async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    const offset = Math.max(Number(req.query.cursor) || 0, 0);
    const rows = db
      .prepare("SELECT * FROM media WHERE status = 'ready' ORDER BY taken_at IS NULL, taken_at, id LIMIT ? OFFSET ?")
      .all(limit + 1, offset) as MediaRow[];
    const hasMore = rows.length > limit;
    return { items: withSocial(db, rows.slice(0, limit).map(mediaDto)), nextCursor: hasMore ? String(offset + limit) : null };
  });

  app.get("/api/stats", async () => {
    const r = db
      .prepare("SELECT sum(kind = 'photo') AS photos, sum(kind = 'video') AS videos FROM media WHERE status = 'ready'")
      .get() as { photos: number | null; videos: number | null };
    return { photos: r.photos ?? 0, videos: r.videos ?? 0 };
  });

  const find = (id: string) => db.prepare("SELECT * FROM media WHERE id = ?").get(Number(id)) as MediaRow | undefined;

  for (const [route, size] of [["thumb", 400], ["preview", 1600]] as const) {
    app.get<{ Params: { id: string } }>(`/api/media/:id/${route}`, async (req, reply) => {
      const m = find(req.params.id);
      const path = m && derivedPath(dataDir, m.sha256, size);
      if (!m || !m.has_thumbs || !path || !existsSync(path)) return reply.code(404).send({ error: "Introuvable", code: "not_found" });
      reply.header("Cache-Control", "public, max-age=31536000, immutable").type("image/webp");
      return reply.send(createReadStream(path));
    });
  }

  app.get<{ Params: { id: string } }>("/api/media/:id/original", async (req, reply) => {
    const m = find(req.params.id);
    if (!m) return reply.code(404).send({ error: "Introuvable", code: "not_found" });
    reply
      .type(m.mime)
      .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(m.original_name)}`);
    return reply.sendFile(m.original_path, { maxAge: "365d", immutable: true, cacheControl: true });
  });
}
