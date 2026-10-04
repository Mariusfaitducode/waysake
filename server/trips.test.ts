import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "./db.js";
import { rebuildTrips, listTrips, getTrip, renameTrip, renameChapter, setCover, mergeChapterWithPrevious } from "./trips.js";
import { insertDemoMedia } from "../test/demo-db.js";

let db: Db;
beforeEach(() => {
  db = openDb(mkdtempSync(join(tmpdir(), "waysake-")));
});
const road = () => listTrips(db).find((t) => t.countryCodes.includes("HR"))!;

describe("rebuildTrips", () => {
  it("crée les voyages avec des liens lisibles", () => {
    insertDemoMedia(db);
    expect(rebuildTrips(db).trips).toBe(5);
    const trips = listTrips(db);
    expect(trips.map((t) => t.title)).toEqual(["Italie, Slovénie & Croatie", "Sicile", "Îles Canaries", "Berlin", "Amsterdam"]);
    expect(road().slug).toBe("italie-slovenie-croatie-2026");
    expect(trips.find((t) => t.title === "Berlin")!.slug).toBe("berlin-2024");
  });

  it("donne le nombre d'étapes de chaque voyage dans la liste", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    const counts = listTrips(db).map((t) => t.chapterCount);
    expect(counts.every((n) => n >= 1)).toBe(true);
    expect(road().chapterCount).toBe(getTrip(db, road().slug)!.chapters.length);
  });

  it("donne l'itinéraire de chaque voyage dans la liste, comme le détail", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    expect(road().route.length).toBeGreaterThan(1);
    expect(road().route).toEqual(getTrip(db, road().slug)!.route);
  });

  it("est idempotent : mêmes ids, mêmes liens", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    const before = listTrips(db).map((t) => [t.id, t.slug]);
    rebuildTrips(db);
    expect(listTrips(db).map((t) => [t.id, t.slug])).toEqual(before);
  });

  it("garde le lien et le titre personnalisé quand on ajoute des photos plus tard", () => {
    // d'abord sans les deux derniers jours du road trip
    insertDemoMedia(db, (p) => !(p.takenAt && p.takenAt >= Date.UTC(2026, 8, 13)));
    rebuildTrips(db);
    const { slug, id } = road();
    renameTrip(db, slug, "Notre grand road trip");
    insertDemoMedia(db, (p) => !!p.takenAt && p.takenAt >= Date.UTC(2026, 8, 13));
    rebuildTrips(db);
    expect(road()).toMatchObject({ id, slug, title: "Notre grand road trip" });
  });

  it("rend le titre automatique quand on efface le titre personnalisé", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    renameTrip(db, road().slug, "X");
    renameTrip(db, road().slug, null);
    expect(road().title).toBe("Italie, Slovénie & Croatie");
  });

  it("conserve les étapes renommées, la couverture et les fusions", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    const trip = getTrip(db, road().slug)!;
    const [italie, dolomites] = trip.chapters;
    renameChapter(db, dolomites.id, "Nos Dolomites");
    setCover(db, trip.slug, dolomites.media[0].id);
    mergeChapterWithPrevious(db, trip.chapters[3].id); // Croatie dans Slovénie
    rebuildTrips(db);
    const after = getTrip(db, trip.slug)!;
    expect(after.chapters.map((c) => c.title)).toEqual(["Italie", "Nos Dolomites", "Slovénie"]);
    expect(after.chapters[0].id).toBe(italie.id);
    expect(after.coverMediaId).toBe(dolomites.media[0].id);
    expect(after.chapters[2].places).toEqual(expect.arrayContaining(["Bled", "Split"]));
  });

  it("supprime un voyage dont toutes les photos ont disparu", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    const berlin = listTrips(db).find((t) => t.title === "Berlin")!;
    const ids = getTrip(db, berlin.slug)!.chapters.flatMap((c) => c.media.map((m) => m.id));
    db.prepare(`DELETE FROM media WHERE id IN (${ids.join(",")})`).run();
    rebuildTrips(db);
    expect(listTrips(db).map((t) => t.title)).not.toContain("Berlin");
  });

  it("choisit une couverture automatique en paysage", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    const trip = getTrip(db, road().slug)!;
    const cover = db.prepare("SELECT width, height FROM media WHERE id = ?").get(trip.coverMediaId) as any;
    expect(cover.width).toBeGreaterThan(cover.height);
  });

  it("enregistre le lieu de chaque photo", () => {
    insertDemoMedia(db);
    rebuildTrips(db);
    const trip = getTrip(db, road().slug)!;
    expect(trip.chapters[0].media[0].place).toBe("Venise");
    expect(trip.route.length).toBeGreaterThan(10);
  });
});
