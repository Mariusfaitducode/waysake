/**
 * Voyages de démonstration (un couple qui part de Paris).
 * Réutilisé comme jeu de test pour le regroupement automatique (jalon 2).
 */
export type DemoStop = { date: string; nights?: number; lat: number; lon: number; place: string; count: number };
export type DemoTrip = { name: string; stops: DemoStop[] };

export const HOME = { lat: 48.8566, lon: 2.3522, place: "Paris" };

export const DEMO_TRIPS: DemoTrip[] = [
  {
    name: "Amsterdam",
    stops: [{ date: "2024-04-12", nights: 3, lat: 52.3676, lon: 4.9041, place: "Amsterdam", count: 9 }],
  },
  {
    name: "Berlin",
    stops: [{ date: "2024-11-08", nights: 3, lat: 52.52, lon: 13.405, place: "Berlin", count: 9 }],
  },
  {
    name: "Îles Canaries",
    stops: [
      { date: "2025-02-15", nights: 3, lat: 28.4636, lon: -16.2518, place: "Santa Cruz de Tenerife", count: 7 },
      { date: "2025-02-18", nights: 1, lat: 28.2724, lon: -16.6425, place: "Teide", count: 10 },
      { date: "2025-02-19", nights: 2, lat: 28.0916, lon: -16.7363, place: "Los Cristianos", count: 7 },
    ],
  },
  {
    name: "Sicile",
    stops: [
      { date: "2025-05-03", nights: 2, lat: 38.1157, lon: 13.3615, place: "Palerme", count: 8 },
      { date: "2025-05-05", nights: 2, lat: 38.0388, lon: 14.0226, place: "Cefalù", count: 7 },
      { date: "2025-05-07", nights: 1, lat: 37.751, lon: 14.9934, place: "Etna", count: 6 },
      { date: "2025-05-08", nights: 2, lat: 37.8516, lon: 15.2853, place: "Taormine", count: 8 },
      { date: "2025-05-10", nights: 1, lat: 37.0755, lon: 15.2866, place: "Syracuse", count: 6 },
    ],
  },
  {
    name: "Road trip Italie · Slovénie · Croatie",
    stops: [
      { date: "2026-08-25", nights: 2, lat: 45.4375, lon: 12.3358, place: "Venise", count: 7 },
      { date: "2026-08-27", nights: 2, lat: 46.5405, lon: 12.1357, place: "Cortina d'Ampezzo", count: 7 },
      { date: "2026-08-29", nights: 1, lat: 46.6943, lon: 12.0853, place: "Lago di Braies", count: 6 },
      { date: "2026-08-30", nights: 2, lat: 46.5747, lon: 11.6714, place: "Val Gardena", count: 7 },
      { date: "2026-09-01", nights: 2, lat: 46.3683, lon: 14.1146, place: "Bled", count: 7 },
      { date: "2026-09-03", nights: 2, lat: 46.0569, lon: 14.5058, place: "Ljubljana", count: 6 },
      { date: "2026-09-05", nights: 2, lat: 45.0812, lon: 13.6387, place: "Rovinj", count: 7 },
      { date: "2026-09-07", nights: 1, lat: 44.8654, lon: 15.582, place: "Plitvice", count: 8 },
      { date: "2026-09-08", nights: 3, lat: 43.5081, lon: 16.4402, place: "Split", count: 6 },
      { date: "2026-09-11", nights: 2, lat: 43.1729, lon: 16.4411, place: "Hvar", count: 6 },
      { date: "2026-09-13", nights: 2, lat: 42.6507, lon: 18.0944, place: "Dubrovnik", count: 6 },
    ],
  },
];

/** Quelques photos prises à la maison, qui ne doivent former aucun voyage. */
export const HOME_DAYS = ["2025-03-09", "2025-10-19", "2026-06-21"];

// PRNG déterministe : mêmes graines ⇒ mêmes photos ⇒ mêmes hash ⇒ seed idempotent.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pad = (n: number) => String(n).padStart(2, "0");

export type Shot = {
  seed: string;
  /** Lieu de la prise de vue ("undated" pour les photos sans date) et rang à ce lieu : choisit la photo de démo. */
  place: string;
  index: number;
  takenAt?: string;
  lat?: number;
  lon?: number;
  who: "alex" | "sam";
  portrait: boolean;
};

/** Les photos de démo, déterministes : même graine ⇒ mêmes dates, lieux et auteurs. */
export function demoShots(seed = 42): Shot[] {
  const rand = mulberry32(seed);
  const shots: Shot[] = [];
  let n = 0;
  const perPlace = new Map<string, number>();
  const next = (place: string) => {
    const i = perPlace.get(place) ?? 0;
    perPlace.set(place, i + 1);
    return i;
  };
  const day = (date: string, nights: number, lat: number, lon: number, count: number, place: string) => {
    for (let i = 0; i < count; i++) {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Math.floor(rand() * nights));
      const h = 8 + Math.floor(rand() * 13);
      const who = rand() < 0.5 ? "alex" : "sam";
      // Sam a parfois un appareil photo, sans GPS.
      const noGps = who === "sam" && rand() < 0.12;
      const jitter = () => (rand() - 0.5) * 0.05;
      shots.push({
        seed: `atlas-${place}-${n++}`,
        place,
        index: next(place),
        takenAt: `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())} ${pad(h)}:${pad(Math.floor(rand() * 60))}:${pad(Math.floor(rand() * 60))}`,
        lat: noGps ? undefined : lat + jitter(),
        lon: noGps ? undefined : lon + jitter(),
        who,
        portrait: rand() < 0.3,
      });
    }
  };
  for (const trip of DEMO_TRIPS) for (const s of trip.stops) day(s.date, s.nights ?? 1, s.lat, s.lon, s.count, s.place);
  for (const d of HOME_DAYS) day(d, 1, HOME.lat, HOME.lon, 3, HOME.place);
  for (let i = 0; i < 3; i++) shots.push({ seed: `atlas-undated-${i}`, place: "undated", index: i, who: "alex", portrait: false });
  return shots;
}

