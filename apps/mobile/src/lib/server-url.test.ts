import { describe, it, expect } from "vitest";
import { normalizeServer } from "../storage-url";

describe("normalizeServer", () => {
  it("ajoute https aux noms Tailscale", () => expect(normalizeServer(" tour.tail1234.ts.net/ ")).toBe("https://tour.tail1234.ts.net"));
  it("garde http pour une IP locale avec port", () => expect(normalizeServer("192.168.1.46:8420")).toBe("http://192.168.1.46:8420"));
  it("respecte un schéma explicite", () => expect(normalizeServer("http://tour:8420")).toBe("http://tour:8420"));
});
