import { locale, type Locale } from "./index.js";

/**
 * Les noms automatiques (voyages, étapes, lieux) sont calculés par la tour, en français :
 * « Italie, Slovénie & Croatie », « Sicile », « Venise, Italie ». En anglais, on traduit ce qu'on reconnaît
 * (pays via Intl.DisplayNames, régions touristiques et villes de la tour via une petite table) et on laisse le reste.
 * Un nom choisi par quelqu'un n'est jamais touché : voir `autoName`.
 */

// Régions touristiques et exonymes de server/geo.ts (français → anglais). Les noms identiques n'y figurent pas.
const KNOWN: Record<string, string> = {
  "Côte amalfitaine": "Amalfi Coast",
  "Lac de Côme": "Lake Como",
  Sicile: "Sicily",
  Sardaigne: "Sardinia",
  Toscane: "Tuscany",
  Pouilles: "Apulia",
  "Îles Canaries": "Canary Islands",
  Baléares: "Balearic Islands",
  Andalousie: "Andalusia",
  Corse: "Corsica",
  Madère: "Madeira",
  Açores: "Azores",
  Crète: "Crete",
  Écosse: "Scotland",
  Hawaï: "Hawaii",
  Venise: "Venice",
  Palerme: "Palermo",
  Taormine: "Taormina",
  Catane: "Catania",
  Gênes: "Genoa",
  Padoue: "Padua",
  Vérone: "Verona",
  Sienne: "Siena",
  Mantoue: "Mantua",
  Lisbonne: "Lisbon",
  Séville: "Seville",
  Barcelone: "Barcelona",
  Londres: "London",
  Vienne: "Vienna",
  Copenhague: "Copenhagen",
  Varsovie: "Warsaw",
  Athènes: "Athens",
  Bruxelles: "Brussels",
  Anvers: "Antwerp",
  Gand: "Ghent",
  "La Haye": "The Hague",
  Moscou: "Moscow",
  Édimbourg: "Edinburgh",
  Cracovie: "Krakow",
  Bucarest: "Bucharest",
  Genève: "Geneva",
  "Saint-Pétersbourg": "Saint Petersburg",
  Pékin: "Beijing",
  "Le Caire": "Cairo",
  Marrakech: "Marrakesh",
};

// Nom français d'un pays → nom dans la langue voulue, construit une fois à partir des codes ISO.
let countries: Map<string, string> | null = null;
function countryTable(l: Locale) {
  if (countries) return countries;
  countries = new Map();
  try {
    const frNames = new Intl.DisplayNames(["fr"], { type: "region" });
    const target = new Intl.DisplayNames([l === "en" ? "en-US" : "fr-FR"], { type: "region" });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = frNames.of(code);
        if (name && name !== code) countries.set(name, target.of(code) ?? name);
      }
  } catch {
    // Intl.DisplayNames absent : les noms restent ceux de la tour.
  }
  return countries;
}

/** Un nom simple : « Sicile » → « Sicily », « Italie » → « Italy ». Inconnu : inchangé. */
export function placeName(name: string, l: Locale = locale()): string {
  if (l === "fr" || !name) return name;
  return KNOWN[name] ?? countryTable(l).get(name) ?? name;
}

/** Un nom composé par la tour : « Italie, Slovénie & Croatie », « Venise, Italie ». */
export function placeTitle(title: string, l: Locale = locale()): string {
  if (l === "fr" || !title) return title;
  return title
    .split(/(, | & )/)
    .map((part, i) => (i % 2 ? part : placeName(part, l)))
    .join("");
}

/** Nom affiché d'un voyage ou d'une étape : traduit s'il est automatique, tel quel s'il a été choisi. */
export const autoName = (x: { title: string; autoTitle: string }) => (x.title === x.autoTitle ? placeTitle(x.title) : x.title);

type Named = { title: string; autoTitle: string };
type WithStops<C> = Named & { chapters: C[] };
type Stop = Named & { places: string[]; media: { place?: string | null }[] };

/** Un voyage complet, noms automatiques traduits (titres, étapes, lieux des photos). */
export function localizeTrip<C extends Stop, T extends WithStops<C>>(trip: T): T {
  if (locale() === "fr") return trip;
  return {
    ...trip,
    title: autoName(trip),
    autoTitle: placeTitle(trip.autoTitle),
    chapters: trip.chapters.map((c) => ({
      ...c,
      title: autoName(c),
      autoTitle: placeTitle(c.autoTitle),
      places: c.places.map((p) => placeName(p)),
      media: c.media.map((m) => (m.place ? { ...m, place: placeTitle(m.place) } : m)),
    })),
  };
}
