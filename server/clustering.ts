import { distanceKm, type GeoPlace } from "./geo.js";

/**
 * Regroupement : photos → voyages → étapes. Fonction pure, déterministe et explicable :
 * aucune base, aucun réseau, testée sur le jeu de démo (test/demo-input.ts).
 */

export type ClusterInput = { id: number; takenAt: number | null; lat: number | null; lon: number | null; geo: GeoPlace | null };
export type Located = ClusterInput & { inferred?: boolean };
export type LatLon = { lat: number; lon: number };

export type ChapterDraft = {
  key: string;
  title: string;
  countryCodes: string[];
  places: string[];
  startAt: number;
  endAt: number;
  centerLat: number;
  centerLon: number;
  mediaIds: number[];
};

export type TripDraft = {
  title: string;
  countryCodes: string[];
  countries: string[];
  startAt: number;
  endAt: number;
  centerLat: number;
  centerLon: number;
  mediaIds: number[];
  chapters: ChapterDraft[];
  /** Un point [lon, lat] par jour, dans l'ordre. */
  route: [number, number][];
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const INFER_WINDOW = 2 * HOUR;
export const TRIP_GAP = 3 * DAY;
export const HOME_RADIUS_KM = 30;

const isPlaced = (p: Located): p is Located & { lat: number; lon: number; geo: GeoPlace } =>
  p.lat !== null && p.lon !== null && p.geo !== null;

/** Une photo sans GPS (appareil photo) prend la position de la photo géolocalisée la plus proche à ±2 h. */
export function inferLocations(items: ClusterInput[]): Located[] {
  const anchors = items.filter((p) => p.takenAt !== null && isPlaced(p)).sort((a, b) => a.takenAt! - b.takenAt!);
  return items.map((p) => {
    if (isPlaced(p) || p.takenAt === null || !anchors.length) return p;
    let lo = 0;
    let hi = anchors.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid].takenAt! < p.takenAt) lo = mid + 1;
      else hi = mid;
    }
    const best = [anchors[lo - 1], anchors[lo]]
      .filter(Boolean)
      .sort((a, b) => Math.abs(a.takenAt! - p.takenAt!) - Math.abs(b.takenAt! - p.takenAt!))[0];
    if (!best || Math.abs(best.takenAt! - p.takenAt) > INFER_WINDOW) return p;
    return { ...p, lat: best.lat, lon: best.lon, geo: best.geo, inferred: true };
  });
}

/** Domicile = la zone (≈ 30 km) où l'on a pris des photos le plus de mois différents, au moins 3. */
export function detectHome(items: ClusterInput[]): LatLon | null {
  const cells = new Map<string, { lat: number; lon: number; months: Set<string>; n: number }>();
  for (const p of items) {
    if (p.takenAt === null || p.lat === null || p.lon === null) continue;
    const key = `${Math.round(p.lat * 4)}:${Math.round(p.lon * 4)}`; // cellules de 0,25°
    const c = cells.get(key) ?? cells.set(key, { lat: 0, lon: 0, months: new Set(), n: 0 }).get(key)!;
    c.lat += p.lat;
    c.lon += p.lon;
    c.n++;
    c.months.add(new Date(p.takenAt).toISOString().slice(0, 7));
  }
  let best: { lat: number; lon: number; months: number; n: number } | null = null;
  const all = [...cells.values()].map((c) => ({ ...c, lat: c.lat / c.n, lon: c.lon / c.n }));
  for (const c of all) {
    const near = all.filter((o) => distanceKm(c.lat, c.lon, o.lat, o.lon) <= HOME_RADIUS_KM);
    const months = new Set(near.flatMap((o) => [...o.months])).size;
    const n = near.reduce((s, o) => s + o.n, 0);
    if (!best || months > best.months || (months === best.months && n > best.n)) best = { lat: c.lat, lon: c.lon, months, n };
  }
  return best && best.months >= 3 ? { lat: best.lat, lon: best.lon } : null;
}

const joinFr = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;

const unique = <T,>(xs: T[]) => [...new Set(xs)];

function mean(points: { lat: number; lon: number }[]) {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
}

type Placed = Located & { takenAt: number; lat: number; lon: number; geo: GeoPlace };

function makeChapter(photos: Placed[]): ChapterDraft {
  const first = photos[0].geo;
  const counts = new Map<string, number>();
  for (const p of photos) if (p.geo.place) counts.set(p.geo.place, (counts.get(p.geo.place) ?? 0) + 1);
  const minCount = Math.max(2, Math.ceil(photos.length * 0.08));
  const places = unique(photos.map((p) => p.geo.place)).filter(
    (name): name is string => !!name && (counts.get(name) ?? 0) >= Math.min(minCount, photos.length),
  );
  const c = mean(photos);
  return {
    key: first.region ?? first.countryCode,
    title: first.region ?? first.country,
    countryCodes: unique(photos.map((p) => p.geo.countryCode)),
    places,
    startAt: photos[0].takenAt,
    endAt: photos.at(-1)!.takenAt,
    centerLat: c.lat,
    centerLon: c.lon,
    mediaIds: photos.map((p) => p.id),
  };
}

function buildChapters(photos: Placed[]): ChapterDraft[] {
  const keyOf = (p: Placed) => p.geo.region ?? p.geo.countryCode;
  // 1. Segments consécutifs de même clé (région touristique, sinon pays).
  let segments: Placed[][] = [];
  for (const p of photos) {
    const last = segments.at(-1);
    if (last && keyOf(last[0]) === keyOf(p)) last.push(p);
    else segments.push([p]);
  }
  // 2. Les petits segments (passage, bruit GPS en bordure) rejoignent un voisin du même pays.
  const small = (s: Placed[]) => s.length < Math.max(6, photos.length * 0.04);
  let changed = true;
  while (changed && segments.length > 1) {
    changed = false;
    for (let i = 0; i < segments.length; i++) {
      if (!small(segments[i])) continue;
      const cc = segments[i][0].geo.countryCode;
      const candidates = [i - 1, i + 1].filter((j) => segments[j] && segments[j][0].geo.countryCode === cc);
      if (!candidates.length) continue;
      const j = candidates.sort((a, b) => segments[b].length - segments[a].length)[0];
      const merged = [...segments[Math.min(i, j)], ...segments[Math.max(i, j)]];
      // La clé du segment absorbant l'emporte : on réécrit la géo du petit segment.
      const winner = segments[j][0].geo;
      const fixed = merged.map((p) => (keyOf(p) === keyOf(segments[j][0]) ? p : { ...p, geo: { ...p.geo, region: winner.region } }));
      segments.splice(Math.min(i, j), 2, fixed);
      changed = true;
      break;
    }
  }
  // 3. Après fusion, deux voisins peuvent partager la même clé.
  segments = segments.reduce<Placed[][]>((acc, s) => {
    const last = acc.at(-1);
    if (last && keyOf(last[0]) === keyOf(s[0])) last.push(...s);
    else acc.push(s);
    return acc;
  }, []);
  return segments.map(makeChapter);
}

function tripTitle(photos: Placed[], chapters: ChapterDraft[]): string {
  const countries = unique(photos.map((p) => p.geo.country));
  if (countries.length > 1) return joinFr(countries); // « Italie, Slovénie & Croatie »
  if (chapters.length > 1) return joinFr(unique(chapters.map((c) => c.title)).slice(0, 3)); // « Italie & Dolomites »
  const isRegion = chapters[0].key.length > 2; // la clé d'une étape est une région touristique ou un code pays
  if (isRegion) return chapters[0].title; // « Sicile »
  // Une seule ville domine (≥ 70 %) : « Berlin » plutôt que « Allemagne ».
  const counts = new Map<string, number>();
  for (const p of photos) if (p.geo.place) counts.set(p.geo.place, (counts.get(p.geo.place) ?? 0) + 1);
  const [place, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return place && n / photos.length >= 0.7 ? place : chapters[0].title;
}

function route(photos: Placed[]): [number, number][] {
  const days = new Map<string, Placed[]>();
  for (const p of photos) {
    if (p.inferred) continue;
    const d = new Date(p.takenAt).toISOString().slice(0, 10);
    (days.get(d) ?? days.set(d, []).get(d)!).push(p);
  }
  return [...days.values()].map((ps) => {
    const c = mean(ps);
    return [c.lon, c.lat];
  });
}

function makeTrip(photos: Placed[]): TripDraft {
  const chapters = buildChapters(photos);
  const r = route(photos);
  const c = r.length ? mean(r.map(([lon, lat]) => ({ lat, lon }))) : mean(photos);
  return {
    title: tripTitle(photos, chapters),
    countryCodes: unique(photos.map((p) => p.geo.countryCode)),
    countries: unique(photos.map((p) => p.geo.country)),
    startAt: photos[0].takenAt,
    endAt: photos.at(-1)!.takenAt,
    centerLat: c.lat,
    centerLon: c.lon,
    mediaIds: photos.map((p) => p.id),
    chapters,
    route: r,
  };
}

export function clusterTrips(
  items: ClusterInput[],
  opts: { home?: LatLon | null } = {},
): { trips: TripDraft[]; home: LatLon | null; unplaced: number[] } {
  const located = inferLocations(items);
  const home = opts.home !== undefined ? opts.home : detectHome(located);
  const dated = located.filter((p) => p.takenAt !== null).sort((a, b) => a.takenAt! - b.takenAt! || a.id - b.id);

  const trips: TripDraft[] = [];
  const unplaced: number[] = [];
  let current: Placed[] = [];
  const flush = () => {
    if (current.length) trips.push(makeTrip(current));
    current = [];
  };
  for (const p of dated) {
    if (!isPlaced(p)) {
      unplaced.push(p.id);
      continue;
    }
    const q = p as Placed;
    if (home && distanceKm(home.lat, home.lon, q.lat, q.lon) <= HOME_RADIUS_KM) {
      flush(); // rentrer à la maison termine le voyage
      continue;
    }
    const last = current.at(-1);
    if (last && q.takenAt - last.takenAt > TRIP_GAP) flush();
    current.push(q);
  }
  flush();
  return { trips, home, unplaced };
}
