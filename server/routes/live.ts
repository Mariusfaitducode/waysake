import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { LiveHub } from "../live.js";
import { isReaction } from "../social.js";
import { getTrip } from "../trips.js";
import { identify } from "./users.js";

const HEARTBEAT_MS = 20_000;
const NEED_PROFILE = { error: "Choisis ton profil d'abord", code: "profile_required" };
const NOT_IN_ROOM = { error: "Rejoins d'abord ce voyage.", code: "not_in_room" };

export function liveRoutes(app: FastifyInstance, db: Db, hub = new LiveHub()) {
  /** Flux SSE : invitations, et, avec `?room=`, l'état du salon et ses réactions. */
  app.get<{ Querystring: { room?: string } }>("/api/live/events", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    const room = typeof req.query.room === "string" && req.query.room ? req.query.room.slice(0, 200) : null;
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 3000\n\n");
    const leave = hub.connect(user.id, room, (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    // Un commentaire régulier garde la connexion ouverte à travers les proxys (Tailscale serve).
    const beat = setInterval(() => reply.raw.write(": ♥\n\n"), HEARTBEAT_MS);
    req.raw.on("close", () => {
      clearInterval(beat);
      leave();
    });
  });

  app.post<{ Params: { slug: string } }>("/api/live/:slug/invite", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    const trip = getTrip(db, req.params.slug);
    if (!trip) return reply.code(404).send({ error: "Ce voyage n'existe pas (ou plus).", code: "trip_not_found" });
    return { invited: hub.invite(user.id, { slug: trip.slug, title: trip.title }) };
  });

  app.post<{ Params: { slug: string }; Body: { mediaId?: unknown } }>("/api/live/:slug/show", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    const mediaId = req.body?.mediaId;
    if (!Number.isInteger(mediaId)) return reply.code(400).send({ error: "Photo invalide.", code: "invalid_media" });
    const state = hub.show(req.params.slug, user.id, mediaId as number);
    return state ?? reply.code(403).send(NOT_IN_ROOM);
  });

  app.post<{ Params: { slug: string }; Body: { emoji?: unknown; mediaId?: unknown } }>("/api/live/:slug/react", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    const { emoji, mediaId } = req.body ?? {};
    if (!isReaction(emoji) || !Number.isInteger(mediaId)) return reply.code(400).send({ error: "Réaction inconnue.", code: "bad_reaction" });
    return hub.react(req.params.slug, user.id, emoji, mediaId as number) ? { ok: true } : reply.code(403).send(NOT_IN_ROOM);
  });
}
