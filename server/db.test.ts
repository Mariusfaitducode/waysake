import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, parseProfiles } from "./db.js";

const ids = (db: ReturnType<typeof openDb>) => db.prepare("SELECT id FROM user ORDER BY id").all().map((r: any) => r.id);

describe("openDb", () => {
  it("crée les deux profils d'exemple une seule fois", () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    openDb(dir, undefined).close();
    expect(ids(openDb(dir, undefined))).toEqual(["alex", "sam"]);
  });

  it("crée les profils de WAYSAKE_PROFILES, et ne touche plus à une base existante sans réglage", () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    openDb(dir, "Léa:#123456, Tom").close();
    const db = openDb(dir, undefined);
    expect(db.prepare("SELECT * FROM user ORDER BY id").all()).toEqual([
      { id: "lea", name: "Léa", color: "#123456" },
      { id: "tom", name: "Tom", color: "#CD443D" },
    ]);
  });

  it("lit WAYSAKE_PROFILES, ou l'ancien ATLAS_PROFILES à défaut", () => {
    try {
      vi.stubEnv("WAYSAKE_PROFILES", "");
      vi.stubEnv("ATLAS_PROFILES", "Léa");
      expect(ids(openDb(mkdtempSync(join(tmpdir(), "waysake-"))))).toEqual(["lea"]);
      vi.stubEnv("WAYSAKE_PROFILES", "Tom");
      expect(ids(openDb(mkdtempSync(join(tmpdir(), "waysake-"))))).toEqual(["tom"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ajoute les nouveaux profils sans jamais supprimer les anciens", () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    openDb(dir, "Léa, Tom").close();
    const db = openDb(dir, "Léa Martin:#000000");
    expect(ids(db)).toEqual(["lea", "lea-martin", "tom"]);
  });
});

describe("parseProfiles", () => {
  it("ignore les entrées vides et donne une couleur par défaut", () => {
    expect(parseProfiles(" Ana ,, Zoé:#abc ")).toEqual([
      { id: "ana", name: "Ana", color: "#3E309F" },
      { id: "zoe", name: "Zoé", color: "#abc" },
    ]);
  });
});

describe("migration v8 : couleur des voyages", () => {
  it("ajoute trip.color et trip.auto_color à une base v7 sans toucher aux voyages", () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    const db = openDb(dir, undefined);
    // Remet la base dans l'état de la v7 (avant la migration), avec un voyage existant.
    db.exec("ALTER TABLE trip DROP COLUMN color; ALTER TABLE trip DROP COLUMN auto_color; PRAGMA user_version = 7;");
    db.prepare(
      `INSERT INTO trip (slug, title, start_at, end_at, center_lat, center_lon, country_codes, route, media_count)
       VALUES ('sicile-2025', 'Sicile', 1, 2, 37.5, 14.2, '["IT"]', '[]', 35)`,
    ).run();
    db.close();

    const after = openDb(dir, undefined);
    expect(after.pragma("user_version", { simple: true })).toBe(8);
    expect(after.prepare("SELECT slug, title, media_count, color, auto_color FROM trip").all()).toEqual([
      { slug: "sicile-2025", title: "Sicile", media_count: 35, color: null, auto_color: null },
    ]);
  });
});
