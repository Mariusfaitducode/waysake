import { describe, it, expect } from "vitest";
import { cluster, kmForPixels } from "./cluster.js";

const amsterdam = { id: "ams", lat: 52.37, lon: 4.9 };
const berlin = { id: "ber", lat: 52.52, lon: 13.4 };
const road = { id: "road", lat: 45.5, lon: 14.5 };

describe("cluster", () => {
  it("regroupe Amsterdam et Berlin vus de loin", () => {
    const groups = cluster([road, amsterdam, berlin], kmForPixels(56, 1));
    expect(groups.length).toBeLessThan(3);
  });
  it("les sépare une fois zoomé sur l'Europe", () => {
    expect(cluster([road, amsterdam, berlin], kmForPixels(56, 5)).map((g) => g.map((p) => p.id))).toEqual([["road"], ["ams"], ["ber"]]);
  });
  it("le premier point représente le groupe", () => {
    expect(cluster([berlin, amsterdam], 1000)[0][0].id).toBe("ber");
  });
});
