import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { getLifePlace, listLifePlaces, renameLifePlace, setLifePlaceCover, setLifePlaceStatus, tripToLifePlace } from "../lifeplace-store.js";
import { withSocial } from "../social.js";
import { mediaUrls } from "./media.js";
import { identify } from "./users.js";

const cover = (id: number | null) => (id ? mediaUrls(id).thumb : null);
const coverLarge = (id: number | null) => (id ? mediaUrls(id).preview : null);
const notFound = { error: "Ce lieu de vie n'existe pas (ou plus).", code: "place_not_found" };
const profileRequired = { error: "Choisis ton profil d'abord.", code: "profile_required" };

/** Lieux de vie : liste, page d'un lieu (périodes), renommage, couverture, confirmation ou rejet. */
export function lifePlaceRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/places-of-life", async () =>
    listLifePlaces(db).map(({ periodCount, ...p }) => ({ ...p, periods: periodCount, cover: cover(p.coverMediaId), coverLarge: coverLarge(p.coverMediaId) })),
  );

  app.get<{ Params: { slug: string } }>("/api/places-of-life/:slug", async (req, reply) => {
    const p = getLifePlace(db, req.params.slug);
    if (!p) return reply.code(404).send(notFound);
    return {
      ...p,
      cover: cover(p.coverMediaId),
      coverLarge: coverLarge(p.coverMediaId),
      periods: p.periods.map((x) => ({ ...x, media: withSocial(db, x.media.map((m) => ({ ...m, ...mediaUrls(m.id) }))) })),
    };
  });

  app.patch<{ Params: { slug: string }; Body: { title?: unknown; coverMediaId?: unknown; status?: unknown } }>(
    "/api/places-of-life/:slug",
    async (req, reply) => {
      if (!identify(db, req)) return reply.code(401).send(profileRequired);
      const { title, coverMediaId, status } = req.body ?? {};
      const slug = req.params.slug;
      if (!getLifePlace(db, slug)) return reply.code(404).send(notFound);
      if (status !== undefined && status !== "confirmed" && status !== "rejected")
        return reply.code(400).send({ error: "Statut inconnu.", code: "invalid_status" });
      if (title !== undefined && title !== null && typeof title !== "string") return reply.code(400).send({ error: "Requête invalide.", code: "invalid_request" });
      if (coverMediaId !== undefined && coverMediaId !== null && !Number.isInteger(coverMediaId))
        return reply.code(400).send({ error: "Requête invalide.", code: "invalid_request" });
      if (coverMediaId !== undefined && !setLifePlaceCover(db, slug, coverMediaId as number | null))
        return reply.code(400).send({ error: "Cette photo ne fait pas partie de ce lieu.", code: "cover_not_in_place" });
      if (title !== undefined) renameLifePlace(db, slug, title as string | null);
      if (status !== undefined) setLifePlaceStatus(db, slug, status);
      return { ok: true };
    },
  );

  // « En fait, c'est un lieu de vie » : le voyage disparaît, ses photos rejoignent le lieu.
  app.post<{ Params: { slug: string } }>("/api/trips/:slug/to-place-of-life", async (req, reply) => {
    if (!identify(db, req)) return reply.code(401).send(profileRequired);
    const slug = tripToLifePlace(db, req.params.slug);
    if (!slug) return reply.code(404).send({ error: "Ce voyage n'existe pas (ou plus).", code: "trip_not_found" });
    return { slug };
  });
}
