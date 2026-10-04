import type { Db } from "./db.js";
import { notifyTripsChanged } from "./trip-events.js";

/** Les quatre réactions possibles, dans l'ordre d'affichage. */
export const REACTIONS = ["❤️", "😂", "🤩", "😮"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const NOTE_MAX = 500;
const FAVORITES_MAX = 12;

export type Social = { reactions: Partial<Record<Reaction, string[]>>; note: string | null };

/** Réactions et légende de chaque média demandé (absent = rien). */
export function socialFor(db: Db, ids: number[]): Map<number, Social> {
  const out = new Map<number, Social>();
  const get = (id: number) => out.get(id) ?? (out.set(id, { reactions: {}, note: null }), out.get(id)!);
  // Par paquets : SQLite limite le nombre de paramètres d'une requête.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const marks = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT media_id, user_id, emoji FROM reaction WHERE media_id IN (${marks}) ORDER BY created_at, user_id`)
      .all(...chunk) as { media_id: number; user_id: string; emoji: Reaction }[];
    for (const r of rows) (get(r.media_id).reactions[r.emoji] ??= []).push(r.user_id);
    const notes = db.prepare(`SELECT media_id, body FROM media_note WHERE media_id IN (${marks})`).all(...chunk) as { media_id: number; body: string }[];
    for (const n of notes) get(n.media_id).note = n.body;
  }
  // Ordre stable des réactions (celui de REACTIONS) et des personnes (alphabétique).
  for (const s of out.values()) {
    const sorted: Social["reactions"] = {};
    for (const e of REACTIONS) if (s.reactions[e]) sorted[e] = [...new Set(s.reactions[e])].sort();
    s.reactions = sorted;
  }
  return out;
}

const EMPTY: Social = { reactions: {}, note: null };

/** Ajoute à chaque média ses réactions et sa légende. */
export function withSocial<T extends { id: number }>(db: Db, items: T[]): (T & Social)[] {
  const social = socialFor(db, items.map((m) => m.id));
  return items.map((m) => ({ ...m, ...(social.get(m.id) ?? EMPTY) }));
}

export const isReaction = (v: unknown): v is Reaction => typeof v === "string" && (REACTIONS as readonly string[]).includes(v);

export function setReaction(db: Db, mediaId: number, userId: string, emoji: Reaction, on: boolean) {
  if (on)
    db.prepare("INSERT INTO reaction (media_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").run(mediaId, userId, emoji, Date.now());
  else db.prepare("DELETE FROM reaction WHERE media_id = ? AND user_id = ? AND emoji = ?").run(mediaId, userId, emoji);
  notifyTripsChanged(db); // la photo la plus réagie peut devenir la couverture, donc changer la couleur
}

/** Légende partagée : la dernière écriture gagne ; une légende vide l'efface. */
export function setPhotoNote(db: Db, mediaId: number, userId: string, text: string) {
  const body = text.trim();
  if (!body) db.prepare("DELETE FROM media_note WHERE media_id = ?").run(mediaId);
  else
    db.prepare(
      "INSERT INTO media_note (media_id, body, author, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(media_id) DO UPDATE SET body = excluded.body, author = excluded.author, updated_at = excluded.updated_at",
    ).run(mediaId, body, userId, Date.now());
}

const FAVORITES_SQL = `
  SELECT r.media_id AS id, COUNT(*) AS n, MIN(m.taken_at) AS at
  FROM reaction r
  JOIN media_chapter mc ON mc.media_id = r.media_id
  JOIN chapter c ON c.id = mc.chapter_id
  JOIN media m ON m.id = r.media_id
  WHERE c.trip_id = ?
  GROUP BY r.media_id
  ORDER BY n DESC, at, r.media_id`;

/** Coups de cœur d'un voyage : ses photos les plus réagies, de la plus aimée à la moins aimée. */
export function tripFavorites(db: Db, tripId: number, limit = FAVORITES_MAX): number[] {
  return (db.prepare(`${FAVORITES_SQL} LIMIT ?`).all(tripId, limit) as { id: number }[]).map((r) => r.id);
}
