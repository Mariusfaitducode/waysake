import { distanceKm, reverseGeocode } from "./geo.js";
import { HOME_RADIUS_KM, type ClusterInput } from "./clustering.js";

/**
 * Lieux de vie : les endroits où l'on a vécu, ou où l'on revient souvent (une ville habitée, chez les parents).
 * Calcul pur, comme le regroupement des voyages : aucune base, aucun réseau.
 */

const DAY = 86_400_000;
/** Une période (séjour continu) se termine après plus de 21 jours sans photo sur place. */
export const PERIOD_GAP = 21 * DAY;
/** Un foyer devient un lieu de vie s'il couvre au moins 4 mois calendaires distincts. */
export const LIFE_PLACE_MIN_MONTHS = 4;

export type LifePlaceDraft = {
  lat: number;
  lon: number;
  /** Nom automatique : le lieu notable le plus proche du centre, sinon la région, sinon le pays. */
  title: string;
  months: number;
  mediaIds: number[];
};

export type Period = { startAt: number; endAt: number; count: number; mediaIds: number[] };

type Dot = { id: number; takenAt: number; lat: number; lon: number };
type Cell = { lat: number; lon: number; dots: Dot[]; months: Set<string> };

const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function placeName(lat: number, lon: number): string {
  const g = reverseGeocode(lat, lon);
  return g?.place ?? g?.region ?? g?.admin1 ?? g?.country ?? "Lieu de vie";
}

/**
 * Foyers par regroupement glouton (même principe que `detectHome`, généralisé) : la zone de 30 km qui couvre le
 * plus de mois distincts, on la retire, et on recommence. Les photos sont d'abord réunies en cellules de 0,25°
 * pour rester rapide avec des dizaines de milliers de photos.
 */
export function detectLifePlaces(items: ClusterInput[], minMonths = LIFE_PLACE_MIN_MONTHS): LifePlaceDraft[] {
  const cells = new Map<string, Cell>();
  for (const p of items) {
    if (p.takenAt === null || p.lat === null || p.lon === null) continue;
    const key = `${Math.round(p.lat * 4)}:${Math.round(p.lon * 4)}`;
    const c = cells.get(key) ?? cells.set(key, { lat: 0, lon: 0, dots: [], months: new Set() }).get(key)!;
    c.dots.push({ id: p.id, takenAt: p.takenAt, lat: p.lat, lon: p.lon });
    c.months.add(monthOf(p.takenAt));
  }
  let left = [...cells.values()].map((c) => ({
    ...c,
    lat: c.dots.reduce((s, d) => s + d.lat, 0) / c.dots.length,
    lon: c.dots.reduce((s, d) => s + d.lon, 0) / c.dots.length,
  }));

  const out: LifePlaceDraft[] = [];
  while (left.length) {
    let best: { cell: Cell; near: Cell[]; months: number; n: number } | null = null;
    for (const c of left) {
      const near = left.filter((o) => distanceKm(c.lat, c.lon, o.lat, o.lon) <= HOME_RADIUS_KM);
      const months = new Set(near.flatMap((o) => [...o.months])).size;
      const n = near.reduce((s, o) => s + o.dots.length, 0);
      if (!best || months > best.months || (months === best.months && n > best.n)) best = { cell: c, near, months, n };
    }
    if (!best || best.months < minMonths) break;
    const dots = best.near.flatMap((c) => c.dots).sort((a, b) => a.takenAt - b.takenAt || a.id - b.id);
    const lat = median(dots.map((d) => d.lat));
    const lon = median(dots.map((d) => d.lon));
    out.push({ lat, lon, title: placeName(lat, lon), months: best.months, mediaIds: dots.map((d) => d.id) });
    const taken = new Set(best.near);
    left = left.filter((c) => !taken.has(c));
  }
  return out;
}

/** Découpe les photos d'un lieu (triées par date) en périodes : coupure après plus de 21 jours sans photo. */
export function periodsOf(media: { id: number; takenAt: number }[]): Period[] {
  const out: Period[] = [];
  for (const m of media) {
    const last = out.at(-1);
    if (last && m.takenAt - last.endAt <= PERIOD_GAP) {
      last.endAt = m.takenAt;
      last.count++;
      last.mediaIds.push(m.id);
    } else out.push({ startAt: m.takenAt, endAt: m.takenAt, count: 1, mediaIds: [m.id] });
  }
  return out;
}
