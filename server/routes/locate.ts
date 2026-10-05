import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { inferLocations } from "../clustering.js";
import { groupMoments } from "../moments.js";
import { rebuildTrips } from "../trips.js";
import { flag, reverseGeocode, type GeoPlace } from "../geo.js";
import { suggestPlaces, WIDE_WINDOW } from "../place-suggest.js";

type Row = { id: number; taken_at: number; taken_at_local: string; lat: number | null; lon: number | null; width: number | null; height: number | null; has_thumbs: number; kind: string; uploaded_by: string };

/** Photos à localiser (aucun lieu, et aucune voisine localisée à moins de 2 h), et pose d'un lieu en lot. */
/** Photos sans lieu (ni GPS, ni voisine localisée à moins de 2 h), groupées par journée et par moment. */
export function findUnlocated(db: Db) {
  const rows = db
    .prepare("SELECT id, kind, taken_at, taken_at_local, lat, lon, width, height, has_thumbs, uploaded_by FROM media WHERE status = 'ready' AND taken_at IS NOT NULL ORDER BY taken_at")
    .all() as Row[];
  const inferred = inferLocations(rows.map((r) => ({ id: r.id, takenAt: r.taken_at, lat: r.lat, lon: r.lon, geo: r.lat !== null ? ({} as never) : null })));
  const lost = new Set(inferred.filter((i) => i.lat === null).map((i) => i.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const days = groupMoments(rows.filter((r) => lost.has(r.id)).map((r) => ({ id: r.id, takenAt: r.taken_at, takenAtLocal: r.taken_at_local })));
  return { lost, byId, days };
}

export function locateRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/unlocated", async () => {
    const { lost, byId, days } = findUnlocated(db);
    return {
      total: lost.size,
      days: days.map((d) => ({
        day: d.day,
        count: d.ids.length,
        moments: d.moments.map((m) => ({ ...m, count: m.ids.length })),
        media: d.ids.map((id) => {
          const r = byId.get(id)!;
          return { id, kind: r.kind, width: r.width, height: r.height, hasThumbs: r.has_thumbs === 1, thumb: `/api/media/${id}/thumb`, preview: `/api/media/${id}/preview`, original: `/api/media/${id}/original`, uploadedBy: r.uploaded_by, takenAtLocal: r.taken_at_local };
        }),
      })),
    };
  });

  /** Le nom d'un point posé sur la carte (lieu le plus proche, hors ligne). */
  app.get<{ Querystring: { lat?: string; lon?: string } }>("/api/places/reverse", async (req, reply) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!req.query.lat || !req.query.lon || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      return reply.code(400).send({ error: "Lieu ou photos invalides.", code: "invalid_place" });
    const g = reverseGeocode(lat, lon);
    return {
      lat,
      lon,
      name: g ? (g.place ?? g.region ?? g.admin1 ?? g.country) : null,
      country: g?.country ?? null,
      countryCode: g?.countryCode ?? null,
      flag: g ? flag(g.countryCode) : null,
    };
  });

  /**
   * Lieux suggérés pour un groupe (au plus 3) : les villes des photos déjà localisées prises au même moment.
   * Les identifiants inconnus sont ignorés.
   */
  app.get<{ Querystring: { ids?: string } }>("/api/places/suggest", async (req, reply) => {
    const parts = (req.query.ids ?? "").split(",");
    if (!req.query.ids || parts.length > 500 || !parts.every((x) => /^\d+$/.test(x)))
      return reply.code(400).send({ error: "Lieu ou photos invalides.", code: "invalid_place" });
    const ids = JSON.stringify(parts.map(Number));
    const group = db
      .prepare("SELECT MIN(taken_at) AS start, MAX(taken_at) AS end FROM media WHERE id IN (SELECT value FROM json_each(?)) AND taken_at IS NOT NULL")
      .get(ids) as { start: number | null; end: number | null };
    if (group.start === null || group.end === null) return [];
    const owner = db
      .prepare("SELECT uploaded_by FROM media WHERE id IN (SELECT value FROM json_each(?)) GROUP BY uploaded_by ORDER BY COUNT(*) DESC, uploaded_by LIMIT 1")
      .get(ids) as { uploaded_by: string } | undefined;
    const rows = db
      .prepare(
        `SELECT taken_at, lat, lon, geo, uploaded_by FROM media
         WHERE status = 'ready' AND lat IS NOT NULL AND lon IS NOT NULL AND taken_at BETWEEN ? AND ?
           AND id NOT IN (SELECT value FROM json_each(?))`,
      )
      .all(group.start - WIDE_WINDOW, group.end + WIDE_WINDOW, ids) as { taken_at: number; lat: number; lon: number; geo: string | null; uploaded_by: string }[];
    const candidates = rows.map((r) => ({
      takenAt: r.taken_at,
      lat: r.lat,
      lon: r.lon,
      geo: r.geo ? (JSON.parse(r.geo) as GeoPlace) : reverseGeocode(r.lat, r.lon),
      uploadedBy: r.uploaded_by,
    }));
    return suggestPlaces({ start: group.start, end: group.end }, owner?.uploaded_by ?? null, candidates);
  });

  app.post<{ Body: { ids?: unknown; lat?: unknown; lon?: unknown } }>("/api/media/locate", async (req, reply) => {
    const { ids, lat, lon } = req.body ?? {};
    const valid =
      Array.isArray(ids) && ids.length > 0 && ids.length <= 5000 && ids.every((x) => Number.isInteger(x)) &&
      typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
      typeof lon === "number" && Number.isFinite(lon) && Math.abs(lon) <= 180;
    if (!valid) return reply.code(400).send({ error: "Lieu ou photos invalides.", code: "invalid_place" });
    // Un GPS d'origine (fichier ou téléphone) n'est jamais remplacé ; un lieu manuel ou de jeu peut être corrigé.
    const { changes } = db
      .prepare(
        `UPDATE media SET lat = ?, lon = ?, geo = NULL, location_source = 'manual'
         WHERE id IN (SELECT value FROM json_each(?)) AND (lat IS NULL OR location_source IN ('manual', 'game'))`,
      )
      .run(lat, lon, JSON.stringify(ids));
    rebuildTrips(db);
    return { updated: changes };
  });
}
