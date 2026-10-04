import { describe, it, expect } from "vitest";
import { createRateMeter, diskWarning, etaSeconds, formatBytes, formatDuration, forecastText, sizeOf } from "./estimate";

const nb = (s: string) => s.replace(/\s/g, " ");

describe("formatBytes", () => {
  it("Mo, Go, To selon la langue", () => {
    expect(nb(formatBytes(5_300_000, "fr"))).toBe("5,3 Mo");
    expect(nb(formatBytes(12_400_000_000, "fr"))).toBe("12 Go");
    expect(formatBytes(12_400_000_000, "en")).toBe("12 GB");
    expect(formatBytes(2_000_000_000_000, "en")).toBe("2 TB");
    expect(formatBytes(0, "en")).toBe("0 MB");
    expect(formatBytes(36_264, "fr")).toBe("36 Ko"); // jamais « 0 Mo » pour deux petites photos
  });
});

describe("formatDuration", () => {
  it("arrondi lisible", () => {
    expect(formatDuration(20, "fr")).toBe("moins d'une minute");
    expect(formatDuration(600, "fr")).toBe("10 minutes");
    expect(formatDuration(3600 * 2 + 60 * 15, "fr")).toBe("2 h 15 min");
    expect(formatDuration(3600 * 30, "en")).toBe("30 h 0 min");
    expect(formatDuration(60, "en")).toBe("1 minute");
  });
});

describe("estimations", () => {
  it("temps restant au débit donné", () => {
    expect(etaSeconds(100e6, 1e6)).toBe(100);
    expect(etaSeconds(0, 1e6)).toBe(0);
  });
  it("taille d'une sélection : taille réelle, sinon moyenne de la tour pour ce type", () => {
    const avg = { photo: 3e6, video: 50e6 };
    expect(sizeOf([{ size: 1e6, mediaType: "photo" }, { size: null, mediaType: "photo" }, { size: null, mediaType: "video" }], avg)).toBe(54e6);
  });
  it("alerte quand la sélection ne tient pas sur le disque (avec 1 Go de marge)", () => {
    expect(diskWarning(10e9, 50e9)).toBe(null);
    expect(diskWarning(49.5e9, 50e9)).toBe("tight");
    expect(diskWarning(60e9, 50e9)).toBe("full");
  });
});

describe("prévision d'espace", () => {
  const now = new Date(2026, 9, 4).getTime();
  it("dit pour combien de mois il reste de la place, et quand prévoir un disque", () => {
    expect(nb(forecastText({ months: 18, fullAt: new Date(2028, 3, 10).getTime() }, 2e9, "fr")!)).toBe(
      "Au rythme actuel (2 Go par mois), il reste de la place pour environ 18 mois de photos : il faudra un disque supplémentaire vers avril 2028.",
    );
    expect(forecastText({ months: 300, fullAt: now + 300 * 30 * 86400e3 }, 1e9, "en")).toBe(
      "At the current pace (1 GB a month), there's room for more than 10 years of photos.",
    );
    expect(forecastText({ months: null, fullAt: null }, 0, "fr")).toBe(null);
  });
});

describe("mesure du débit pendant l'envoi", () => {
  it("débit réel sur le temps écoulé, prudent tant que la mesure est trop courte", () => {
    let t = 0;
    const m = createRateMeter(2e6, () => t);
    expect(m.rate()).toBe(2e6); // rien de mesuré : valeur connue
    t = 2000;
    m.add(20e6);
    expect(m.rate()).toBe(2e6); // moins de 5 s : pas encore fiable
    t = 10_000;
    m.add(80e6);
    expect(m.rate()).toBe(10e6);
    expect(m.sample()).toEqual({ bytes: 100e6, ms: 10_000 });
  });
});
