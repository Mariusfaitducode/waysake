import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { onThisDay, tripStats } from "../souvenirs.js";
import { withSocial } from "../social.js";
import { getTrip } from "../trips.js";
import { renderPostcard } from "../postcard.js";
import { mediaDto, type MediaRow } from "./media.js";

const MAX_PER_YEAR = 60;

export function souvenirRoutes(app: FastifyInstance, db: Db, dataDir: string) {
  /** `today` vient du téléphone : c'est sa date locale qui compte, pas celle de la tour. */
  app.get<{ Querystring: { today?: string } }>("/api/memories", async (req, reply) => {
    const today = req.query.today ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return reply.code(400).send({ error: "Date invalide.", code: "invalid_date" });
    const md = today.slice(5, 10);
    const rows = db
      .prepare(
        `SELECT id, taken_at_local AS takenAtLocal FROM media
         WHERE status = 'ready' AND excluded = 0 AND substr(taken_at_local, 6, 5) IN (?, '02-29')`,
      )
      .all(md) as { id: number; takenAtLocal: string }[];
    const one = db.prepare("SELECT * FROM media WHERE id = ?");
    const tripOf = db.prepare(
      `SELECT t.slug, coalesce(t.custom_title, t.title) AS title FROM media_chapter mc
       JOIN chapter c ON c.id = mc.chapter_id JOIN trip t ON t.id = c.trip_id WHERE mc.media_id = ?`,
    );
    return {
      groups: onThisDay(rows, today).map((g) => {
        const ids = g.ids.slice(0, MAX_PER_YEAR);
        return {
          year: g.year,
          yearsAgo: g.yearsAgo,
          count: g.ids.length,
          trip: (tripOf.get(ids[0]) as { slug: string; title: string } | undefined) ?? null,
          media: withSocial(db, ids.map((id) => mediaDto(one.get(id) as MediaRow))),
        };
      }),
    };
  });

  app.get<{ Params: { slug: string } }>("/api/trips/:slug/stats", async (req, reply) => {
    const t = getTrip(db, req.params.slug);
    if (!t) return reply.code(404).send({ error: "Ce voyage n'existe pas (ou plus).", code: "trip_not_found" });
    return tripStats(t);
  });

  app.get<{ Params: { slug: string }; Querystring: { lang?: string; title?: string } }>("/api/trips/:slug/postcard.jpg", async (req, reply) => {
    const t = getTrip(db, req.params.slug);
    if (!t) return reply.code(404).send({ error: "Ce voyage n'existe pas (ou plus).", code: "trip_not_found" });
    const stats = tripStats(t);
    const cover = t.coverMediaId ? (db.prepare("SELECT sha256 FROM media WHERE id = ?").get(t.coverMediaId) as { sha256: string } | undefined) : undefined;
    const jpeg = await renderPostcard(
      dataDir,
      { title: req.query.title?.trim().slice(0, 120) || t.title, startAt: t.startAt, endAt: t.endAt, countryCodes: t.countryCodes, route: t.route, coverSha256: cover?.sha256 ?? null, km: stats.km, days: stats.days, photos: stats.photos, color: t.color, stops: t.chapters.map((c) => c.title) },
      req.query.lang === "en" ? "en" : "fr",
    );
    return reply
      .type("image/jpeg")
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", `inline; filename="${t.slug}.jpg"`)
      .send(jpeg);
  });
}
