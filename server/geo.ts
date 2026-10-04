import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { feature } from "topojson-client";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/** Géocodage inverse 100 % hors ligne : polygones Natural Earth (world-atlas) + index GeoNames cities1000. */

export type GeoPlace = {
  countryCode: string;
  country: string;
  region: string | null;
  admin1: string | null;
  place: string | null;
};

// Index produit par scripts/build-geo-data.py : chaque lieu est [nom, lat, lon, pays, admin1, population].
type PlaceRow = [string, number, number, string, string, number];
type GeoIndex = {
  countries: Record<string, { isoNumeric: string; name: string }>;
  regions: Record<string, string>;
  places: PlaceRow[];
};

const require = createRequire(import.meta.url);
const index = JSON.parse(
  gunzipSync(readFileSync(join(import.meta.dirname, "data", "geonames-index.json.gz"))).toString("utf8"),
) as GeoIndex;

const frRegion = new Intl.DisplayNames(["fr"], { type: "region" });
export const countryName = (code: string) => {
  try {
    return frRegion.of(code) ?? code;
  } catch {
    return index.countries[code]?.name ?? code;
  }
};
/** Drapeau emoji d'un code pays ISO à 2 lettres ; null si le code est invalide (jamais d'exception). */
export const flag = (code: string | null | undefined): string | null =>
  typeof code === "string" && /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : null;

// ---------- pays : point dans polygone, avec boîtes englobantes ----------

type Country = { code: string; polygons: number[][][][]; bbox: [number, number, number, number] };

const alphaByNumeric = new Map(Object.entries(index.countries).map(([code, c]) => [c.isoNumeric.padStart(3, "0"), code]));
const topology = require("world-atlas/countries-50m.json");
const world = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>;

const countries: Country[] = [];
for (const f of world.features) {
  const code = alphaByNumeric.get(String(f.id ?? "").padStart(3, "0"));
  if (!code || !f.geometry) continue;
  const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const poly of polygons)
    for (const [x, y] of poly[0]) {
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    }
  countries.push({ code, polygons, bbox: [w, s, e, n] });
}

function inRing(ring: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countryAt(lat: number, lon: number): string | null {
  for (const c of countries) {
    const [w, s, e, n] = c.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    for (const poly of c.polygons) {
      if (inRing(poly[0], lon, lat) && !poly.slice(1).some((hole) => inRing(hole, lon, lat))) return c.code;
    }
  }
  return null;
}

// ---------- lieux : grille de 1° ----------

const grid = new Map<string, PlaceRow[]>();
for (const p of index.places) {
  const key = `${Math.floor(p[1])}:${Math.floor(p[2])}`;
  (grid.get(key) ?? grid.set(key, []).get(key)!).push(p);
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function placesNear(lat: number, lon: number, km: number): { p: PlaceRow; d: number }[] {
  const dLat = Math.ceil(km / 111);
  const dLon = Math.ceil(km / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))));
  const out: { p: PlaceRow; d: number }[] = [];
  for (let y = Math.floor(lat) - dLat; y <= Math.floor(lat) + dLat; y++)
    for (let x = Math.floor(lon) - dLon; x <= Math.floor(lon) + dLon; x++)
      for (const p of grid.get(`${y}:${x}`) ?? []) {
        const d = distanceKm(lat, lon, p[1], p[2]);
        if (d <= km) out.push({ p, d });
      }
  return out;
}

/**
 * La ville notable : population pondérée par la distance (on reste à Venise, pas à Mestre à 8 km),
 * sinon la plus proche à moins de 60 km (sommet du Teide, lac de montagne).
 */
function notablePlace(lat: number, lon: number, countryCode: string | null): PlaceRow | null {
  const near = placesNear(lat, lon, 60).filter(({ p }) => !countryCode || p[3] === countryCode);
  const score = ({ p, d }: { p: PlaceRow; d: number }) => Math.max(p[5], 1) * Math.exp(-d / 3);
  const close = near.filter(({ d }) => d <= 20);
  if (close.length) return close.sort((a, b) => score(b) - score(a))[0].p;
  return near.sort((a, b) => a.d - b.d)[0]?.p ?? null;
}

// GeoNames donne le nom anglais : on traduit les villes les plus courantes en français.
const EXONYMS: Record<string, string> = {
  Venice: "Venise", Palermo: "Palerme", Syracuse: "Syracuse", Taormina: "Taormine", Catania: "Catane",
  Genoa: "Gênes", Padua: "Padoue", Verona: "Vérone", Siena: "Sienne", Mantua: "Mantoue", Turin: "Turin",
  Lisbon: "Lisbonne", Seville: "Séville", Barcelona: "Barcelone", London: "Londres", Vienna: "Vienne",
  Copenhagen: "Copenhague", Warsaw: "Varsovie", Athens: "Athènes", Brussels: "Bruxelles", Antwerp: "Anvers",
  Ghent: "Gand", "The Hague": "La Haye", Moscow: "Moscou", Edinburgh: "Édimbourg", Krakow: "Cracovie",
  Bucharest: "Bucarest", Geneva: "Genève", "Saint Petersburg": "Saint-Pétersbourg", Beijing: "Pékin",
  Cairo: "Le Caire", Marrakesh: "Marrakech", "New York City": "New York", Florence: "Florence",
  Naples: "Naples", Milan: "Milan", Rome: "Rome", Munich: "Munich", Prague: "Prague", Cologne: "Cologne",
  Dubrovnik: "Dubrovnik", Belgrade: "Belgrade",
};
const frenchPlace = (name: string) => EXONYMS[name] ?? name;

// ---------- régions touristiques ----------

type TouristRegion = { name: string; country: string } & ({ admin1: string } | { lat: number; lon: number; km: number });
const TOURIST_REGIONS: TouristRegion[] = [
  { name: "Dolomites", country: "IT", lat: 46.47, lon: 11.95, km: 55 },
  { name: "Cinque Terre", country: "IT", lat: 44.12, lon: 9.71, km: 12 },
  { name: "Côte amalfitaine", country: "IT", lat: 40.63, lon: 14.55, km: 20 },
  { name: "Lac de Côme", country: "IT", lat: 46.0, lon: 9.26, km: 22 },
  { name: "Sicile", country: "IT", admin1: "15" },
  { name: "Sardaigne", country: "IT", admin1: "14" },
  { name: "Toscane", country: "IT", admin1: "16" },
  { name: "Pouilles", country: "IT", admin1: "13" },
  { name: "Îles Canaries", country: "ES", admin1: "53" },
  { name: "Baléares", country: "ES", admin1: "07" },
  { name: "Andalousie", country: "ES", admin1: "51" },
  { name: "Corse", country: "FR", admin1: "94" },
  { name: "Madère", country: "PT", admin1: "10" },
  { name: "Açores", country: "PT", admin1: "23" },
  { name: "Crète", country: "GR", admin1: "ESYE43" },
  { name: "Écosse", country: "GB", admin1: "SCT" },
  { name: "Bali", country: "ID", admin1: "02" },
  { name: "Hawaï", country: "US", admin1: "HI" },
];

function touristRegion(lat: number, lon: number, country: string, admin1: string | null): string | null {
  for (const r of TOURIST_REGIONS) {
    if (r.country !== country) continue;
    if ("admin1" in r ? r.admin1 === admin1 : distanceKm(lat, lon, r.lat, r.lon) <= r.km) return r.name;
  }
  return null;
}

export function reverseGeocode(lat: number, lon: number): GeoPlace | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  let code = countryAt(lat, lon);
  if (!code) {
    // En mer près d'une côte (ferry, plage) : pays de la ville la plus proche à moins de 25 km.
    const nearest = placesNear(lat, lon, 25).sort((a, b) => a.d - b.d)[0];
    if (!nearest) return null;
    code = nearest.p[3];
  }
  const p = notablePlace(lat, lon, code);
  const admin1 = p ? p[4] : null;
  return {
    countryCode: code,
    country: countryName(code),
    region: touristRegion(lat, lon, code, admin1),
    admin1: admin1 ? index.regions[`${code}.${admin1}`] ?? null : null,
    place: p ? frenchPlace(p[0]) : null,
  };
}

// ---------- recherche (envies) ----------

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export type PlaceHit = { kind: "country" | "region" | "place"; name: string; country: string; countryCode: string; lat: number; lon: number };

const biggestCity = new Map<string, PlaceRow>();
for (const p of index.places) if ((biggestCity.get(p[3])?.[5] ?? -1) < p[5]) biggestCity.set(p[3], p);
const countryHits: PlaceHit[] = countries.map((c) => {
  // Centre approximatif : la ville la plus peuplée du pays, sinon le centre de la boîte.
  const capital = biggestCity.get(c.code);
  return {
    kind: "country",
    name: countryName(c.code),
    country: countryName(c.code),
    countryCode: c.code,
    lat: capital ? capital[1] : (c.bbox[1] + c.bbox[3]) / 2,
    lon: capital ? capital[2] : (c.bbox[0] + c.bbox[2]) / 2,
  };
});
// Nom anglais des pays : l'interface anglaise cherche « Iceland », pas « Islande ». Les villes ont déjà leur nom GeoNames (anglais).
const enRegion = new Intl.DisplayNames(["en"], { type: "region" });
const englishCountry = new Map(countries.map((c) => [c.code, fold(enRegion.of(c.code) ?? c.code)]));
// Tous les lieux, du plus peuplé au plus petit : on doit trouver Sirmione ou Braies, pas seulement Rome.
const placesByPop = [...index.places].sort((a, b) => b[5] - a[5]);

// Régions touristiques comme réponses possibles (« Dolomites »), centrées sur leur cercle ou leur plus grande ville.
const regionHits: PlaceHit[] = TOURIST_REGIONS.map((r) => {
  const center =
    "admin1" in r
      ? (() => {
          const best = index.places.filter((p) => p[3] === r.country && p[4] === r.admin1).sort((a, b) => b[5] - a[5])[0];
          return best ? { lat: best[1], lon: best[2] } : { lat: 0, lon: 0 };
        })()
      : { lat: r.lat, lon: r.lon };
  return { kind: "region" as const, name: r.name, country: countryName(r.country), countryCode: r.country, ...center };
});

export function searchPlaces(q: string, limit = 8): PlaceHit[] {
  const needle = fold(q);
  if (!needle) return [];
  const out: PlaceHit[] = [
    ...regionHits.filter((r) => fold(r.name).startsWith(needle)).slice(0, 2),
    ...countryHits.filter((c) => fold(c.name).startsWith(needle) || englishCountry.get(c.countryCode)?.startsWith(needle)).slice(0, 3),
  ];
  for (const p of placesByPop) {
    if (out.length >= limit) break;
    const fr = frenchPlace(p[0]);
    if (fold(fr).startsWith(needle) || fold(p[0]).startsWith(needle))
      out.push({ kind: "place", name: fr, country: countryName(p[3]), countryCode: p[3], lat: p[1], lon: p[2] });
  }
  return out;
}

export function countriesGeoJson() {
  return {
    type: "FeatureCollection" as const,
    features: world.features
      .map((f) => ({ f, code: alphaByNumeric.get(String(f.id ?? "").padStart(3, "0")) }))
      .filter((x): x is { f: (typeof world.features)[number]; code: string } => !!x.code)
      .map(({ f, code }) => ({
        type: "Feature" as const,
        properties: { code, name: countryName(code) },
        geometry: f.geometry,
      })),
  };
}
