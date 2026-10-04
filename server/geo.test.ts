import { describe, it, expect } from "vitest";
import { reverseGeocode, searchPlaces, countriesGeoJson, flag } from "./geo.js";

describe("reverseGeocode", () => {
  it("Venise → Italie, sans région touristique", () => {
    const g = reverseGeocode(45.4375, 12.3358)!;
    expect(g).toMatchObject({ countryCode: "IT", country: "Italie", region: null });
    expect(g.place).toMatch(/Venezia|Venise/);
  });

  it("Cortina et Val Gardena → Dolomites", () => {
    expect(reverseGeocode(46.5405, 12.1357)?.region).toBe("Dolomites");
    expect(reverseGeocode(46.5747, 11.6714)?.region).toBe("Dolomites");
  });

  it("Bled → Slovénie, Rovinj et Hvar → Croatie", () => {
    expect(reverseGeocode(46.3683, 14.1146)).toMatchObject({ countryCode: "SI", country: "Slovénie" });
    expect(reverseGeocode(45.0812, 13.6387)).toMatchObject({ countryCode: "HR", country: "Croatie" });
    expect(reverseGeocode(43.1729, 16.4411)).toMatchObject({ countryCode: "HR" });
  });

  it("Teide → Îles Canaries, Taormine → Sicile", () => {
    expect(reverseGeocode(28.2724, -16.6425)).toMatchObject({ countryCode: "ES", region: "Îles Canaries" });
    expect(reverseGeocode(37.8516, 15.2853)).toMatchObject({ countryCode: "IT", region: "Sicile" });
  });

  it("nomme la ville notable la plus proche", () => {
    expect(reverseGeocode(52.52, 13.405)?.place).toBe("Berlin");
    expect(reverseGeocode(43.5081, 16.4402)?.place).toBe("Split");
  });

  it("un point en mer près de la côte prend le pays voisin", () => {
    expect(reverseGeocode(43.43, 16.42)?.countryCode).toBe("HR");
  });

  it("le milieu de l'Atlantique → null", () => {
    expect(reverseGeocode(35, -40)).toBeNull();
  });

  it("coordonnées invalides → null", () => {
    expect(reverseGeocode(NaN, 2)).toBeNull();
    expect(reverseGeocode(95, 2)).toBeNull();
  });
});

describe("searchPlaces", () => {
  it("trouve une ville sans accent ni casse, la plus peuplée d'abord", () => {
    expect(searchPlaces("lisbo")[0]).toMatchObject({ countryCode: "PT" });
    expect(searchPlaces("reykjavik")[0]).toMatchObject({ countryCode: "IS" });
  });
  it("trouve un pays par son nom français", () => {
    expect(searchPlaces("japon")[0]).toMatchObject({ name: "Japon", countryCode: "JP", kind: "country" });
  });
  it("trouve aussi les petits lieux (pour localiser des photos)", () => {
    expect(searchPlaces("sirmione")[0]).toMatchObject({ countryCode: "IT" });
    expect(searchPlaces("bled").map((h) => h.countryCode)).toContain("SI");
    expect(searchPlaces("hvar").map((h) => h.countryCode)).toContain("HR");
  });
  it("propose les régions touristiques", () => {
    expect(searchPlaces("dolom")[0]).toMatchObject({ kind: "region", name: "Dolomites", countryCode: "IT" });
  });
  it("requête vide → aucun résultat", () => {
    expect(searchPlaces("  ")).toEqual([]);
  });
});

describe("pays", () => {
  it("expose les pays en GeoJSON avec code et nom français", () => {
    const fc = countriesGeoJson();
    const it = fc.features.find((f) => f.properties.code === "IT");
    expect(it?.properties.name).toBe("Italie");
  });
  it("drapeau emoji", () => {
    expect(flag("HR")).toBe("🇭🇷");
    expect(flag("hr")).toBe("🇭🇷");
  });
  it("drapeau : null pour un code invalide, sans jamais lever d'erreur", () => {
    for (const bad of ["ZZZZ", "12", "", "??", "é"]) expect(flag(bad)).toBeNull();
  });
});
