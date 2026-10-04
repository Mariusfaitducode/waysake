import type { Db } from "./db.js";
import { distanceKm } from "./geo.js";
import { findUnlocated } from "./routes/locate.js";
import { rebuildTrips } from "./trips.js";

/**
 * Jeu « Où était-ce ? ».
 * - Défi : des photos dont on connaît le lieu ; chacun pose une épingle, les points baissent avec la distance.
 * - Enquête : des photos sans lieu (une par moment). Le premier propose, l'autre confirme : si les deux épingles
 *   sont à moins de 25 km, le lieu proposé est enregistré sur tout le moment (location_source = 'game').
 * Pas de chrono, volontairement ; 10 photos par partie.
 */
export const ROUNDS = 10;
export const AGREE_KM = 25;
export const PROPOSE_POINTS = 300;
export const CONFIRM_POINTS = 100;
export type Mode = "defi" | "enquete";
type Point = { lat: number; lon: number };

/** 5 000 au point exact, ~1 840 à 300 km, quasi rien au-delà de 2 000 km. */
export const score = (km: number) => Math.round(5000 * Math.exp(-km / 300));
export const agree = (a: Point, b: Point) => distanceKm(a.lat, a.lon, b.lat, b.lon) < AGREE_KM;

/** Tirage sans remise de `ROUNDS` éléments au plus (Fisher-Yates partiel). */
export function pick<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  const n = Math.min(ROUNDS, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

type Round = { mediaId: number; moment: number[] };
type GuessRow = { round: number; user_id: string; lat: number; lon: number; km: number | null; points: number };
type MediaRow = { id: number; lat: number | null; lon: number | null; width: number | null; height: number | null; taken_at_local: string | null };

export class GameError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Nouvelle partie : 10 photos localisées (Défi) ou 10 moments sans lieu (Enquête). */
export function createGame(db: Db, userId: string, mode: Mode, rng = Math.random): number {
  let rounds: Round[];
  if (mode === "defi") {
    const ids = (
      db.prepare("SELECT id FROM media WHERE status = 'ready' AND excluded = 0 AND kind = 'photo' AND has_thumbs = 1 AND lat IS NOT NULL").all() as { id: number }[]
    ).map((r) => r.id);
    rounds = pick(ids, rng).map((id) => ({ mediaId: id, moment: [id] }));
  } else {
    const { days, byId } = findUnlocated(db);
    // Une photo par moment (celle du milieu) : localiser un moment éclaire toutes ses photos.
    const moments = days
      .flatMap((d) => d.moments)
      .map((m) => ({ ids: m.ids, photos: m.ids.filter((id) => byId.get(id)?.kind === "photo" && byId.get(id)?.has_thumbs === 1) }))
      .filter((m) => m.photos.length > 0);
    rounds = pick(moments, rng).map((m) => ({ mediaId: m.photos[Math.floor((m.photos.length - 1) / 2)], moment: m.ids }));
  }
  if (!rounds.length)
    throw new GameError(409, "no_photos_for_game", mode === "defi" ? "Il faut des photos avec un lieu pour un Défi." : "Toutes les photos ont déjà un lieu : rien à enquêter.");
  const { id } = db
    .prepare("INSERT INTO game (mode, created_by, created_at, rounds) VALUES (?, ?, ?, ?) RETURNING id")
    .get(mode, userId, Date.now(), JSON.stringify(rounds)) as { id: number };
  return id;
}

type Game = { id: number; mode: Mode; created_by: string; created_at: number; rounds: string };
const loadGame = (db: Db, id: number) => {
  const g = db.prepare("SELECT * FROM game WHERE id = ?").get(id) as Game | undefined;
  if (!g) throw new GameError(404, "game_not_found", "Cette partie n'existe pas (ou plus).");
  return { ...g, rounds: JSON.parse(g.rounds) as Round[] };
};
const guessesOf = (db: Db, id: number) =>
  db.prepare("SELECT round, user_id, lat, lon, km, points FROM guess WHERE game_id = ? ORDER BY created_at, user_id").all(id) as GuessRow[];

type RoundStatus = "open" | "proposed" | "agreed" | "disagreed";
function enqueteStatus(gs: GuessRow[]): RoundStatus {
  if (!gs.length) return "open";
  if (gs.length === 1) return "proposed";
  return agree(gs[0], gs[1]) ? "agreed" : "disagreed";
}

function scores(guesses: GuessRow[]) {
  const by = new Map<string, { points: number; rounds: number }>();
  for (const g of guesses) {
    const s = by.get(g.user_id) ?? { points: 0, rounds: 0 };
    by.set(g.user_id, { points: s.points + g.points, rounds: s.rounds + 1 });
  }
  return [...by.entries()].map(([userId, s]) => ({ userId, ...s })).sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
}

/** Ce que voit `userId` : en Défi, le lieu et les épingles des autres seulement après avoir posé la sienne. */
export function gameView(db: Db, id: number, userId: string) {
  const g = loadGame(db, id);
  const guesses = guessesOf(db, id);
  const media = db.prepare("SELECT id, lat, lon, width, height, taken_at_local FROM media WHERE id = ?");
  const rounds = g.rounds.map((r, index) => {
    const m = media.get(r.mediaId) as MediaRow | undefined;
    const gs = guesses.filter((x) => x.round === index);
    const mine = gs.some((x) => x.user_id === userId);
    const shown = g.mode === "enquete" || mine;
    const status: RoundStatus = g.mode === "enquete" ? enqueteStatus(gs) : mine ? "agreed" : "open";
    const answer =
      g.mode === "defi" ? (mine && m && m.lat !== null && m.lon !== null ? { lat: m.lat, lon: m.lon } : null) : status === "agreed" ? { lat: gs[0].lat, lon: gs[0].lon } : null;
    return {
      index,
      status,
      media: { id: r.mediaId, width: m?.width ?? null, height: m?.height ?? null, thumb: `/api/media/${r.mediaId}/thumb`, preview: `/api/media/${r.mediaId}/preview` },
      // En Défi, la date trahirait trop vite le voyage : on ne la montre qu'après l'épingle.
      takenAtLocal: shown ? (m?.taken_at_local ?? null) : null,
      momentSize: r.moment.length,
      answer,
      guesses: shown ? gs.map((x) => ({ userId: x.user_id, lat: x.lat, lon: x.lon, km: x.km === null ? null : Math.round(x.km * 10) / 10, points: x.points })) : [],
    };
  });
  return { id: g.id, mode: g.mode, createdBy: g.created_by, createdAt: g.created_at, rounds, scores: scores(guesses) };
}

/** Pose une épingle. Renvoie les points gagnés et, en Enquête, l'état de la manche. */
export function placeGuess(db: Db, id: number, userId: string, round: number, at: Point) {
  const g = loadGame(db, id);
  const r = g.rounds[round];
  if (!r) throw new GameError(400, "invalid_guess", "Épingle invalide.");
  const gs = guessesOf(db, id).filter((x) => x.round === round);
  if (gs.some((x) => x.user_id === userId)) throw new GameError(409, "already_guessed", "Tu as déjà posé ton épingle pour cette photo.");
  const insert = db.prepare("INSERT INTO guess (game_id, round, user_id, lat, lon, km, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

  if (g.mode === "defi") {
    const m = db.prepare("SELECT lat, lon FROM media WHERE id = ?").get(r.mediaId) as Point | undefined;
    if (!m || m.lat === null) throw new GameError(409, "media_without_place", "Cette photo n'a plus de lieu.");
    const km = distanceKm(at.lat, at.lon, m.lat, m.lon);
    const points = score(km);
    insert.run(id, round, userId, at.lat, at.lon, km, points, Date.now());
    return { status: "agreed" as RoundStatus, km: Math.round(km * 10) / 10, points, answer: m };
  }

  // Enquête : deux épingles au plus par manche (une proposition, une confirmation).
  if (gs.length >= 2) throw new GameError(409, "round_closed", "Cette photo a déjà ses deux épingles.");
  if (!gs.length) {
    insert.run(id, round, userId, at.lat, at.lon, null, 0, Date.now());
    return { status: "proposed" as RoundStatus, km: null, points: 0, answer: null };
  }
  const proposal = gs[0];
  const km = distanceKm(at.lat, at.lon, proposal.lat, proposal.lon);
  const agreed = km < AGREE_KM;
  db.transaction(() => {
    insert.run(id, round, userId, at.lat, at.lon, km, agreed ? CONFIRM_POINTS : 0, Date.now());
    if (!agreed) return;
    db.prepare("UPDATE guess SET points = ? WHERE game_id = ? AND round = ? AND user_id = ?").run(PROPOSE_POINTS, id, round, proposal.user_id);
    // Le lieu proposé, sur tout le moment ; jamais sur un lieu d'origine (GPS) ni posé à la main entre-temps.
    db.prepare(
      `UPDATE media SET lat = ?, lon = ?, geo = NULL, location_source = 'game'
       WHERE id IN (SELECT value FROM json_each(?)) AND (lat IS NULL OR location_source = 'game')`,
    ).run(proposal.lat, proposal.lon, JSON.stringify(r.moment));
  })();
  if (agreed) rebuildTrips(db);
  return { status: (agreed ? "agreed" : "disagreed") as RoundStatus, km: Math.round(km * 10) / 10, points: agreed ? CONFIRM_POINTS : 0, answer: agreed ? { lat: proposal.lat, lon: proposal.lon } : null };
}

/** Les 20 dernières parties, et le record de chacun en Défi (partie complète). */
export function listGames(db: Db, userId: string) {
  const games = db.prepare("SELECT * FROM game ORDER BY created_at DESC, id DESC LIMIT 20").all() as Game[];
  const list = games.map((g) => {
    const rounds = JSON.parse(g.rounds) as Round[];
    const guesses = guessesOf(db, g.id);
    const mine = guesses.filter((x) => x.user_id === userId).length;
    const closed = g.mode === "enquete" ? rounds.filter((_, i) => enqueteStatus(guesses.filter((x) => x.round === i)) !== "open").length : mine;
    return { id: g.id, mode: g.mode, createdBy: g.created_by, createdAt: g.created_at, rounds: rounds.length, played: closed, done: closed >= rounds.length, scores: scores(guesses) };
  });
  const records = db
    .prepare(
      `SELECT user_id AS userId, total AS points, game_id AS gameId FROM (
         SELECT gu.user_id, gu.game_id, SUM(gu.points) AS total,
                ROW_NUMBER() OVER (PARTITION BY gu.user_id ORDER BY SUM(gu.points) DESC, gu.game_id) AS rank
         FROM guess gu JOIN game g ON g.id = gu.game_id
         WHERE g.mode = 'defi'
         GROUP BY gu.user_id, gu.game_id
         HAVING COUNT(*) = json_array_length(g.rounds) -- parties complètes seulement
       ) WHERE rank = 1 ORDER BY points DESC`,
    )
    .all();
  return { games: list, records };
}
