import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { analyzeCover, assignAutoColors, snapToPalette, type CoverAnalysis } from "./trip-colors.js";
import { TRIP_COLORS } from "./trip-palette.js";
import { hexToOklch } from "./color.js";

/** Image de test : bandes horizontales de couleurs unies (haut → bas), hauteurs relatives. */
async function bands(...parts: [string, number][]) {
  const total = parts.reduce((a, [, h]) => a + h, 0);
  const W = 120;
  const H = 80;
  let y = 0;
  const layers = parts.map(([color, h]) => {
    const height = Math.max(1, Math.round((h / total) * H));
    const layer = { input: { create: { width: W, height, channels: 3 as const, background: color } }, top: y, left: 0 };
    y += height;
    return layer;
  });
  return sharp({ create: { width: W, height: H, channels: 3, background: "#000" } }).composite(layers.filter((l) => l.top < H)).webp().toBuffer();
}

const analysis = (h: number, C = 0.12, share = 0.6): CoverAnalysis => ({ hue: h, chroma: C, lightness: 0.6, chromaticShare: share });

describe("analyzeCover : la couleur « vibrante » d'une couverture", () => {
  it("coucher de soleil → Corail, mer profonde → Azur, ciel gris → Ardoise", async () => {
    const sunset = await analyzeCover(await bands(["#E0785F", 3], ["#C9563F", 2], ["#2A1D1A", 2]));
    const sea = await analyzeCover(await bands(["#BFD3E0", 2], ["#1F5F8A", 3], ["#123A57", 2]));
    const grey = await analyzeCover(await bands(["#9A9A98", 3], ["#6B6C6E", 3], ["#2B2B2C", 1]));
    expect(snapToPalette(sunset!)).toBe("coral");
    expect(snapToPalette(sea!)).toBe("azure");
    expect(snapToPalette(grey!)).toBe("slate");
    expect(grey!.chromaticShare).toBeLessThan(0.08);
  });

  it("une forêt donne Mousse ou Pin, jamais une teinte éloignée", async () => {
    const forest = await analyzeCover(await bands(["#DDE6D0", 1], ["#3F7A2A", 4], ["#1D3316", 2]));
    expect(["moss", "pine"]).toContain(snapToPalette(forest!));
  });

  it("renvoie null pour un fichier illisible", async () => {
    expect(await analyzeCover(Buffer.from("pas une image"))).toBeNull();
  });
});

describe("snapToPalette", () => {
  it("arrondit chaque teinte de la palette à elle-même", () => {
    for (const c of TRIP_COLORS.filter((c) => c.id !== "slate")) {
      const [L, C, h] = hexToOklch(c.light);
      expect(snapToPalette({ hue: h, chroma: C, lightness: L, chromaticShare: 1 })).toBe(c.id);
    }
  });

  it("passe à une teinte voisine libre quand la plus proche est déjà prise", () => {
    expect(snapToPalette(analysis(240), new Map())).toBe("azure");
    const next = snapToPalette(analysis(240), new Map([["azure", 1]]));
    expect(["lagoon", "indigo"]).toContain(next);
  });

  it("garde la plus proche quand toutes les voisines sont prises (doublon inévitable)", () => {
    const used = new Map([["azure", 1], ["lagoon", 1], ["indigo", 1], ["lilac", 1]] as const);
    expect(snapToPalette(analysis(250), new Map(used))).toBe("azure");
  });
});

describe("assignAutoColors : une teinte par voyage tant que possible", () => {
  it("deux voyages bleus ne prennent pas la même teinte ; le plus ancien garde la plus proche", () => {
    const colors = assignAutoColors([
      { id: 2, startAt: 2000, manual: null, analysis: analysis(245) },
      { id: 1, startAt: 1000, manual: null, analysis: analysis(252) },
    ]);
    expect(colors.get(1)).toBe("azure");
    expect(colors.get(2)).not.toBe("azure");
  });

  it("les couleurs choisies à la main comptent comme prises", () => {
    const colors = assignAutoColors([
      { id: 1, startAt: 1000, manual: "coral", analysis: analysis(250) },
      { id: 2, startAt: 2000, manual: null, analysis: analysis(28) },
    ]);
    expect(colors.get(1)).toBe("azure"); // la couleur automatique reste calculée (pour « Automatique » dans le sélecteur)
    expect(colors.get(2)).not.toBe("coral");
  });

  it("donne une couleur stable aux voyages sans couverture analysable", () => {
    const trips = [
      { id: 1, startAt: 1000, manual: null, analysis: null },
      { id: 2, startAt: 2000, manual: null, analysis: null },
    ];
    const a = assignAutoColors(trips);
    expect(a.get(1)).toBe("slate");
    expect(a.get(2)).not.toBe("slate");
    expect(assignAutoColors([...trips].reverse())).toEqual(a);
  });

  it("s'éloigne un peu de la teinte pour rester unique, puis accepte les doublons sans partir à l'autre bout du cercle", () => {
    const trips = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, startAt: i, manual: null, analysis: analysis(250) }));
    const a = assignAutoColors(trips);
    const firstFour = [1, 2, 3, 4].map((id) => a.get(id));
    expect(new Set(firstFour).size).toBe(4);
    expect(firstFour.every((c) => ["azure", "indigo", "lagoon", "lilac"].includes(c!))).toBe(true);
    expect(["azure", "indigo"]).toContain(a.get(5));
    expect(["azure", "indigo"]).toContain(a.get(6));
    expect(a.get(5)).not.toBe(a.get(6));
  });
});
