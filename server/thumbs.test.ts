import { describe, it, expect } from "vitest";
import { assertPixelBudget, MAX_PIXELS } from "./thumbs.js";

describe("assertPixelBudget", () => {
  it("accepte une photo 48 Mpx d'iPhone", () => {
    expect(() => assertPixelBudget(8064, 6048)).not.toThrow();
  });
  it("refuse une image au-delà du budget (bombe de décompression)", () => {
    expect(() => assertPixelBudget(MAX_PIXELS, 2)).toThrow(/trop grande/);
  });
});
