import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { countriesGeoJson, countryName, distanceKm, flag, type GeoPlace } from "../geo.js";
import { getTrip, listTrips, mergeChapterWithPrevious, renameChapter, renameTrip, setCover } from "../trips.js";
import { mediaUrls } from "./media.js";
import { tripFavorites, withSocial } from "../social.js";

const cover = (id: number | null) => (id ? mediaUrls(id).thumb : null);
const coverLarge = (id: number | null) => (id ? mediaUrls(id).preview : null);

export function tripRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/trips", async () =>
    listTrips(db).map((t) => ({ ...t, cover: cover(t.coverMediaId), coverLarge: coverLarge(t.coverMediaId) })),
  );

  app.get<{ Params: { slug: string } }>("/api/trips/:slug", async (req, reply) => {
    const t = getTrip(db, req.params.slug);
    if (!t) return reply.code(404).send({ error: "Ce voyage n'existe pas (ou plus).", code: "trip_not_found" });
    const notes = db
      .prepare("SELECT chapter_id AS chapterId, body, author, updated_at AS updatedAt FROM note WHERE trip_id = ? ORDER BY chapter_id IS NOT NULL, chapter_id")
      .all(t.id);
    return {
      ...t,
      cover: cover(t.coverMediaId),
      coverLarge: coverLarge(t.coverMediaId),
      chapters: t.chapters.map((c) => ({ ...c, media: withSocial(db, c.media.map((m) => ({ ...m, ...mediaUrls(m.id) }))) })),
      favorites: tripFavorites(db, t.id),
      notes,
    };
  });

  app.patch<{ Params: { slug: string }; Body: { title?: string | null; coverMediaId?: number | null } }>(
    "/api/trips/:slug",
    async (req, reply) => {
      const { title, coverMediaId } = req.body ?? {};
      if (!getTrip(db, req.params.slug)) return reply.code(404).send({ error: "Introuvable", code: "not_found" });
      if (coverMediaId !== undefined && !setCover(db, req.params.slug, coverMediaId))
        return reply.code(400).send({ error: "Cette photo ne fait pas partie du voyage.", code: "cover_not_in_trip" });
      if (title !== undefined) renameTrip(db, req.params.slug, title);
      return { ok: true };
    },
  );

  app.patch<{ Params: { id: string }; Body: { title?: string | null } }>("/api/chapters/:id", async (req, reply) => {
    if (!renameChapter(db, Number(req.params.id), req.body?.title ?? null)) return reply.code(404).send({ error: "Introuvable", code: "not_found" });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/chapters/:id/merge-previous", async (req, reply) => {
    if (!mergeChapterWithPrevious(db, Number(req.params.id)))
      return reply.code(400).send({ error: "Cette étape ne peut pas être fusionnée.", code: "chapter_not_mergeable" });
    return { ok: true };
  });

  app.get("/api/countries", async () => {
    const rows = db
      .prepare(
        `SELECT json_extract(m.geo, '$.countryCode') AS code, c.trip_id AS tripId, t.start_at AS startAt, count(*) AS n
         FROM media_chapter mc JOIN media m ON m.id = mc.media_id JOIN chapter c ON c.id = mc.chapter_id JOIN trip t ON t.id = c.trip_id
         WHERE m.geo IS NOT NULL GROUP BY code, c.trip_id`,
      )
      .all() as { code: string; tripId: number; startAt: number; n: number }[];
    const byCode = new Map<string, { code: string; trips: Set<number>; firstVisit: number; photos: number }>();
    for (const r of rows) {
      const c = byCode.get(r.code) ?? byCode.set(r.code, { code: r.code, trips: new Set(), firstVisit: r.startAt, photos: 0 }).get(r.code)!;
      c.trips.add(r.tripId);
      c.firstVisit = Math.min(c.firstVisit, r.startAt);
      c.photos += r.n;
    }
    return [...byCode.values()]
      .map((c) => ({ code: c.code, name: countryName(c.code), flag: flag(c.code), trips: c.trips.size, firstVisit: c.firstVisit, photos: c.photos }))
      .sort((a, b) => a.firstVisit - b.firstVisit);
  });

  app.get("/api/overview", async () => {
    const trips = db.prepare("SELECT route, country_codes FROM trip").all() as { route: string; country_codes: string }[];
    const countries = new Set(trips.flatMap((t) => JSON.parse(t.country_codes) as string[]));
    let km = 0;
    for (const t of trips) {
      const r = JSON.parse(t.route) as [number, number][];
      for (let i = 1; i < r.length; i++) km += distanceKm(r[i - 1][1], r[i - 1][0], r[i][1], r[i][0]);
    }
    const m = db.prepare("SELECT sum(kind = 'photo') AS photos, sum(kind = 'video') AS videos FROM media WHERE status = 'ready'").get() as { photos: number | null; videos: number | null };
    return { countries: countries.size, trips: trips.length, photos: m.photos ?? 0, videos: m.videos ?? 0, km: Math.round(km) };
  });

  let geojson: string | null = null;
  app.get("/api/geo/countries.geojson", async (_req, reply) => {
    geojson ??= JSON.stringify(countriesGeoJson());
    return reply.type("application/geo+json").header("Cache-Control", "public, max-age=604800").send(geojson);
  });

  // Lieu d'une photo pour la visionneuse.
  app.get<{ Params: { id: string } }>("/api/media/:id/place", async (req, reply) => {
    const r = db.prepare("SELECT geo FROM media WHERE id = ?").get(Number(req.params.id)) as { geo: string | null } | undefined;
    if (!r) return reply.code(404).send({ error: "Introuvable", code: "not_found" });
    return r.geo ? (JSON.parse(r.geo) as GeoPlace) : null;
  });
}
