import { describe, it, expect } from "vitest";
import { clusterTrips, inferLocations, detectHome, type ClusterInput } from "./clustering.js";
import { reverseGeocode } from "./geo.js";
import { demoInput } from "../test/demo-input.js";

const H = 3_600_000;
const at = (iso: string) => Date.parse(`${iso}Z`);
const photo = (id: number, iso: string, lat: number | null, lon: number | null): ClusterInput => ({
  id, takenAt: at(iso), lat, lon, geo: lat !== null && lon !== null ? reverseGeocode(lat, lon) : null,
});

describe("clusterTrips sur les voyages de démo", () => {
  const { trips, home } = clusterTrips(demoInput());

  it("trouve les 5 voyages, du plus ancien au plus récent", () => {
    expect(trips.map((t) => t.title)).toEqual([
      "Amsterdam", "Berlin", "Îles Canaries", "Sicile", "Italie, Slovénie & Croatie",
    ]);
  });

  it("détecte le domicile à Paris et n'en fait pas un voyage", () => {
    expect(home).not.toBeNull();
    expect(Math.abs(home!.lat - 48.86)).toBeLessThan(0.2);
    const inTrips = new Set(trips.flatMap((t) => t.mediaIds));
    const parisIds = demoInput().filter((p) => p.geo?.place === "Paris").map((p) => p.id);
    expect(parisIds.length).toBeGreaterThan(0);
    expect(parisIds.some((id) => inTrips.has(id))).toBe(false);
  });

  it("découpe le road trip en Italie, Dolomites, Slovénie, Croatie", () => {
    const road = trips.at(-1)!;
    expect(road.chapters.map((c) => c.title)).toEqual(["Italie", "Dolomites", "Slovénie", "Croatie"]);
    expect(road.chapters[3].places).toEqual(expect.arrayContaining(["Rovinj", "Split", "Dubrovnik"]));
    expect(road.chapters[0].places[0]).toBe("Venise");
    expect(road.countryCodes).toEqual(["IT", "SI", "HR"]);
  });

  it("trace un itinéraire d'un point par jour, dans l'ordre", () => {
    const road = trips.at(-1)!;
    expect(road.route.length).toBeGreaterThanOrEqual(15);
    expect(road.route[0][1]).toBeCloseTo(45.44, 0); // [lon, lat] : on part de Venise
    expect(road.route.at(-1)![1]).toBeCloseTo(42.65, 0); // on finit à Dubrovnik
  });

  it("chaque photo datée et localisée hors domicile est dans exactement un voyage", () => {
    const ids = trips.flatMap((t) => t.chapters.flatMap((c) => c.mediaIds));
    expect(new Set(ids).size).toBe(ids.length);
    expect(trips.flatMap((t) => t.mediaIds).sort()).toEqual(ids.sort());
  });
});

describe("cas particuliers", () => {
  it("rattache une photo sans GPS prise 1 h après une photo géolocalisée", () => {
    const items = [photo(1, "2026-09-01T10:00:00", 46.3683, 14.1146), photo(2, "2026-09-01T11:00:00", null, null)];
    const located = inferLocations(items);
    expect(located[1]).toMatchObject({ lat: 46.3683, lon: 14.1146, inferred: true });
    expect(located[1].geo?.countryCode).toBe("SI");
  });

  it("laisse de côté une photo sans GPS trop éloignée dans le temps", () => {
    const items = [photo(1, "2026-09-01T10:00:00", 46.3683, 14.1146), photo(2, "2026-09-01T15:00:00", null, null)];
    const { trips, unplaced } = clusterTrips(items);
    expect(unplaced).toEqual([2]);
    expect(trips[0].mediaIds).toEqual([1]);
  });

  it("ignore les photos sans date", () => {
    const { trips } = clusterTrips([{ id: 9, takenAt: null, lat: 45.4, lon: 12.3, geo: reverseGeocode(45.4, 12.3) }]);
    expect(trips).toEqual([]);
  });

  it("un voyage d'une journée a un titre propre et une seule étape", () => {
    const items = [0, 1, 2].map((i) => photo(i + 1, `2025-06-01T1${i}:00:00`, 43.5081, 16.4402));
    const { trips } = clusterTrips(items, { home: null });
    expect(trips).toHaveLength(1);
    expect(trips[0].title).toBe("Split");
    expect(trips[0].chapters).toHaveLength(1);
  });

  it("sépare deux voyages espacés de plus de 3 jours", () => {
    const items = [photo(1, "2025-06-01T10:00:00", 52.52, 13.405), photo(2, "2025-06-06T10:00:00", 52.52, 13.405)];
    expect(clusterTrips(items, { home: null }).trips).toHaveLength(2);
  });

  it("detectHome exige au moins 3 mois distincts", () => {
    const twoMonths = [photo(1, "2025-01-01T10:00:00", 48.85, 2.35), photo(2, "2025-02-01T10:00:00", 48.85, 2.35)];
    expect(detectHome(twoMonths)).toBeNull();
    const three = [...twoMonths, photo(3, "2025-05-01T10:00:00", 48.86, 2.34)];
    expect(detectHome(three)).not.toBeNull();
  });

  it("le ferry en mer entre Split et Hvar reste en Croatie", () => {
    const items = [photo(1, "2025-06-01T10:00:00", 43.5081, 16.4402), photo(2, "2025-06-01T12:00:00", 43.33, 16.43)];
    const { trips } = clusterTrips(items, { home: null });
    expect(trips[0].chapters.map((c) => c.title)).toEqual(["Croatie"]);
  });
});
