/**
 * Carte d'un voyage : ce qu'elle montre (villes et leurs miniatures) et quand la redessiner.
 * Fonctions pures ; le dessin est fait par components/TripMap.tsx.
 */
import type { Media } from "./api.js";
import { subStops } from "./substops.js";

/** Plafond de miniatures de villes sur la carte d'un voyage (la carte reste légère). */
export const CITY_THUMBS_CAP = 40;
/** Miniatures par ville, au plus. */
const PER_CITY = 3;

type Stop = { title: string; centerLat: number; centerLon: number };
/** Une ville d'une étape sur la carte : sa position (médiane de ses photos), son nombre de photos, 0 à 3 miniatures. */
export type CityPin = { key: string; chapter: number; place: string | null; lat: number; lon: number; count: number; thumbs: string[] };

const r5 = (n: number) => n.toFixed(5);

/**
 * Empreinte de la géométrie (route jour par jour, centres d'étapes, villes). Elle change dès qu'une position
 * change — même si la route et le nombre d'étapes restent identiques, comme quand on déplace les photos d'une
 * ville — et seulement alors : un nouveau rendu de la page ne recadre pas la carte.
 */
export function geometryKey(route: [number, number][], stops: Stop[], cities: Pick<CityPin, "lat" | "lon">[]): string {
  return [route.map(([lon, lat]) => `${r5(lon)},${r5(lat)}`).join(";"), stops.map((s) => `${r5(s.centerLon)},${r5(s.centerLat)}`).join(";"), cities.map((c) => `${r5(c.lon)},${r5(c.lat)}`).join(";")].join("|");
}

/** Empreinte des pastilles d'étape : leur numéro, leur titre (étiquette accessible), leur position, la couleur. */
export function markersKey(stops: Stop[], color: string | undefined): string {
  return JSON.stringify([color ?? null, stops.map((s) => [s.title, r5(s.centerLat), r5(s.centerLon)])]);
}

const reactionCount = (m: Media) => Object.values(m.reactions ?? {}).reduce((n, who) => n + (who?.length ?? 0), 0);

/** Indices de `n` éléments répartis régulièrement sur `len` (premier, …, dernier ; le milieu s'il n'y en a qu'un). */
const spread = (len: number, n: number) => (n === 1 ? [Math.floor((len - 1) / 2)] : Array.from({ length: n }, (_, i) => Math.round((i * (len - 1)) / (n - 1))));

/**
 * `n` miniatures d'une ville : d'abord les photos qui ont reçu des réactions (les plus réagies en tête), puis
 * des photos réparties dans le temps parmi les autres. Les photos sans miniature sont ignorées.
 */
export function pickThumbs(media: Media[], n: number): Media[] {
  const pool = media.filter((m) => m.hasThumbs);
  const liked = pool
    .map((m) => ({ m, c: reactionCount(m) }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c)
    .slice(0, n)
    .map((x) => x.m);
  const rest = pool.filter((m) => !liked.includes(m));
  const want = Math.min(n - liked.length, rest.length);
  return [...liked, ...(want > 0 ? spread(rest.length, want).map((i) => rest[i]) : [])];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Les villes du voyage (sous-étapes de chaque étape, voir substops.ts), placées à la médiane de leurs photos
 * localisées (une photo égarée ne tire pas l'épingle). Les miniatures sont distribuées en tours, des villes les
 * plus fournies aux plus petites : une chacune, puis une deuxième, puis une troisième, sans dépasser `cap`.
 */
export function cityPins(chapters: { media: Media[] }[], cap = CITY_THUMBS_CAP): CityPin[] {
  const cities = chapters.flatMap((c, chapter) =>
    subStops(c.media).flatMap((s) => {
      const pts = s.media.filter((m) => m.lat !== null && m.lon !== null);
      if (!pts.length) return [];
      return [{ key: s.key, chapter, place: s.place, lat: median(pts.map((m) => m.lat!)), lon: median(pts.map((m) => m.lon!)), count: s.media.length, media: s.media }];
    }),
  );
  const bySize = [...cities].sort((a, b) => b.count - a.count);
  const quota = new Map(cities.map((c) => [c, 0]));
  let budget = cap;
  for (let round = 1; round <= PER_CITY && budget > 0; round++)
    for (const c of bySize) {
      if (budget === 0) break;
      if (c.media.filter((m) => m.hasThumbs).length >= round) (quota.set(c, round), budget--);
    }
  return cities.map((city) => {
    const { media, ...c } = city;
    return { ...c, thumbs: pickThumbs(media, quota.get(city) ?? 0).map((m) => m.thumb) };
  });
}

/**
 * Villes à montrer avec leurs miniatures : à l'écran (marge `margin`), de la plus fournie à la plus petite,
 * en écartant celles trop proches (`minGap` px) d'une ville déjà retenue.
 */
export function declutter<T>(candidates: { item: T; x: number; y: number; weight: number }[], view: { width: number; height: number }, { minGap, margin = 40 }: { minGap: number; margin?: number }): T[] {
  const kept: { x: number; y: number }[] = [];
  const out: T[] = [];
  for (const c of [...candidates].sort((a, b) => b.weight - a.weight)) {
    if (c.x < -margin || c.x > view.width + margin || c.y < -margin || c.y > view.height + margin) continue;
    if (kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < minGap)) continue;
    kept.push(c);
    out.push(c.item);
  }
  return out;
}
