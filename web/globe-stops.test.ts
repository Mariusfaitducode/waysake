import { describe, it, expect } from "vitest";
import { chooseStops, orbit, STOP_PHOTOS_MIN_ZOOM, STOP_THUMBS_CAP } from "./globe-stops.js";

const view = { width: 400, height: 800 };
const stop = (id: number, n = 3) => ({ id, thumbs: Array.from({ length: n }, (_, i) => `/api/media/${id * 10 + i}/thumb`) });
const at = (id: number, x: number, y: number, n = 3) => ({ stop: stop(id, n), x, y });

describe("seuils", () => {
  it("vignettes à partir du zoom 5, 60 au plus à l'écran", () => {
    expect(STOP_PHOTOS_MIN_ZOOM).toBe(5);
    expect(STOP_THUMBS_CAP).toBe(60);
  });
});

describe("orbit", () => {
  it("place 1 à 3 vignettes en éventail au-dessus du point, sans le recouvrir", () => {
    for (const n of [1, 2, 3]) {
      const pts = orbit(n, 38);
      expect(pts).toHaveLength(n);
      for (const [x, y] of pts) {
        expect(Math.hypot(x, y)).toBeCloseTo(38, 5);
        expect(y).toBeLessThan(0); // au-dessus
      }
    }
    // Deux vignettes voisines ne se touchent pas (36 px de large).
    const three = orbit(3, 38);
    for (let i = 1; i < 3; i++) expect(Math.hypot(three[i][0] - three[i - 1][0], three[i][1] - three[i - 1][1])).toBeGreaterThanOrEqual(36);
    // Symétrique : une seule vignette est au-dessus à droite, trois sont centrées.
    expect(orbit(3, 38)[1][0]).toBeCloseTo(0, 5);
  });
});

describe("chooseStops", () => {
  it("garde les étapes à l'écran (avec une petite marge), la plus centrale d'abord", () => {
    const out = chooseStops([at(1, 390, 790), at(2, 200, 400), at(3, -100, 400), at(4, 200, 900)], view);
    expect(out.map((s) => s.stop.id)).toEqual([2, 1]);
  });

  it("écarte une étape trop proche d'une étape déjà montrée", () => {
    const out = chooseStops([at(1, 200, 400), at(2, 230, 410), at(3, 200, 520)], view);
    expect(out.map((s) => s.stop.id)).toEqual([1, 3]);
  });

  it("ne dépasse pas le plafond de vignettes", () => {
    const grid = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 12; j++) grid.push(at(i * 12 + j + 1, 30 + i * 70, 30 + j * 70));
    const out = chooseStops(grid, view, { cap: 10 });
    expect(out.reduce((n, s) => n + s.stop.thumbs.length, 0)).toBeLessThanOrEqual(10);
    expect(out).toHaveLength(3);
    expect(chooseStops(grid, view).reduce((n, s) => n + s.stop.thumbs.length, 0)).toBeLessThanOrEqual(STOP_THUMBS_CAP);
  });
});
