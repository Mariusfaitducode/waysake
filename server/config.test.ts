import { describe, it, expect } from "vitest";
import { setting } from "./config.js";

describe("réglages d'environnement", () => {
  it("lit le nouveau nom WAYSAKE_*", () => {
    expect(setting("PASSWORD", { WAYSAKE_PASSWORD: "neuf" })).toBe("neuf");
  });

  it("se replie sur l'ancien nom ATLAS_* (la tour l'utilise encore)", () => {
    expect(setting("PROFILES", { ATLAS_PROFILES: "Léa, Tom" })).toBe("Léa, Tom");
    expect(setting("DATA_DIR", { ATLAS_DATA_DIR: "/data" })).toBe("/data");
  });

  it("le nouveau nom l'emporte sur l'ancien", () => {
    expect(setting("PORT", { WAYSAKE_PORT: "9000", ATLAS_PORT: "8420" })).toBe("9000");
  });

  it("une valeur vide compte comme absente", () => {
    expect(setting("PASSWORD", { WAYSAKE_PASSWORD: "", ATLAS_PASSWORD: "ancien" })).toBe("ancien");
    expect(setting("PASSWORD", { WAYSAKE_PASSWORD: "", ATLAS_PASSWORD: "" })).toBeUndefined();
    expect(setting("PASSWORD", {})).toBeUndefined();
  });
});
