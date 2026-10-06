import type { Db } from "./db.js";
import { mediaUrls } from "./routes/media.js";
import { isTripColorId, NEUTRAL_TRIP_COLOR, type TripColorId } from "./trip-palette.js";

/** Nombre de vignettes au plus autour d'une étape sur le globe. */
export const STOP_PHOTOS_MAX = 3;

/** Ce qu'il faut savoir d'un média d'une étape pour choisir ses vignettes. */
export type StopPhoto = {
  id: number;
  kind: "photo" | "video";
  hasThumbs: boolean;
  width: number | null;
  height: number | null;
  takenAt: number | null;
  /** Nombre de réactions reçues (toutes personnes et tous emojis confondus). */
  reactions: number;
};

const landscape = (m: StopPhoto) => !!m.width && !!m.height && m.width > m.height;

/**
 * Vignettes d'une étape (identifiants, au plus `max`) : d'abord les photos les plus réagies, puis des photos
 * réparties sur la durée de l'étape (une par tranche chronologique, la plus proche du milieu de sa tranche,
 * en paysage de préférence). Les médias sans miniature (vidéos non converties…) ne comptent pas ; les photos
 * sans date ne servent qu'à compléter.
 */
export function pickStopPhotos(media: StopPhoto[], max = STOP_PHOTOS_MAX): number[] {
  const usable = media.filter((m) => m.hasThumbs);
  const byTime = (a: StopPhoto, b: StopPhoto) => (a.takenAt ?? Infinity) - (b.takenAt ?? Infinity) || a.id - b.id;

  const picked = usable
    .filter((m) => m.reactions > 0)
    .sort((a, b) => b.reactions - a.reactions || byTime(a, b))
    .slice(0, max);
  const k = max - picked.length;
  const taken = new Set(picked.map((m) => m.id));
  const rest = usable.filter((m) => !taken.has(m.id)).sort(byTime);
  const dated = rest.filter((m) => m.takenAt !== null);
  const pool = dated.length >= k ? dated : rest;
  if (k <= 0) return picked.map((m) => m.id);
  if (pool.length <= k) return [...picked, ...pool].map((m) => m.id);

  for (let i = 0; i < k; i++) {
    const from = Math.floor((i * pool.length) / k);
    const to = Math.floor(((i + 1) * pool.length) / k);
    const mid = from + Math.floor((to - from - 1) / 2);
    let best = mid;
    for (let j = from; j < to; j++) {
      if (!landscape(pool[j])) continue;
      if (!landscape(pool[best]) || Math.abs(j - mid) < Math.abs(best - mid)) best = j;
    }
    picked.push(pool[best]);
  }
  return picked.map((m) => m.id);
}

/** Une étape d'un voyage telle que le globe la montre de près. */
export type GlobeStop = {
  tripSlug: string;
  color: TripColorId;
  chapterId: number;
  title: string;
  lat: number;
  lon: number;
  /** URL des miniatures (1 à 3). */
  thumbs: string[];
};

/** Toutes les étapes de tous les voyages, avec leurs vignettes ; les étapes sans miniature sont omises. */
export function globeStops(db: Db): GlobeStop[] {
  const reactions = new Map(
    (db.prepare("SELECT media_id AS id, COUNT(*) AS n FROM reaction GROUP BY media_id").all() as { id: number; n: number }[]).map((r) => [r.id, r.n]),
  );
  const byChapter = new Map<number, StopPhoto[]>();
  const rows = db
    .prepare(
      `SELECT mc.chapter_id AS chapterId, m.id, m.kind, m.has_thumbs AS hasThumbs, m.width, m.height, m.taken_at AS takenAt
       FROM media_chapter mc JOIN media m ON m.id = mc.media_id WHERE m.status = 'ready'`,
    )
    .all() as { chapterId: number; id: number; kind: "photo" | "video"; hasThumbs: number; width: number | null; height: number | null; takenAt: number | null }[];
  for (const r of rows) {
    const list = byChapter.get(r.chapterId) ?? byChapter.set(r.chapterId, []).get(r.chapterId)!;
    list.push({ id: r.id, kind: r.kind, hasThumbs: r.hasThumbs === 1, width: r.width, height: r.height, takenAt: r.takenAt, reactions: reactions.get(r.id) ?? 0 });
  }
  const chapters = db
    .prepare(
      `SELECT c.id, coalesce(c.custom_title, c.title) AS title, c.center_lat AS lat, c.center_lon AS lon, t.slug, t.color, t.auto_color AS autoColor
       FROM chapter c JOIN trip t ON t.id = c.trip_id ORDER BY t.start_at DESC, c.sort`,
    )
    .all() as { id: number; title: string; lat: number | null; lon: number | null; slug: string; color: string | null; autoColor: string | null }[];
  const out: GlobeStop[] = [];
  for (const c of chapters) {
    if (c.lat === null || c.lon === null) continue;
    const ids = pickStopPhotos(byChapter.get(c.id) ?? []);
    if (ids.length === 0) continue;
    const color = isTripColorId(c.color) ? c.color : isTripColorId(c.autoColor) ? c.autoColor : NEUTRAL_TRIP_COLOR;
    out.push({ tripSlug: c.slug, color, chapterId: c.id, title: c.title, lat: c.lat, lon: c.lon, thumbs: ids.map((id) => mediaUrls(id).thumb) });
  }
  return out;
}
