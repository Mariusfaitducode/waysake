import { describe, it, expect } from "vitest";
import { justify } from "./justify.js";

describe("justify", () => {
  it("remplit exactement la largeur sur les rangées complètes", () => {
    const rows = justify([1.5, 1.5, 0.66, 1.5, 1.5, 1.5, 1.5], { width: 1000, targetHeight: 200, gap: 4 });
    for (const row of rows.slice(0, -1)) {
      const total = row.items.reduce((a, i) => a + i.width, 0) + 4 * (row.items.length - 1);
      expect(total).toBeCloseTo(1000, 0);
    }
  });

  it("garde la hauteur cible sur la dernière rangée incomplète", () => {
    const rows = justify([1.5], { width: 1000, targetHeight: 200, gap: 4 });
    expect(rows).toEqual([{ height: 200, items: [{ index: 0, width: 300 }] }]);
  });

  it("conserve l'ordre et tous les éléments", () => {
    const ratios = Array.from({ length: 23 }, (_, i) => (i % 3 === 0 ? 0.75 : 1.5));
    const rows = justify(ratios, { width: 390, targetHeight: 120, gap: 2 });
    expect(rows.flatMap((r) => r.items.map((i) => i.index))).toEqual(ratios.map((_, i) => i));
  });

  it("préfère la coupure la plus proche de la cible : deux photos hautes plutôt que trois écrasées", () => {
    // 358 px, cible 157 : un paysage et un portrait (≈ 165 px) plutôt que trois photos (≈ 97 px).
    const rows = justify([1.5, 0.66, 1.5, 1.5], { width: 358, targetHeight: 157, gap: 2 });
    expect(rows[0].items.length).toBe(2);
    expect(rows[0].height).toBeGreaterThan(140);
    expect(rows.flatMap((r) => r.items.map((i) => i.index))).toEqual([0, 1, 2, 3]);
    for (const r of rows.slice(0, -1)) {
      const total = r.items.reduce((a, i) => a + i.width, 0) + 2 * (r.items.length - 1);
      expect(total).toBeCloseTo(358, 0);
    }
  });

  it("ne produit pas de rangée démesurée pour un panorama", () => {
    const rows = justify([6, 1.5, 1.5], { width: 390, targetHeight: 120, gap: 2 });
    expect(Math.max(...rows.map((r) => r.height))).toBeLessThanOrEqual(120 * 1.5);
  });
});
