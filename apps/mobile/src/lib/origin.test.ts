import { describe, it, expect } from "vitest";
import { sameOrigin } from "./origin";

describe("sameOrigin", () => {
  const tower = "https://tour.tail1234.ts.net";
  it("accepte les pages de la tour", () => {
    expect(sameOrigin(tower, "https://tour.tail1234.ts.net/v/italie-2026")).toBe(true);
    expect(sameOrigin("http://192.168.1.46:8420", "http://192.168.1.46:8420/import/3")).toBe(true);
  });
  it("refuse tout autre site, même ressemblant", () => {
    expect(sameOrigin(tower, "https://www.openstreetmap.org/copyright")).toBe(false);
    expect(sameOrigin(tower, "https://tour.tail1234.ts.net.evil.com/")).toBe(false);
    expect(sameOrigin(tower, "http://tour.tail1234.ts.net/")).toBe(false);
    expect(sameOrigin("http://192.168.1.46:8420", "http://192.168.1.46:9999/")).toBe(false);
  });
  it("refuse les adresses invalides et les schémas exotiques", () => {
    expect(sameOrigin(tower, "javascript:alert(1)")).toBe(false);
    expect(sameOrigin(tower, "pas une url")).toBe(false);
  });
});
