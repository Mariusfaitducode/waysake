import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, parseProfiles } from "./db.js";

const ids = (db: ReturnType<typeof openDb>) => db.prepare("SELECT id FROM user ORDER BY id").all().map((r: any) => r.id);

describe("openDb", () => {
  it("crée les deux profils d'exemple une seule fois", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    openDb(dir, undefined).close();
    expect(ids(openDb(dir, undefined))).toEqual(["alex", "sam"]);
  });

  it("crée les profils de ATLAS_PROFILES, et ne touche plus à une base existante sans réglage", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    openDb(dir, "Léa:#123456, Tom").close();
    const db = openDb(dir, undefined);
    expect(db.prepare("SELECT * FROM user ORDER BY id").all()).toEqual([
      { id: "lea", name: "Léa", color: "#123456" },
      { id: "tom", name: "Tom", color: "#1F6FB2" },
    ]);
  });

  it("ajoute les nouveaux profils sans jamais supprimer les anciens", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    openDb(dir, "Léa, Tom").close();
    const db = openDb(dir, "Léa Martin:#000000");
    expect(ids(db)).toEqual(["lea", "lea-martin", "tom"]);
  });
});

describe("parseProfiles", () => {
  it("ignore les entrées vides et donne une couleur par défaut", () => {
    expect(parseProfiles(" Ana ,, Zoé:#abc ")).toEqual([
      { id: "ana", name: "Ana", color: "#0B7A4B" },
      { id: "zoe", name: "Zoé", color: "#abc" },
    ]);
  });
});
