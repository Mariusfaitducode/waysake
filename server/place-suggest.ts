import { flag, type GeoPlace } from "./geo.js";

/**
 * Lieux suggérés pour un groupe de photos à localiser : les villes où l'on a déjà localisé des photos prises à peu
 * près au même moment. Calcul pur : chaque photo voisine vote pour son lieu avec un poids exp(-Δt / 1 jour), où Δt
 * est l'écart au groupe (nul dans l'intervalle), et ×1,5 si elle vient de la même personne.
 */

const DAY = 86_400_000;
/** On cherche d'abord à ±3 jours du groupe… */
export const NEAR_WINDOW = 3 * DAY;
/** …puis à ±14 jours s'il y a moins de trois lieux. */
export const WIDE_WINDOW = 14 * DAY;
export const SUGGESTION_COUNT = 3;
const SAME_PERSON_BONUS = 1.5;

export type SuggestCandidate = { takenAt: number; lat: number; lon: number; geo: GeoPlace | null; uploadedBy: string };
export type PlaceSuggestion = { name: string; country: string; countryCode: string; flag: string | null; lat: number; lon: number; count: number };

type Group = { name: string; geo: GeoPlace; score: number; lats: number[]; lons: number[] };

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const gapTo = (span: { start: number; end: number }, t: number) => (t < span.start ? span.start - t : t > span.end ? t - span.end : 0);

function groupsWithin(span: { start: number; end: number }, owner: string | null, candidates: SuggestCandidate[], window: number) {
  const groups = new Map<string, Group>();
  for (const c of candidates) {
    const gap = gapTo(span, c.takenAt);
    if (!c.geo || gap > window) continue;
    const name = c.geo.place ?? c.geo.region ?? c.geo.admin1 ?? c.geo.country;
    const key = `${c.geo.countryCode}\u0000${name}`;
    const g = groups.get(key) ?? groups.set(key, { name, geo: c.geo, score: 0, lats: [], lons: [] }).get(key)!;
    g.score += Math.exp(-gap / DAY) * (owner !== null && c.uploadedBy === owner ? SAME_PERSON_BONUS : 1);
    g.lats.push(c.lat);
    g.lons.push(c.lon);
  }
  return [...groups.values()];
}

/** `span` : premier et dernier instant du groupe ; `owner` : la personne qui a envoyé la plupart de ses photos. */
export function suggestPlaces(span: { start: number; end: number }, owner: string | null, candidates: SuggestCandidate[]): PlaceSuggestion[] {
  let groups = groupsWithin(span, owner, candidates, NEAR_WINDOW);
  if (groups.length < SUGGESTION_COUNT) groups = groupsWithin(span, owner, candidates, WIDE_WINDOW);
  return groups
    .sort((a, b) => b.score - a.score || b.lats.length - a.lats.length || a.name.localeCompare(b.name) || a.geo.countryCode.localeCompare(b.geo.countryCode))
    .slice(0, SUGGESTION_COUNT)
    .map((g) => ({
      name: g.name,
      country: g.geo.country,
      countryCode: g.geo.countryCode,
      flag: flag(g.geo.countryCode),
      lat: median(g.lats),
      lon: median(g.lons),
      count: g.lats.length,
    }));
}
