import { describe, it, expect } from "vitest";
import { pickStopPhotos, STOP_PHOTOS_MAX, type StopPhoto } from "./globe-stops.js";

const H = 3_600_000;
const T0 = Date.parse("2026-05-02T08:00:00Z");
/** Une photo paysage avec miniatures, prise `hour` heures après T0. */
const p = (id: number, hour: number, extra: Partial<StopPhoto> = {}): StopPhoto => ({
  id,
  kind: "photo",
  hasThumbs: true,
  width: 1600,
  height: 1067,
  takenAt: T0 + hour * H,
  reactions: 0,
  ...extra,
});
const portrait = { width: 1067, height: 1600 };

describe("pickStopPhotos", () => {
  it("au plus trois photos par étape", () => {
    expect(STOP_PHOTOS_MAX).toBe(3);
    expect(pickStopPhotos([])).toEqual([]);
    expect(pickStopPhotos([p(1, 0), p(2, 1)])).toEqual([1, 2]);
    expect(pickStopPhotos(Array.from({ length: 20 }, (_, i) => p(i + 1, i)))).toHaveLength(3);
  });

  it("ignore les médias sans miniature (vidéos comprises), garde une vidéo qui en a une", () => {
    const out = pickStopPhotos([
      p(1, 0, { kind: "video", hasThumbs: false }),
      p(2, 1, { hasThumbs: false }),
      p(3, 2, { kind: "video" }),
      p(4, 3),
    ]);
    expect(out.sort()).toEqual([3, 4]);
  });

  it("met d'abord les photos les plus réagies, de la plus aimée à la moins aimée", () => {
    const out = pickStopPhotos([p(1, 0), p(2, 1, { reactions: 1 }), p(3, 2), p(4, 3, { reactions: 4 }), p(5, 4, { reactions: 2 }), p(6, 5, { reactions: 1 })]);
    expect(out).toEqual([4, 5, 2]);
  });

  it("complète par des photos réparties sur la durée de l'étape (une par tranche)", () => {
    // Neuf photos, une par heure : le milieu de chaque tiers.
    const out = pickStopPhotos(Array.from({ length: 9 }, (_, i) => p(i + 1, i)));
    expect(out).toEqual([2, 5, 8]);
  });

  it("préfère une photo paysage dans chaque tranche", () => {
    // Tranche unique (une seule place libre après la photo réagie) : la photo du milieu est en portrait.
    const out = pickStopPhotos([
      p(1, 0, { reactions: 3 }),
      p(2, 1, { reactions: 2 }),
      p(3, 2, portrait),
      p(4, 3, portrait),
      p(5, 4, portrait),
      p(6, 5),
      p(7, 6, portrait),
    ]);
    expect(out).toEqual([1, 2, 6]);
  });

  it("prend une photo en portrait quand la tranche n'a rien d'autre", () => {
    expect(pickStopPhotos([p(1, 0, portrait), p(2, 1, portrait)])).toEqual([1, 2]);
  });

  it("place en dernier les photos sans date", () => {
    const out = pickStopPhotos([p(1, 0, { takenAt: null }), p(2, 1), p(3, 2), p(4, 3)]);
    expect(out).toEqual([2, 3, 4]);
  });
});
