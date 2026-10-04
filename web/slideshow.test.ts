import { describe, it, expect } from "vitest";
import { slideshowPlan, SHORT_PER_CHAPTER, routeSvg } from "./slideshow.js";

const media = (id: number) => ({ id, kind: "photo" as const });
const chapter = (index: number, ids: number[]) => ({ id: index, title: `Étape ${index}`, media: ids.map(media) });
const trip = (chapters: ReturnType<typeof chapter>[], favorites: number[] = []) => ({ chapters, favorites });
const shape = (plan: ReturnType<typeof slideshowPlan>) => plan.map((s) => (s.kind === "sign" ? `#${s.chapter}` : s.media.id));

describe("diaporama", () => {
  it("version complète : un panneau avant chaque étape, puis toutes ses photos", () => {
    expect(shape(slideshowPlan(trip([chapter(0, [1, 2]), chapter(1, [3])]), { short: false }))).toEqual(["#0", 1, 2, "#1", 3]);
  });

  it("saute les étapes sans photo", () => {
    expect(shape(slideshowPlan(trip([chapter(0, []), chapter(1, [3])]), { short: false }))).toEqual(["#1", 3]);
  });

  it("version courte : les coups de cœur d'abord, complétés à intervalles réguliers, dans l'ordre du voyage", () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const plan = slideshowPlan(trip([chapter(0, ids)], [25, 3]), { short: true });
    const photos = shape(plan).slice(1) as number[];
    expect(photos).toHaveLength(SHORT_PER_CHAPTER);
    expect(photos).toContain(25);
    expect(photos).toContain(3);
    expect([...photos].sort((a, b) => a - b)).toEqual(photos);
    expect(new Set(photos).size).toBe(photos.length);
  });

  it("version courte : une petite étape garde toutes ses photos", () => {
    expect(shape(slideshowPlan(trip([chapter(0, [1, 2, 3])]), { short: true }))).toEqual(["#0", 1, 2, 3]);
  });
});

describe("mini-carte du diaporama", () => {
  it("projette l'itinéraire et les étapes dans le cadre", () => {
    const r = routeSvg([[12.3, 45.4], [14.1, 46.4], [16.4, 43.5]], [[12.3, 45.4], [16.4, 43.5]], 200, 120);
    expect(r.path.startsWith("M")).toBe(true);
    expect(r.points).toHaveLength(2);
    for (const [x, y] of r.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(200);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(120);
    }
  });
});
