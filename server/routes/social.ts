import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { identify } from "./users.js";
import { NOTE_MAX, isReaction, setPhotoNote, setReaction, socialFor } from "../social.js";

export function socialRoutes(app: FastifyInstance, db: Db) {
  const media = (id: string) => db.prepare("SELECT id FROM media WHERE id = ? AND status = 'ready'").get(Number(id)) as { id: number } | undefined;
  const state = (id: number) => socialFor(db, [id]).get(id) ?? { reactions: {}, note: null };

  app.post<{ Params: { id: string }; Body: { emoji?: unknown; on?: unknown } }>("/api/media/:id/reactions", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send({ error: "Choisis ton profil d'abord", code: "profile_required" });
    const { emoji, on } = req.body ?? {};
    if (!isReaction(emoji) || typeof on !== "boolean") return reply.code(400).send({ error: "Réaction inconnue.", code: "bad_reaction" });
    const m = media(req.params.id);
    if (!m) return reply.code(404).send({ error: "Cette photo n'existe pas (ou plus).", code: "media_not_found" });
    setReaction(db, m.id, user.id, emoji, on);
    return state(m.id);
  });

  app.put<{ Params: { id: string }; Body: { text?: unknown } }>("/api/media/:id/note", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send({ error: "Choisis ton profil d'abord", code: "profile_required" });
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim().length > NOTE_MAX)
      return reply.code(400).send({ error: `Une légende fait ${NOTE_MAX} caractères au plus.`, code: "bad_note" });
    const m = media(req.params.id);
    if (!m) return reply.code(404).send({ error: "Cette photo n'existe pas (ou plus).", code: "media_not_found" });
    setPhotoNote(db, m.id, user.id, text);
    return state(m.id);
  });
}
