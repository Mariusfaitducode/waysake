import { describe, it, expect } from "vitest";
import { bytes, countryName, dateRange, dayRange, days, monthLabel, monthRange, number, suggestIds, yearRange } from "./format.js";

describe("bytes", () => {
  it("Mo, Go, To selon la langue", () => {
    expect(bytes(5_300_000, "fr").replace(/\s/g, " ")).toBe("5,3 Mo");
    expect(bytes(412_000_000_000, "en")).toBe("412 GB");
    expect(bytes(1_500_000_000_000, "en")).toBe("1.5 TB");
  });
});

const d = (s: string) => Date.parse(`${s}T12:00:00Z`);
// Selon la version d'ICU, Intl sépare le tiret ou les milliers par des espaces fines : on les compare comme des espaces.
const plain = (s: string) => s.replace(/[   ]/g, " ");

describe("dateRange", () => {
  it("même mois", () => expect(dateRange(d("2024-04-12"), d("2024-04-15"), "fr")).toBe("12 – 15 avril 2024"));
  it("mois différents", () => expect(dateRange(d("2026-08-25"), d("2026-09-15"), "fr")).toBe("25 août – 15 septembre 2026"));
  it("années différentes", () => expect(dateRange(d("2025-12-30"), d("2026-01-02"), "fr")).toBe("30 décembre 2025 – 2 janvier 2026"));
  it("un seul jour", () => expect(dateRange(d("2025-05-03"), d("2025-05-03"), "fr")).toBe("3 mai 2025"));
  it("nombre de jours inclusif", () => expect(days(d("2026-08-25"), d("2026-09-15"))).toBe(22));
});

describe("dateRange en anglais", () => {
  it("same month", () => expect(plain(dateRange(d("2024-04-12"), d("2024-04-15"), "en"))).toBe("April 12 – 15, 2024"));
  it("different months", () => expect(plain(dateRange(d("2026-08-25"), d("2026-09-15"), "en"))).toBe("August 25 – September 15, 2026"));
  it("different years", () => expect(plain(dateRange(d("2025-12-30"), d("2026-01-02"), "en"))).toBe("December 30, 2025 – January 2, 2026"));
  it("single day", () => expect(dateRange(d("2025-05-03"), d("2025-05-03"), "en")).toBe("May 3, 2025"));
});

describe("mois, nombres et pays selon la langue", () => {
  it("mois", () => {
    expect(monthLabel("2026-09-03T10:00:00", "fr")).toBe("Septembre 2026");
    expect(monthLabel("2026-09-03T10:00:00", "en")).toBe("September 2026");
  });
  it("nombres", () => {
    expect(plain(number(12345, "fr"))).toBe("12 345");
    expect(number(12345, "en")).toBe("12,345");
  });
  it("pays à partir du code ISO", () => {
    expect(countryName("IS", "IS", "fr")).toBe("Islande");
    expect(countryName("IS", "IS", "en")).toBe("Iceland");
    expect(countryName("de", "de", "en")).toBe("Germany");
  });
});


describe("périodes des lieux de vie", () => {
  it("« Sept. 2023 – juin 2024 », un seul mois en entier, et les années", () => {
    expect(monthRange(Date.UTC(2023, 8, 3), Date.UTC(2024, 5, 2), "fr")).toBe("Sept. 2023 – juin 2024");
    expect(monthRange(Date.UTC(2023, 8, 3), Date.UTC(2023, 8, 20), "fr")).toBe("Septembre 2023");
    expect(monthRange(Date.UTC(2023, 8, 3), Date.UTC(2024, 5, 2), "en")).toBe("Sep 2023 – Jun 2024");
    expect(yearRange(Date.UTC(2019, 1, 1), Date.UTC(2026, 1, 1))).toBe("2019 – 2026");
    expect(yearRange(Date.UTC(2024, 1, 1), Date.UTC(2024, 6, 1))).toBe("2024");
  });
});

describe("suggestIds", () => {
  it("garde tout jusqu'à 500 photos, sinon les 499 premières et la dernière (l'intervalle de temps reste entier)", () => {
    expect(suggestIds([3, 1, 2])).toEqual([3, 1, 2]);
    const many = Array.from({ length: 800 }, (_, i) => i + 1);
    const out = suggestIds(many);
    expect(out).toHaveLength(500);
    expect(out[0]).toBe(1);
    expect(out.at(-1)).toBe(800);
  });
});

describe("dayRange (sous-étapes, sans l'année)", () => {
  it("un seul jour : avec le jour de la semaine", () => expect(dayRange("2026-08-12T09:00:00", "2026-08-12T18:00:00", "fr")).toBe("Mercredi 12 août"));
  it("même mois", () => expect(dayRange("2026-08-12T09:00:00", "2026-08-14T18:00:00", "fr")).toBe("12 – 14 août"));
  it("mois différents", () => expect(dayRange("2026-08-31T09:00:00", "2026-09-02T18:00:00", "fr")).toBe("31 août – 2 septembre"));
  it("années différentes", () => expect(dayRange("2025-12-30T09:00:00", "2026-01-02T18:00:00", "fr")).toBe("30 décembre 2025 – 2 janvier 2026"));
  it("en anglais", () => {
    expect(dayRange("2026-08-12T09:00:00", "2026-08-12T18:00:00", "en")).toBe("Wednesday, August 12");
    expect(plain(dayRange("2026-08-12T09:00:00", "2026-08-14T18:00:00", "en"))).toBe("August 12 – 14");
  });
  it("date inconnue : rien", () => expect(dayRange(null, null, "fr")).toBe(""));
});
