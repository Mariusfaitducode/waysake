import { describe, it, expect } from "vitest";
import { bytes, countryName, dateRange, days, monthLabel, number } from "./format.js";

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

