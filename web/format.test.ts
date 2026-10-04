import { describe, it, expect } from "vitest";
import { dateRange, days } from "./format.js";

const d = (s: string) => Date.parse(`${s}T12:00:00Z`);
describe("dateRange", () => {
  it("même mois", () => expect(dateRange(d("2024-04-12"), d("2024-04-15"))).toBe("12 – 15 avril 2024"));
  it("mois différents", () => expect(dateRange(d("2026-08-25"), d("2026-09-15"))).toBe("25 août – 15 septembre 2026"));
  it("années différentes", () => expect(dateRange(d("2025-12-30"), d("2026-01-02"))).toBe("30 décembre 2025 – 2 janvier 2026"));
  it("un seul jour", () => expect(dateRange(d("2025-05-03"), d("2025-05-03"))).toBe("3 mai 2025"));
  it("nombre de jours inclusif", () => expect(days(d("2026-08-25"), d("2026-09-15"))).toBe(22));
});
