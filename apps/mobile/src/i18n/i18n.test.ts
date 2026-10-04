import { describe, it, expect } from "vitest";
import { formatPercent, fromTag, translatorFor } from "./index";
import { fr } from "./fr";
import { en } from "./en";

describe("i18n de l'app", () => {
  it("langue du téléphone : français pour fr-*, anglais sinon", () => {
    expect(fromTag("fr-FR")).toBe("fr");
    expect(fromTag("en-US")).toBe("en");
    expect(fromTag("es-ES")).toBe("en");
  });

  it("pluriels et paramètres", () => {
    expect(translatorFor("fr")("import.failed", { count: 2, error: "x" })).toBe("2 fichiers n'ont pas pu partir (x).");
    expect(translatorFor("en")("import.failed", { count: 1, error: "x" })).toBe("1 file couldn't be sent (x).");
  });

  it("pourcentages selon la langue", () => {
    expect(formatPercent(0.42, "en")).toBe("42%");
    expect(formatPercent(0.42, "fr").replace(/\s/g, " ")).toBe("42 %");
  });

  it("mêmes paramètres dans les deux langues", () => {
    const vars = (m: unknown) => [...new Set(JSON.stringify(m).match(/\{\w+\}/g) ?? [])].filter((v) => v !== "{count}").sort().join(",");
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) expect(vars(en[key]), key).toBe(vars(fr[key]));
  });
});
