import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TRIP_COLORS, tripColorHex, tripStyle, safeTripColor } from "./trip-colors.js";
import { fr } from "./i18n/fr.js";

const css = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");
/** Valeurs d'un jeton dans l'ordre du fichier : [clair, sombre (média), sombre (attribut)]. */
const values = (name: string) => [...css.matchAll(new RegExp(`\\s${name}:\\s*(#[0-9a-fA-F]{6})`, "g"))].map((m) => m[1].toUpperCase());

describe("couleurs de voyage", () => {
  it("tokens.css recopie exactement la palette du serveur (clair, sombre, versions texte)", () => {
    for (const c of TRIP_COLORS) {
      expect(values(`--trip-${c.id}`), c.id).toEqual([c.light, c.dark, c.dark]);
      expect(values(`--trip-${c.id}-text`), c.id).toEqual([c.textLight, c.textDark, c.textDark]);
    }
  });

  it("chaque teinte a un nom traduit", () => {
    for (const c of TRIP_COLORS) expect(fr[`tripColor.${c.id}` as keyof typeof fr]).toBeTruthy();
  });

  it("tripStyle pose les variables du voyage, et retombe sur Ardoise pour une valeur inconnue", () => {
    expect(tripStyle("coral")).toEqual({ "--trip": "var(--trip-coral)", "--trip-text": "var(--trip-coral-text)" });
    expect(safeTripColor("vert")).toBe("slate");
    expect(safeTripColor(undefined)).toBe("slate");
  });

  it("tripColorHex donne la valeur du thème demandé", () => {
    expect(tripColorHex("azure", false)).toBe("#2F8ADC");
    expect(tripColorHex("azure", true)).toBe("#7DCBFE");
    expect(tripColorHex("amber", false, "text")).toBe("#A26202");
  });
});
