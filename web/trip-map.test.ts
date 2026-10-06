import { describe, it, expect } from "vitest";
import type { Media } from "./api.js";
import { cityPins, declutter, geometryKey, markersKey, pickThumbs, CITY_THUMBS_CAP } from "./trip-map.js";

let next = 1;
/** Une photo dans la ville donnée, une heure après la précédente. */
function photo(place: string | null, lat: number | null = 45, lon: number | null = 12, extra: Partial<Media> = {}): Media {
  const id = next++;
  return {
    id,
    kind: "photo",
    width: 4,
    height: 3,
    takenAt: id * 3_600_000,
    takenAtLocal: `2026-08-12T${String(id % 24).padStart(2, "0")}:00:00`,
    lat: place ? lat : null,
    lon: place ? lon : null,
    locationSource: place ? "manual" : null,
    uploadedBy: "marius",
    hasThumbs: true,
    place,
    thumb: `/api/media/${id}/thumb`,
    preview: "",
    original: "",
    ...extra,
  };
}

const route: [number, number][] = [
  [13.7, 45.6],
  [14.5, 46.0],
];
const stop = (title: string, lat: number, lon: number) => ({ title, centerLat: lat, centerLon: lon });

describe("geometryKey — la carte se recadre quand l'itinéraire change", () => {
  it("est stable pour les mêmes positions (un nouveau rendu ne recadre pas)", () => {
    const a = geometryKey(route, [stop("Trieste", 45.6, 13.7)], []);
    const b = geometryKey(route.map((p) => [...p] as [number, number]), [stop("Trieste", 45.6, 13.7)], []);
    expect(a).toBe(b);
  });

  it("change quand le centre d'une étape bouge, même si la route et le nombre d'étapes sont identiques (bug Venise)", () => {
    const before = geometryKey(route, [stop("Trieste", 45.6, 13.7), stop("Ljubljana", 46.0, 14.5)], []);
    const after = geometryKey(route, [stop("Venise", 45.44, 12.33), stop("Ljubljana", 46.0, 14.5)], []);
    expect(after).not.toBe(before);
  });

  it("change quand une ville se déplace", () => {
    const city = (lat: number, lon: number) => ({ key: "1-x", chapter: 0, place: "x", lat, lon, count: 3, thumbs: [] });
    expect(geometryKey(route, [], [city(45.6, 13.7)])).not.toBe(geometryKey(route, [], [city(45.44, 12.33)]));
  });

  it("ignore les titres (renommer une étape ne recadre pas)", () => {
    expect(geometryKey(route, [stop("A", 45, 12)], [])).toBe(geometryKey(route, [stop("B", 45, 12)], []));
  });
});

describe("markersKey — les pastilles sont redessinées quand ce qu'elles montrent change", () => {
  it("change avec un titre, une position ou la couleur", () => {
    const base = markersKey([stop("A", 45, 12)], "coral");
    expect(markersKey([stop("A", 45, 12)], "coral")).toBe(base);
    expect(markersKey([stop("B", 45, 12)], "coral")).not.toBe(base);
    expect(markersKey([stop("A", 45.1, 12)], "coral")).not.toBe(base);
    expect(markersKey([stop("A", 45, 12)], "azure")).not.toBe(base);
  });
});

describe("pickThumbs", () => {
  it("préfère les photos qui ont reçu des réactions, les plus réagies d'abord", () => {
    const a = photo("x");
    const b = photo("x", 45, 12, { reactions: { "❤️": ["marius"] } });
    const c = photo("x");
    const d = photo("x", 45, 12, { reactions: { "❤️": ["marius", "lea"], "😂": ["lea"] } });
    expect(pickThumbs([a, b, c, d], 2).map((m) => m.id)).toEqual([d.id, b.id]);
  });

  it("sans réaction, répartit dans le temps (première, milieu, dernière)", () => {
    const ms = Array.from({ length: 9 }, () => photo("x"));
    expect(pickThumbs(ms, 3).map((m) => m.id)).toEqual([ms[0].id, ms[4].id, ms[8].id]);
  });

  it("complète les photos réagies par des photos réparties, sans doublon, dans l'ordre du temps pour celles-ci", () => {
    const ms = Array.from({ length: 5 }, () => photo("x"));
    ms[2] = { ...ms[2], reactions: { "🤩": ["lea"] } };
    const ids = pickThumbs(ms, 3).map((m) => m.id);
    expect(ids[0]).toBe(ms[2].id);
    expect(new Set(ids).size).toBe(3);
  });

  it("ignore les photos sans miniature", () => {
    const a = photo("x", 45, 12, { hasThumbs: false });
    const b = photo("x");
    expect(pickThumbs([a, b], 3).map((m) => m.id)).toEqual([b.id]);
  });
});

describe("cityPins", () => {
  it("une épingle par ville, à la médiane de ses photos localisées", () => {
    const venice = [photo("Venise", 45.43, 12.3), photo("Venise", 45.44, 12.33), photo("Venise", 45.9, 13.9), photo(null)];
    const pins = cityPins([{ media: venice }]);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ chapter: 0, place: "Venise", lat: 45.44, lon: 12.33, count: 4 });
  });

  it("garde l'index de l'étape et la clé de la sous-étape (pour y défiler)", () => {
    const pins = cityPins([{ media: [photo("Trieste", 45.6, 13.7)] }, { media: [photo("Pula", 44.8, 13.8), photo("Rovinj", 45.08, 13.6)] }]);
    expect(pins.map((p) => [p.chapter, p.place])).toEqual([
      [0, "Trieste"],
      [1, "Pula"],
      [1, "Rovinj"],
    ]);
    expect(pins[1].key).toMatch(/-Pula$/);
  });

  it("ignore une ville sans aucune photo localisée", () => {
    expect(cityPins([{ media: [photo(null), photo(null)] }])).toEqual([]);
  });

  it("1 à 3 miniatures par ville et pas plus de CITY_THUMBS_CAP en tout, les grandes villes d'abord", () => {
    const chapters = Array.from({ length: 30 }, (_, i) => ({ media: Array.from({ length: i + 1 }, () => photo(`Ville ${i}`, 40 + i * 0.1, 10)) }));
    const pins = cityPins(chapters);
    const total = pins.reduce((n, p) => n + p.thumbs.length, 0);
    expect(total).toBeLessThanOrEqual(CITY_THUMBS_CAP);
    for (const p of pins) {
      expect(p.thumbs.length).toBeGreaterThanOrEqual(1);
      expect(p.thumbs.length).toBeLessThanOrEqual(3);
    }
    // La plus grande ville (30 photos) a bien ses vignettes.
    expect(pins.find((p) => p.place === "Ville 29")?.thumbs.length).toBeGreaterThan(0);
  });
});

describe("declutter", () => {
  const view = { width: 400, height: 300 };
  it("écarte une ville trop proche d'une ville plus fournie déjà montrée", () => {
    const keep = declutter(
      [
        { item: "petite", x: 100, y: 100, weight: 2 },
        { item: "grande", x: 130, y: 110, weight: 20 },
        { item: "loin", x: 300, y: 200, weight: 1 },
      ],
      view,
      { minGap: 80 },
    );
    expect(keep).toEqual(["grande", "loin"]);
  });

  it("ignore les villes hors de l'écran", () => {
    expect(declutter([{ item: "dehors", x: -200, y: 50, weight: 5 }], view, { minGap: 80 })).toEqual([]);
  });
});
