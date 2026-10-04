import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { inferLocations } from "../clustering.js";
import { groupMoments } from "../moments.js";
import { rebuildTrips } from "../trips.js";

type Row = { id: number; taken_at: number; taken_at_local: string; lat: number | null; lon: number | null; width: number | null; height: number | null; has_thumbs: number; kind: string };

/** Photos à localiser (aucun lieu, et aucune voisine localisée à moins de 2 h), et pose d'un lieu en lot. */
/** Photos sans lieu (ni GPS, ni voisine localisée à moins de 2 h), groupées par journée et par moment. */
export function findUnlocated(db: Db) {
  const rows = db
    .prepare("SELECT id, kind, taken_at, taken_at_local, lat, lon, width, height, has_thumbs FROM media WHERE status = 'ready' AND taken_at IS NOT NULL ORDER BY taken_at")
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
          return { id, kind: r.kind, width: r.width, height: r.height, hasThumbs: r.has_thumbs === 1, thumb: `/api/media/${id}/thumb`, preview: `/api/media/${id}/preview`, takenAtLocal: r.taken_at_local };
        }),
      })),
    };
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
