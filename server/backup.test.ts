import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDb } from "./db.js";
import { snapshotDb, SNAPSHOT_KEEP } from "./backup.js";

const tmp = () => mkdtempSync(join(tmpdir(), "waysake-backup-"));

describe("instantanés de la base", () => {
  it("écrit une copie lisible de la base, datée du jour", async () => {
    const dir = tmp();
    const db = openDb(dir);
    db.prepare("INSERT INTO user (id, name, color) VALUES ('lea', 'Léa', '#0B7A4B')").run();
    const file = await snapshotDb(db, dir, new Date("2026-10-04T03:00:00"));
    expect(file).toBe(join(dir, "backups", "atlas-2026-10-04.db"));
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare("SELECT name FROM user WHERE id = 'lea'").get()).toEqual({ name: "Léa" });
    copy.close();
    db.close();
  });

  it("ne garde que les derniers jours et ignore les autres fichiers", async () => {
    const dir = tmp();
    const db = openDb(dir);
    mkdirSync(join(dir, "backups"), { recursive: true });
    writeFileSync(join(dir, "backups", "notes.txt"), "à garder");
    for (let d = 1; d <= SNAPSHOT_KEEP + 3; d++) {
      await snapshotDb(db, dir, new Date(2026, 8, d, 3));
    }
    const files = readdirSync(join(dir, "backups")).sort();
    expect(files).toContain("notes.txt");
    const snaps = files.filter((f) => f.startsWith("atlas-"));
    expect(snaps).toHaveLength(SNAPSHOT_KEEP);
    expect(snaps[0]).toBe(`atlas-2026-09-${String(4).padStart(2, "0")}.db`);
    expect(snaps.at(-1)).toBe("atlas-2026-09-10.db");
    db.close();
  });

  it("refait l'instantané du jour sans en créer un second", async () => {
    const dir = tmp();
    const db = openDb(dir);
    await snapshotDb(db, dir, new Date("2026-10-04T03:00:00"));
    await snapshotDb(db, dir, new Date("2026-10-04T15:00:00"));
    expect(readdirSync(join(dir, "backups"))).toEqual(["atlas-2026-10-04.db"]);
    db.close();
  });
});
