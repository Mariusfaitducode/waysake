import { describe, it, expect } from "vitest";
import { byYear, describeMonths, lastMonths, monthLabel, monthStatus, rangesOf, splitKnown, toggleMonth, toggleYear } from "./months";

describe("describeMonths", () => {
  const m = lastMonths(new Date(2026, 9, 4, 15, 30).getTime());
  it("mois qui se suivent : un intervalle", () => {
    expect(describeMonths([m[2], m[1]], "fr")).toBe("du 1 août au 30 septembre 2026");
  });
  it("mois épars : la liste", () => {
    expect(describeMonths([m[3], m[1]], "fr")).toBe("en juillet 2026, septembre 2026");
    expect(describeMonths([m[3], m[1]], "en")).toBe("in July 2026, September 2026");
  });
});

describe("splitKnown", () => {
  it("écarte ce que la tour reconnaît et ce que ce téléphone a déjà remis", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const r = splitKnown(items, [true, false, false], new Set(["c"]));
    expect(r.toSend.map((i) => i.id)).toEqual(["b"]);
    expect(r.already).toBe(2);
  });
});

const now = new Date(2026, 9, 4, 15, 30).getTime(); // 4 octobre 2026

describe("lastMonths", () => {
  const m = lastMonths(now);
  it("quatre années, mois par mois, du plus récent au plus ancien", () => {
    expect(m).toHaveLength(48);
    expect(m[0].key).toBe("2026-10");
    expect(m[47].key).toBe("2022-11");
  });
  it("chaque mois couvre ses journées entières ; le mois en cours s'arrête maintenant", () => {
    expect(m[0].to).toBe(now);
    const sept = m[1];
    expect(sept.from).toBe(new Date(2026, 8, 1).getTime());
    expect(sept.to).toBe(new Date(2026, 9, 1).getTime() - 1);
  });
  it("regroupe par année", () => {
    const y = byYear(m);
    expect(y.map((g) => g.year)).toEqual([2026, 2025, 2024, 2023, 2022]);
    expect(y[0].months).toHaveLength(10);
    expect(y[4].months).toHaveLength(2);
  });
  it("nomme le mois dans la langue", () => {
    expect(monthLabel(m[1], "fr")).toBe("Septembre");
    expect(monthLabel(m[1], "en")).toBe("September");
  });
});

describe("monthStatus", () => {
  it("vide, pas envoyé, partiellement, déjà envoyé", () => {
    expect(monthStatus(0, 0)).toBe("empty");
    expect(monthStatus(120, 0)).toBe("none");
    expect(monthStatus(120, 80)).toBe("partial");
    expect(monthStatus(120, 120)).toBe("sent");
  });
});

describe("sélection", () => {
  const m = lastMonths(now);
  const status = { "2026-10": "sent", "2026-09": "partial", "2026-08": "none", "2026-07": "empty" } as const;
  it("un mois se coche et se décoche ; un mois vide ne se coche pas", () => {
    let s = toggleMonth(new Set(), m[1]);
    expect([...s]).toEqual(["2026-09"]);
    s = toggleMonth(s, m[1]);
    expect(s.size).toBe(0);
    expect(toggleMonth(new Set(), m[3], "empty").size).toBe(0);
  });
  it("une année entière : les mois qui restent à envoyer, puis plus rien au second appui", () => {
    const year = byYear(m)[0].months;
    const get = (k: string) => (status as Record<string, string>)[k] ?? "unknown";
    let s = toggleYear(new Set(), year, get);
    expect(s.has("2026-10")).toBe(false); // déjà envoyé
    expect(s.has("2026-07")).toBe(false); // vide
    expect(s.has("2026-09") && s.has("2026-08") && s.has("2026-01")).toBe(true);
    s = toggleYear(s, year, get);
    expect([...s].filter((k) => k.startsWith("2026"))).toEqual([]);
  });
  it("les mois choisis deviennent des intervalles, du plus ancien au plus récent", () => {
    const r = rangesOf(new Set(["2026-09", "2026-07"]), m);
    expect(r.map((x) => x.from)).toEqual([new Date(2026, 6, 1).getTime(), new Date(2026, 8, 1).getTime()]);
  });
});
