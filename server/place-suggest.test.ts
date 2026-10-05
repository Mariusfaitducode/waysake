import { describe, it, expect } from "vitest";
import { suggestPlaces, NEAR_WINDOW, WIDE_WINDOW, type SuggestCandidate } from "./place-suggest.js";
import type { GeoPlace } from "./geo.js";

const DAY = 86_400_000;
const T0 = Date.parse("2026-09-06T10:00:00Z");
const span = { start: T0, end: T0 + 2 * 3_600_000 };
const geo = (place: string | null, countryCode = "SI", country = "Slovénie", region: string | null = null): GeoPlace => ({ place, countryCode, country, region, admin1: null });
let n = 0;
const c = (offsetDays: number, g: GeoPlace, lat = 46.37, lon = 14.11, uploadedBy = "alex"): SuggestCandidate => ({
  takenAt: T0 + offsetDays * DAY + n++,
  lat,
  lon,
  geo: g,
  uploadedBy,
});

describe("suggestPlaces", () => {
  it("classe les lieux par proximité dans le temps : exp(-Δt / 1 jour), additionnée", () => {
    const out = suggestPlaces(span, "alex", [
      c(-2, geo("Ljubljana")), c(-2, geo("Ljubljana")), // 2 × e^-2 ≈ 0,27
      c(1, geo("Bled")), // e^-1 ≈ 0,37 (Δt mesuré depuis la fin du groupe)
      c(0, geo("Bohinj")), // dans l'intervalle : Δt = 0 → 1
    ]);
    expect(out.map((s) => s.name)).toEqual(["Bohinj", "Bled", "Ljubljana"]);
    expect(out[2]).toMatchObject({ country: "Slovénie", countryCode: "SI", flag: "🇸🇮", count: 2 });
  });

  it("au plus trois suggestions, avec la médiane des positions", () => {
    const out = suggestPlaces(span, "alex", [
      c(0, geo("A"), 1, 10), c(0, geo("A"), 2, 20), c(0, geo("A"), 9, 30),
      c(0.5, geo("B")), c(1, geo("C")), c(1.5, geo("D")),
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ name: "A", lat: 2, lon: 20, count: 3 });
    expect(out.map((s) => s.name)).not.toContain("D");
  });

  it("les photos de la même personne comptent 1,5 fois", () => {
    const out = suggestPlaces(span, "alex", [c(0, geo("Piran"), 45.5, 13.6, "sam"), c(0.3, geo("Koper"), 45.5, 13.7, "alex")]);
    // Piran : 1 ; Koper : 1,5 × e^-0,3 ≈ 1,11
    expect(out.map((s) => s.name)).toEqual(["Koper", "Piran"]);
  });

  it("sépare deux lieux de même nom dans deux pays, et se rabat sur la région, puis le pays", () => {
    const out = suggestPlaces(span, null, [
      c(0, geo("Saint-Louis", "FR", "France")), c(0, geo("Saint-Louis", "SN", "Sénégal")),
      c(0.1, geo(null, "IT", "Italie", "Dolomites")), c(0.2, { ...geo(null, "HR", "Croatie"), admin1: null }),
    ]);
    expect(out.map((s) => `${s.name}/${s.countryCode}`)).toEqual(["Saint-Louis/FR", "Saint-Louis/SN", "Dolomites/IT"]);
    expect(suggestPlaces(span, null, [c(0, { ...geo(null, "HR", "Croatie") })])[0].name).toBe("Croatie");
  });

  it("±3 jours d'abord ; élargit à ±14 jours s'il y a moins de trois lieux", () => {
    expect(NEAR_WINDOW).toBe(3 * DAY);
    expect(WIDE_WINDOW).toBe(14 * DAY);
    const near = [c(1, geo("A")), c(2, geo("B")), c(-1, geo("C"))];
    const far = c(10, geo("Loin"));
    expect(suggestPlaces(span, null, [...near, far]).map((s) => s.name)).not.toContain("Loin");
    expect(suggestPlaces(span, null, [c(1, geo("A")), far]).map((s) => s.name)).toEqual(["A", "Loin"]);
    expect(suggestPlaces(span, null, [c(20, geo("Trop loin"))])).toEqual([]);
  });

  it("ignore les photos sans lieu connu", () => {
    expect(suggestPlaces(span, null, [{ takenAt: T0, lat: 40, lon: -40, geo: null, uploadedBy: "alex" }])).toEqual([]);
  });
});
