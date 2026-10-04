import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "./db.js";
import { rebuildTrips, listTrips } from "./trips.js";
import { proposal, setExclusions, confirmImport, cancelImport, expireImports, lastImportedAt } from "./imports.js";
import { insertDemoMedia } from "../test/demo-db.js";

let dir: string;
let db: Db;
const ROAD_START = Date.UTC(2026, 7, 1);
const HOME_DAY = Date.UTC(2026, 5, 21);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-"));
  db = openDb(dir);
  const rows = insertDemoMedia(db);
  mkdirSync(join(dir, "x"));
  for (const r of rows) writeFileSync(join(dir, `x/${r.id}.jpg`), "x");
  db.prepare("INSERT INTO import (id, user_id, created_at) VALUES (1, 'alex', ?)").run(Date.now());
  // Arrivent par le téléphone : le road trip, une journée à la maison, une photo de Berlin oubliée, 2 captures.
  db.prepare("UPDATE media SET status = 'pending', import_id = 1 WHERE taken_at >= ? OR (taken_at >= ? AND taken_at < ?)").run(ROAD_START, HOME_DAY, HOME_DAY + 86_400_000);
  const berlin = db.prepare("SELECT id FROM media WHERE lat BETWEEN 52.4 AND 52.6 AND lon BETWEEN 13.3 AND 13.5 ORDER BY id DESC LIMIT 1").get() as { id: number };
  db.prepare("UPDATE media SET status = 'pending', import_id = 1 WHERE id = ?").run(berlin.id);
  db.prepare("UPDATE media SET screenshot = 1, excluded = 1 WHERE id IN (SELECT id FROM media WHERE import_id = 1 AND taken_at >= ? ORDER BY id DESC LIMIT 2)").run(ROAD_START);
  rebuildTrips(db);
});
const pendingCount = () => (db.prepare("SELECT count(*) AS n FROM media WHERE import_id = 1").get() as { n: number }).n;

describe("proposal", () => {
  it("propose le road trip comme nouveau voyage avec ses étapes et son itinéraire", () => {
    const p = proposal(db, 1)!;
    expect(p.newTrips.map((t) => t.title)).toEqual(["Italie, Slovénie & Croatie"]);
    const road = p.newTrips[0];
    expect(road.chapters.map((c) => c.title)).toEqual(["Italie", "Dolomites", "Slovénie", "Croatie"]);
    expect(road.route.length).toBeGreaterThan(10);
    expect(road.media.length).toBe(road.count);
    expect(road.cover).toMatch(/thumb$/);
  });

  it("signale la photo de Berlin qui complète un voyage existant", () => {
    const p = proposal(db, 1)!;
    expect(p.extendedTrips).toEqual([expect.objectContaining({ slug: "berlin-2024", title: "Berlin", added: 1 })]);
  });

  it("met de côté les captures d'écran et les photos de la maison", () => {
    const p = proposal(db, 1)!;
    expect(p.setAside.screenshots).toHaveLength(2);
    expect(p.setAside.home.length).toBe(3);
    expect(p.keepHome).toBe(false);
    expect(p.counts).toMatchObject({ received: pendingCount(), toImport: pendingCount() - 2 - 3 });
  });

  it("une photo décochée sort du compte, puis y revient", () => {
    const road = proposal(db, 1)!.newTrips[0];
    setExclusions(db, 1, { exclude: [road.media[0].id] });
    let p = proposal(db, 1)!;
    expect(p.newTrips[0].count).toBe(road.count - 1);
    expect(p.newTrips[0].media.find((m) => m.id === road.media[0].id)?.excluded).toBe(true);
    setExclusions(db, 1, { include: [road.media[0].id] });
    p = proposal(db, 1)!;
    expect(p.newTrips[0].count).toBe(road.count);
  });

  it("ignore les identifiants qui n'appartiennent pas à la session", () => {
    const ready = db.prepare("SELECT id FROM media WHERE status = 'ready' LIMIT 1").get() as { id: number };
    setExclusions(db, 1, { exclude: [ready.id] });
    expect(db.prepare("SELECT excluded FROM media WHERE id = ?").get(ready.id)).toEqual({ excluded: 0 });
  });

  it("session inconnue → null", () => {
    expect(proposal(db, 42)).toBeNull();
  });
});

describe("confirmImport", () => {
  it("rend visibles les voyages, supprime ce qui est mis de côté, et ne fait rien la deuxième fois", () => {
    const shot = db.prepare("SELECT id, original_path FROM media WHERE import_id = 1 AND screenshot = 1").get() as { id: number; original_path: string };
    const first = confirmImport(db, dir, 1);
    expect(first.trips).toEqual(expect.arrayContaining(["italie-slovenie-croatie-2026", "berlin-2024"]));
    expect(listTrips(db).map((t) => t.title)).toContain("Italie, Slovénie & Croatie");
    expect(db.prepare("SELECT count(*) AS n FROM media WHERE status = 'pending'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT 1 FROM media WHERE id = ?").get(shot.id)).toBeUndefined();
    expect(existsSync(join(dir, shot.original_path))).toBe(false);
    expect(confirmImport(db, dir, 1)).toEqual(first);
  });

  it("garde les photos de la maison si on le demande", () => {
    setExclusions(db, 1, { keepHome: true });
    confirmImport(db, dir, 1);
    expect((db.prepare("SELECT count(*) AS n FROM media WHERE taken_at >= ? AND taken_at < ?").get(HOME_DAY, HOME_DAY + 86_400_000) as { n: number }).n).toBe(3);
  });
});

describe("cancelImport / expireImports", () => {
  it("annule tout ce qui est en attente sans toucher aux photos déjà dans Atlas", () => {
    const readyBefore = (db.prepare("SELECT count(*) AS n FROM media WHERE status = 'ready'").get() as { n: number }).n;
    const pending = db.prepare("SELECT original_path FROM media WHERE import_id = 1").all() as { original_path: string }[];
    cancelImport(db, dir, 1);
    expect(db.prepare("SELECT count(*) AS n FROM media WHERE import_id = 1").get()).toEqual({ n: 0 });
    expect((db.prepare("SELECT count(*) AS n FROM media WHERE status = 'ready'").get() as { n: number }).n).toBe(readyBefore);
    expect(pending.some((p) => existsSync(join(dir, p.original_path)))).toBe(false);
    expect(proposal(db, 1)?.status).toBe("cancelled");
  });

  it("annule les sessions oubliées depuis plus de 7 jours", () => {
    db.prepare("UPDATE import SET created_at = ? WHERE id = 1").run(Date.now() - 8 * 86_400_000);
    expect(expireImports(db, dir)).toBe(1);
    expect(proposal(db, 1)?.status).toBe("cancelled");
  });
});

describe("lastImportedAt", () => {
  it("donne la date de la photo la plus récente déjà dans Atlas", () => {
    expect(lastImportedAt(db)).toBe((db.prepare("SELECT max(taken_at) AS t FROM media WHERE status = 'ready'").get() as { t: number }).t);
  });
});
