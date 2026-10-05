import { distanceKm, reverseGeocode } from "./geo.js";
import { HOME_RADIUS_KM, type ClusterInput } from "./clustering.js";

/**
 * Lieux de vie : les endroits où l'on a vécu, ou où l'on revient souvent (une ville habitée, chez les parents).
 * Calcul pur, comme le regroupement des voyages : aucune base, aucun réseau.
 */

const DAY = 86_400_000;
/** Une période (séjour continu) se termine après plus de 21 jours sans photo sur place. */
export const PERIOD_GAP = 21 * DAY;
/** Un foyer devient un lieu de vie s'il couvre au moins 3 mois calendaires distincts (4 auparavant : une ville habitée trois mois était manquée). */
export const LIFE_PLACE_MIN_MONTHS = 3;

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
 *
 * La zone choisie est ensuite recentrée sur la médiane de ses photos, et seules les cellules à 30 km de ce centre
 * forment le foyer : sans cela, une cellule entre deux villes (un village entre deux villes voisines) couvre les
 * deux à la fois, la médiane tombe sur la plus dense et l'autre, retirée avec elle, n'est jamais un lieu de vie.
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
  const within = (lat: number, lon: number) => left.filter((o) => distanceKm(lat, lon, o.lat, o.lon) <= HOME_RADIUS_KM);
  const monthsOf = (cs: Cell[]) => new Set(cs.flatMap((o) => [...o.months])).size;
  const centerOf = (cs: Cell[]) => {
    const dots = cs.flatMap((c) => c.dots);
    return { lat: median(dots.map((d) => d.lat)), lon: median(dots.map((d) => d.lon)) };
  };

  const out: LifePlaceDraft[] = [];
  while (left.length) {
    let best: { cell: Cell; near: Cell[]; months: number; n: number } | null = null;
    for (const c of left) {
      const near = within(c.lat, c.lon);
      const months = monthsOf(near);
      const n = near.reduce((s, o) => s + o.dots.length, 0);
      if (!best || months > best.months || (months === best.months && n > best.n)) best = { cell: c, near, months, n };
    }
    if (!best || best.months < minMonths) break;
    // Recentrage : le foyer, ce sont les cellules à 30 km de la médiane (quelques passes, jusqu'à stabilité).
    let members = best.near;
    for (let pass = 0; pass < 5; pass++) {
      const { lat, lon } = centerOf(members);
      const next = within(lat, lon);
      if (!next.length || (next.length === members.length && next.every((c) => members.includes(c)))) break;
      members = next;
    }
    const months = monthsOf(members);
    if (months < minMonths) {
      // Recentré, le foyer ne tient plus : on écarte la cellule de départ, ses voisines restent candidates.
      left = left.filter((c) => c !== best.cell);
      continue;
    }
    const dots = members.flatMap((c) => c.dots).sort((a, b) => a.takenAt - b.takenAt || a.id - b.id);
    const lat = median(dots.map((d) => d.lat));
    const lon = median(dots.map((d) => d.lon));
    out.push({ lat, lon, title: placeName(lat, lon), months, mediaIds: dots.map((d) => d.id) });
    const taken = new Set(members);
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
