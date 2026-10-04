import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fromTag, translatorFor } from "./index.js";
import { placeTitle } from "./places.js";
import { fr } from "./fr.js";
import { en } from "./en.js";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("i18n", () => {
  const tFr = translatorFor("fr");
  const tEn = translatorFor("en");

  it("langue du navigateur : français pour fr-*, anglais sinon", () => {
    expect(fromTag("fr-CA")).toBe("fr");
    expect(fromTag("FR")).toBe("fr");
    expect(fromTag("en-GB")).toBe("en");
    expect(fromTag("de-DE")).toBe("en");
    expect(fromTag(undefined)).toBe("en");
  });

  it("pluriels selon la langue (0 est singulier en français)", () => {
    expect(plain(tFr("count.photos", { count: 0 }))).toBe("0 photo");
    expect(plain(tFr("count.photos", { count: 1 }))).toBe("1 photo");
    expect(plain(tFr("count.photos", { count: 1200 }))).toBe("1 200 photos");
    expect(plain(tEn("count.photos", { count: 0 }))).toBe("0 photos");
    expect(plain(tEn("count.photos", { count: 1 }))).toBe("1 photo");
    expect(plain(tEn("count.photos", { count: 1200 }))).toBe("1,200 photos");
  });

  it("noms automatiques de la tour traduits en anglais, inchangés en français", () => {
    expect(placeTitle("Italie, Slovénie & Croatie", "en")).toBe("Italy, Slovenia & Croatia");
    expect(placeTitle("Venise, Italie", "en")).toBe("Venice, Italy");
    expect(placeTitle("Îles Canaries", "en")).toBe("Canary Islands");
    expect(placeTitle("Bled", "en")).toBe("Bled");
    expect(placeTitle("Sicile", "fr")).toBe("Sicile");
  });

  it("interpolation", () => {
    expect(tFr("profile.switch", { name: "Léa" })).toBe("Léa — changer de profil");
    expect(tEn("profile.switch", { name: "Léa" })).toBe("Léa — switch profile");
  });

  it("l'app mobile utilise le même moteur (copie de core.ts, au commentaire d'en-tête près)", () => {
    const strip = (s: string) => s.replace(/\/\*\*[\s\S]*?\*\//, "");
    const web = readFileSync(join(import.meta.dirname, "core.ts"), "utf8");
    const app = readFileSync(join(import.meta.dirname, "../../apps/mobile/src/i18n/core.ts"), "utf8");
    expect(strip(app)).toBe(strip(web));
  });

  it("chaque code d'erreur renvoyé par la tour a sa traduction (api.<code>)", () => {
    const dir = join(import.meta.dirname, "../../server");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const codes = new Set(files.flatMap((f) => [...readFileSync(join(dir, f), "utf8").matchAll(/\bcode: "(\w+)"/g)].map((m) => m[1])));
    expect(codes).toContain("AUTH_REQUIRED");
    expect(codes).toContain("too_many_attempts");
    for (const code of codes) expect(`api.${code}` in fr, code).toBe(true);
    expect(tEn("api.too_many_attempts", { seconds: 10 })).toBe("Too many tries. Try again in 10s.");
  });

  it("aucun texte vide, et les mêmes paramètres dans les deux langues", () => {
    const vars = (m: unknown) => [...new Set(JSON.stringify(m).match(/\{\w+\}/g) ?? [])].filter((v) => v !== "{count}").sort().join(",");
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(JSON.stringify(en[key]).length, key).toBeGreaterThan(2);
      expect(vars(en[key]), key).toBe(vars(fr[key]));
    }
  });
});
