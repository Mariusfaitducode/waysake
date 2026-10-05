import { describe, it, expect } from "vitest";
import { detectLifePlaces, LIFE_PLACE_MIN_MONTHS, periodsOf, PERIOD_GAP } from "./lifeplaces.js";
import { clusterTrips, type ClusterInput } from "./clustering.js";
import { reverseGeocode } from "./geo.js";

const at = (iso: string) => Date.parse(`${iso}Z`);
let nextId = 1;
const photo = (iso: string, lat: number, lon: number): ClusterInput => ({ id: nextId++, takenAt: at(iso), lat, lon, geo: reverseGeocode(lat, lon) });

const PARIS = { lat: 48.8566, lon: 2.3522 };
const RENNES = { lat: 48.1173, lon: -1.6778 };
const ROME = { lat: 41.9028, lon: 12.4964 };
const ETRETAT = { lat: 49.7071, lon: 0.2042 }; // à plus de 30 km de Paris et de Rennes

/** Une photo le 10 de chaque mois indiqué (« 2024-01 »…), autour d'un lieu. */
const monthly = (months: string[], p: { lat: number; lon: number }) => months.map((m) => photo(`${m}-10T12:00:00`, p.lat + 0.01, p.lon - 0.01));

describe("detectLifePlaces", () => {
  it("trouve les foyers où l'on a pris des photos au moins 3 mois différents", () => {
    const items = [
      ...monthly(["2023-01", "2023-03", "2023-06", "2023-09", "2024-02"], PARIS),
      ...monthly(["2021-02", "2021-05", "2021-08", "2021-11"], RENNES),
    ];
    const places = detectLifePlaces(items);
    expect(places).toHaveLength(2);
    const [paris, rennes] = places;
    expect(paris.title).toBe("Paris");
    expect(paris.months).toBe(5);
    expect(Math.abs(paris.lat - PARIS.lat)).toBeLessThan(0.1);
    expect(rennes.title).toBe("Rennes");
    expect(rennes.mediaIds).toHaveLength(4);
  });

  it("deux voyages à Rome (deux mois) ne font pas un lieu de vie", () => {
    const rome = [
      ...[1, 2, 3].map((d) => photo(`2022-04-0${d}T10:00:00`, ROME.lat, ROME.lon)),
      ...[1, 2, 3].map((d) => photo(`2023-10-0${d}T10:00:00`, ROME.lat, ROME.lon)),
    ];
    expect(detectLifePlaces(rome)).toEqual([]);
  });

  it("trois voyages à Rome (trois mois distincts) font désormais un lieu de vie", () => {
    const rome = [
      ...[1, 2, 3].map((d) => photo(`2022-04-0${d}T10:00:00`, ROME.lat, ROME.lon)),
      ...[1, 2, 3].map((d) => photo(`2023-10-0${d}T10:00:00`, ROME.lat, ROME.lon)),
      ...[1, 2, 3].map((d) => photo(`2024-05-0${d}T10:00:00`, ROME.lat, ROME.lon)),
    ];
    const places = detectLifePlaces(rome);
    expect(places).toHaveLength(1);
    expect(places[0].months).toBe(3);
    expect(LIFE_PLACE_MIN_MONTHS).toBe(3);
  });

  it("le seuil est de 3 mois calendaires distincts (pas 3 photos)", () => {
    const two = [...monthly(["2024-01", "2024-02"], PARIS), photo("2024-02-20T10:00:00", PARIS.lat, PARIS.lon)];
    expect(detectLifePlaces(two)).toEqual([]);
    expect(detectLifePlaces([...two, ...monthly(["2024-07"], PARIS)])).toHaveLength(1);
  });

  it("une ville voisine d'un foyer dense (≈ 40 km) reste un lieu à part (Mulhouse et Belfort)", () => {
    // Belfort : 8 mois. Un village entre les deux (≈ 20 km de Belfort, ≈ 27 km de Mulhouse) relie les deux villes :
    // centré sur lui, un rayon de 30 km couvre Belfort ET Mulhouse, donc le plus de mois distincts.
    const BELFORT = { lat: 47.64, lon: 6.85 };
    const BETWEEN = { lat: 47.79, lon: 6.98 };
    const MULHOUSE = { lat: 47.72, lon: 7.32 };
    const items = [
      ...monthly(["2023-01", "2023-02", "2023-03", "2023-04", "2023-05", "2023-06", "2023-07", "2023-08"], BELFORT),
      ...monthly(["2023-01", "2023-01", "2023-01"], BELFORT),
      ...monthly(["2023-03", "2023-03"], BETWEEN),
      ...monthly(["2023-03", "2024-11", "2026-06", "2026-08"], MULHOUSE),
    ];
    const places = detectLifePlaces(items);
    expect(places.map((p) => p.title).sort()).toEqual(["Belfort", "Mulhouse"]);
    const mulhouse = places.find((p) => p.title === "Mulhouse")!;
    expect(mulhouse.mediaIds).toHaveLength(4);
    expect(mulhouse.months).toBe(4);
  });

  it("ignore les photos sans date ou sans lieu", () => {
    const items: ClusterInput[] = [
      ...monthly(["2024-01", "2024-02"], PARIS),
      { id: 999, takenAt: null, lat: PARIS.lat, lon: PARIS.lon, geo: reverseGeocode(PARIS.lat, PARIS.lon) },
      { id: 998, takenAt: at("2024-09-01T10:00:00"), lat: null, lon: null, geo: null },
    ];
    expect(detectLifePlaces(items)).toEqual([]);
  });
});

describe("periodsOf", () => {
  it("coupe dès qu'il y a plus de 21 jours sans photo", () => {
    const media = [
      { id: 1, takenAt: at("2024-01-01T10:00:00") },
      { id: 2, takenAt: at("2024-01-15T10:00:00") },
      { id: 3, takenAt: at("2024-02-05T10:00:00") }, // 21 jours pile : même période
      { id: 4, takenAt: at("2024-02-27T10:00:01") }, // plus de 21 jours : nouvelle période
      { id: 5, takenAt: at("2024-02-28T10:00:00") },
    ];
    const periods = periodsOf(media);
    expect(periods).toEqual([
      { startAt: media[0].takenAt, endAt: media[2].takenAt, count: 3, mediaIds: [1, 2, 3] },
      { startAt: media[3].takenAt, endAt: media[4].takenAt, count: 2, mediaIds: [4, 5] },
    ]);
    expect(PERIOD_GAP).toBe(21 * 86_400_000);
  });

  it("aucune photo, aucune période", () => {
    expect(periodsOf([])).toEqual([]);
  });
});

describe("clusterTrips avec plusieurs lieux de vie", () => {
  const paris = monthly(["2024-01", "2024-02", "2024-03", "2024-04"], PARIS);
  const rennes = monthly(["2024-05", "2024-06", "2024-07", "2024-08"], RENNES);

  it("les photos d'un lieu de vie ne font pas de voyage et sont rattachées au lieu le plus proche", () => {
    const { trips, places } = clusterTrips([...paris, ...rennes], { homes: [PARIS, RENNES] });
    expect(trips).toEqual([]);
    expect(places[0]).toEqual(paris.map((p) => p.id));
    expect(places[1]).toEqual(rennes.map((p) => p.id));
  });

  it("un week-end à plus de 30 km de tout lieu de vie reste un voyage", () => {
    const weekend = [photo("2024-03-16T10:00:00", ETRETAT.lat, ETRETAT.lon), photo("2024-03-17T10:00:00", ETRETAT.lat, ETRETAT.lon)];
    const { trips } = clusterTrips([...paris, ...weekend, ...rennes], { homes: [PARIS, RENNES] });
    expect(trips).toHaveLength(1);
    expect(trips[0].mediaIds).toEqual(weekend.map((p) => p.id));
  });

  it("rentrer dans un autre lieu de vie termine le voyage en cours", () => {
    const a = photo("2024-03-16T10:00:00", ETRETAT.lat, ETRETAT.lon);
    const home = photo("2024-03-16T18:00:00", RENNES.lat, RENNES.lon);
    const b = photo("2024-03-17T10:00:00", ETRETAT.lat, ETRETAT.lon);
    const { trips } = clusterTrips([a, home, b], { homes: [PARIS, RENNES] });
    expect(trips.map((t) => t.mediaIds)).toEqual([[a.id], [b.id]]);
  });

  it("l'option home (une seule maison) marche toujours", () => {
    const { trips, home, homes, places } = clusterTrips([...paris, ...rennes], { home: PARIS });
    expect(home).toEqual(PARIS);
    expect(homes).toEqual([PARIS]);
    expect(places[0]).toHaveLength(4);
    expect(trips).toHaveLength(4); // chaque passage à Rennes est un voyage quand seule Paris est une maison
    expect(clusterTrips(paris, { home: null }).trips).toHaveLength(4);
  });
});
