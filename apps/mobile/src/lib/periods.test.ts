import { describe, it, expect } from "vitest";
import { presets, customRange, describeRange } from "./periods";

const now = Date.UTC(2026, 9, 4, 1, 30); // 4 octobre 2026

describe("presets", () => {
  it("propose « depuis le dernier import » quand on en connaît la date", () => {
    const p = presets(now, Date.UTC(2026, 8, 15, 18, 0));
    expect(p[0]).toMatchObject({ key: "since-last", title: "Depuis le dernier import", from: Date.UTC(2026, 8, 15, 18, 0) + 1, to: now });
    expect(p[0].subtitle).toBe("Après le 15 septembre 2026");
  });

  it("sans import précédent, commence par les 30 derniers jours", () => {
    const p = presets(now, null);
    expect(p.map((x) => x.key)).toEqual(["last-30", "this-month", "custom"]);
    expect(p[0].from).toBe(now - 30 * 86_400_000);
  });

  it("« ce mois-ci » part du 1er du mois", () => {
    const m = presets(now, null).find((x) => x.key === "this-month")!;
    expect(new Date(m.from!).getDate()).toBe(1);
  });
});

describe("customRange", () => {
  it("couvre les journées entières, du matin du premier jour au soir du dernier", () => {
    const r = customRange(new Date(2026, 7, 25, 15), new Date(2026, 8, 15, 9));
    expect(new Date(r.from).getHours()).toBe(0);
    expect(new Date(r.to).getHours()).toBe(23);
    expect(new Date(r.to).getDate()).toBe(15);
  });
  it("remet les dates dans l'ordre", () => {
    const r = customRange(new Date(2026, 8, 15), new Date(2026, 7, 25));
    expect(r.from).toBeLessThan(r.to);
  });
});

describe("describeRange", () => {
  it("résume en français", () => {
    expect(describeRange(new Date(2026, 7, 25).getTime(), new Date(2026, 8, 15).getTime())).toBe("du 25 août au 15 septembre 2026");
  });
});
