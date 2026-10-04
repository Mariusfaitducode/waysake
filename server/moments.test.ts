import { describe, it, expect } from "vitest";
import { groupMoments, MOMENT_GAP } from "./moments.js";

const at = (iso: string) => Date.parse(`${iso}Z`);
const p = (id: number, iso: string) => ({ id, takenAt: at(iso), takenAtLocal: iso });

describe("groupMoments", () => {
  it("regroupe les photos qui se suivent, coupe après un trou de 45 min", () => {
    const days = groupMoments([
      p(1, "2026-09-06T10:00:00"), p(2, "2026-09-06T10:20:00"), p(3, "2026-09-06T11:00:00"),
      p(4, "2026-09-06T14:00:00"), p(5, "2026-09-06T14:10:00"),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].day).toBe("2026-09-06");
    expect(days[0].moments.map((m) => m.ids)).toEqual([[1, 2, 3], [4, 5]]);
    expect(days[0].ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("coupe au changement de jour, même si les photos sont proches (minuit)", () => {
    const days = groupMoments([p(1, "2026-09-06T23:50:00"), p(2, "2026-09-07T00:05:00")]);
    expect(days.map((d) => d.day)).toEqual(["2026-09-07", "2026-09-06"]);
  });

  it("trie par date, le jour le plus récent en premier, les moments dans l'ordre", () => {
    const days = groupMoments([p(3, "2026-09-07T09:00:00"), p(1, "2026-09-06T09:00:00"), p(2, "2026-09-06T08:00:00")]);
    expect(days.map((d) => d.day)).toEqual(["2026-09-07", "2026-09-06"]);
    expect(days[1].moments[0].ids).toEqual([2]);
    expect(days[1].moments[1].ids).toEqual([1]);
  });

  it("donne début et fin de chaque moment", () => {
    const [d] = groupMoments([p(1, "2026-09-06T10:12:00"), p(2, "2026-09-06T11:40:00")].map((x, i) => (i ? { ...x, takenAt: x.takenAt } : x)));
    expect(MOMENT_GAP).toBe(45 * 60_000);
    expect(d.moments[0]).toMatchObject({ start: "2026-09-06T10:12:00" });
    expect(d.moments.at(-1)).toMatchObject({ end: "2026-09-06T11:40:00" });
  });

  it("liste vide → aucun jour", () => expect(groupMoments([])).toEqual([]));
});
