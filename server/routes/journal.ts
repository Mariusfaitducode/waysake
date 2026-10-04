import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { flag, searchPlaces } from "../geo.js";
import { currentUser } from "./users.js";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const COUNTRY = /^[A-Z]{2}$/;

class Invalid extends Error {}
const optString = (v: unknown, max: number) => {
  if (v === undefined || v === null) return v;
  if (typeof v !== "string") throw new Invalid();
  return v.slice(0, max);
};
const optCoord = (v: unknown, limit: number) => {
  if (v === undefined || v === null) return v;
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > limit) throw new Invalid();
  return v;
};

/** Valide le corps d'une envie : toute valeur mal typée est refusée, rien d'invalide n'atteint la base. */
function parseWish(b: Record<string, unknown>) {
  const w = {
    title: optString(b.title, 120)?.trim(),
    countryCode: optString(b.countryCode, 8),
    lat: optCoord(b.lat, 90),
    lon: optCoord(b.lon, 180),
    month: optString(b.month, 16),
    note: optString(b.note, 2000),
    doneTripSlug: optString(b.doneTripSlug, 80),
    done: b.done,
  };
  if (w.countryCode && !COUNTRY.test(w.countryCode)) throw new Invalid();
  if (w.month && !MONTH.test(w.month)) throw new Invalid();
  if (w.done !== undefined && typeof w.done !== "boolean") throw new Invalid();
  if ((w.lat === undefined || w.lat === null) !== (w.lon === undefined || w.lon === null)) throw new Invalid();
  return w;
}

export function journalRoutes(app: FastifyInstance, db: Db) {
  // Le carnet exige un profil : chaque note et chaque envie a une autrice ou un auteur.
  const who = (req: { cookies: Record<string, string | undefined> }) => currentUser(db, req.cookies);

  app.put<{ Body: { tripId?: unknown; chapterId?: unknown; body?: unknown } }>("/api/notes", async (req, reply) => {
    const user = who(req);
    if (!user) return reply.code(401).send({ error: "Choisis ton profil d'abord." });
    const { tripId, chapterId = null, body = "" } = req.body ?? {};
    if (!Number.isInteger(tripId) || (chapterId !== null && !Number.isInteger(chapterId)) || typeof body !== "string")
      return reply.code(400).send({ error: "Note invalide." });
    if (!db.prepare("SELECT 1 FROM trip WHERE id = ?").get(tripId)) return reply.code(400).send({ error: "Voyage inconnu." });
    if (chapterId !== null && !db.prepare("SELECT 1 FROM chapter WHERE id = ? AND trip_id = ?").get(chapterId, tripId))
      return reply.code(400).send({ error: "Étape inconnue." });
    const existing = db.prepare("SELECT id FROM note WHERE trip_id = ? AND chapter_id IS ?").get(tripId, chapterId) as { id: number } | undefined;
    const text = body.trim() ? body.slice(0, 20_000) : "";
    if (!text) {
      if (existing) db.prepare("DELETE FROM note WHERE id = ?").run(existing.id);
    } else if (existing) {
      db.prepare("UPDATE note SET body = ?, author = ?, updated_at = ? WHERE id = ?").run(text, user.id, Date.now(), existing.id);
    } else {
      db.prepare("INSERT INTO note (trip_id, chapter_id, body, author, updated_at) VALUES (?, ?, ?, ?, ?)").run(tripId, chapterId, text, user.id, Date.now());
    }
    return { ok: true };
  });

  app.get("/api/notes", async () =>
    (
      db
        .prepare(
          `SELECT n.body, n.author, n.updated_at, n.chapter_id, t.slug, coalesce(t.custom_title, t.title) AS trip_title, t.cover_media_id, t.auto_cover_media_id,
             coalesce(c.custom_title, c.title) AS chapter_title
           FROM note n JOIN trip t ON t.id = n.trip_id LEFT JOIN chapter c ON c.id = n.chapter_id
           ORDER BY n.updated_at DESC, n.id DESC`,
        )
        .all() as any[]
    ).map((n) => {
      const cover = n.cover_media_id ?? n.auto_cover_media_id;
      return {
        body: n.body,
        author: n.author,
        updatedAt: n.updated_at,
        chapterId: n.chapter_id,
        chapterTitle: n.chapter_title ?? null,
        trip: { slug: n.slug, title: n.trip_title, cover: cover ? `/api/media/${cover}/thumb` : null },
      };
    }),
  );

  app.get("/api/wishes", async () => {
    const rows = db
      .prepare(
        `SELECT w.*, t.slug AS trip_slug, coalesce(t.custom_title, t.title) AS trip_title
         FROM wish w LEFT JOIN trip t ON t.id = w.done_trip_id ORDER BY w.done_at IS NOT NULL, w.created_at DESC`,
      )
      .all() as any[];
    return rows.map((w) => ({
      id: w.id,
      title: w.title,
      countryCode: w.country_code,
      flag: flag(w.country_code),
      lat: w.lat,
      lon: w.lon,
      month: w.month,
      note: w.note,
      author: w.author,
      done: w.done_at !== null,
      doneTrip: w.trip_slug ? { slug: w.trip_slug, title: w.trip_title } : null,
    }));
  });

  app.post<{ Body: Record<string, unknown> }>("/api/wishes", async (req, reply) => {
    const user = who(req);
    if (!user) return reply.code(401).send({ error: "Choisis ton profil d'abord." });
    let b: ReturnType<typeof parseWish>;
    try {
      b = parseWish(req.body ?? {});
    } catch {
      return reply.code(400).send({ error: "Envie invalide." });
    }
    const title = b.title;
    if (!title) return reply.code(400).send({ error: "Donne un nom à cette envie." });
    const { id } = db
      .prepare("INSERT INTO wish (title, country_code, lat, lon, month, note, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .get(title, b.countryCode ?? null, b.lat ?? null, b.lon ?? null, b.month ?? null, b.note ?? "", user.id, Date.now()) as { id: number };
    return reply.code(201).send({ id });
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/wishes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    let b: ReturnType<typeof parseWish>;
    try {
      b = parseWish(req.body ?? {});
    } catch {
      return reply.code(400).send({ error: "Envie invalide." });
    }
    if (!db.prepare("SELECT 1 FROM wish WHERE id = ?").get(id)) return reply.code(404).send({ error: "Introuvable" });
    if (b.title !== undefined) {
      if (!b.title) return reply.code(400).send({ error: "Donne un nom à cette envie." });
      db.prepare("UPDATE wish SET title = ? WHERE id = ?").run(b.title, id);
    }
    if (b.note !== undefined && b.note !== null) db.prepare("UPDATE wish SET note = ? WHERE id = ?").run(b.note, id);
    if (b.month !== undefined) db.prepare("UPDATE wish SET month = ? WHERE id = ?").run(b.month, id);
    if (b.doneTripSlug) {
      const t = db.prepare("SELECT id FROM trip WHERE slug = ?").get(b.doneTripSlug) as { id: number } | undefined;
      db.prepare("UPDATE wish SET done_at = ?, done_trip_id = ? WHERE id = ?").run(Date.now(), t?.id ?? null, id);
    } else if (b.done === true) {
      db.prepare("UPDATE wish SET done_at = coalesce(done_at, ?) WHERE id = ?").run(Date.now(), id);
    } else if (b.done === false) {
      db.prepare("UPDATE wish SET done_at = NULL, done_trip_id = NULL WHERE id = ?").run(id);
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/wishes/:id", async (req) => {
    db.prepare("DELETE FROM wish WHERE id = ?").run(Number(req.params.id));
    return { ok: true };
  });

  app.get<{ Querystring: { q?: unknown } }>("/api/places", async (req) =>
    typeof req.query.q === "string" ? searchPlaces(req.query.q.slice(0, 80)).map((p) => ({ ...p, flag: flag(p.countryCode) })) : [],
  );
}
