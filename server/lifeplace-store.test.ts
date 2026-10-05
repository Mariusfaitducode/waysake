import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "./db.js";
import { rebuildTrips, listTrips } from "./trips.js";
import { getLifePlace, listLifePlaces, renameLifePlace, setLifePlaceCover, setLifePlaceStatus, tripToLifePlace } from "./lifeplace-store.js";
import { insertDemoMedia } from "../test/demo-db.js";

let db: Db;
beforeEach(() => {
  db = openDb(mkdtempSync(join(tmpdir(), "waysake-")));
  insertDemoMedia(db);
});

const insertAt = (id: number, iso: string, lat: number, lon: number) =>
  db
    .prepare(
      `INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, lat, lon, uploaded_by, uploaded_at, has_thumbs)
       VALUES (?, ?, 'photo', 'x', 'x.jpg', 'image/jpeg', 1, 1600, 1067, ?, ?, ?, 'sam', 0, 1)`,
    )
    .run(id, `extra-${id}`, Date.parse(`${iso}Z`), lat, lon);

describe("lieux de vie en base", () => {
  it("la migration v9 crée la table life_place", () => {
    expect(db.pragma("user_version", { simple: true })).toBeGreaterThanOrEqual(9);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'life_place'").get()).toBeTruthy();
  });

  it("le domicile de démo (Paris) devient un lieu de vie, avec ses photos et ses périodes", () => {
    rebuildTrips(db);
    const places = listLifePlaces(db);
    expect(places.map((p) => [p.slug, p.title, p.status])).toEqual([["paris", "Paris", "auto"]]);
    expect(places[0].mediaCount).toBeGreaterThan(0);
    const paris = getLifePlace(db, "paris")!;
    expect(paris.periods.length).toBe(3); // trois journées à Paris, à des mois d'écart
    expect(paris.periods[0].startAt).toBeGreaterThan(paris.periods[2].startAt); // la plus récente d'abord
    expect(paris.periods.flatMap((p) => p.media).length).toBe(paris.mediaCount);
    expect(paris.coverMediaId).not.toBeNull();
  });

  it("détecte une seconde ville habitée (au moins 4 mois) et la retire des voyages", () => {
    ["2022-01", "2022-03", "2022-05", "2022-07", "2022-09"].forEach((m, i) => insertAt(9000 + i, `${m}-12T10:00:00`, 48.1173, -1.6778));
    insertAt(9100, "2024-02-12T10:00:00", 48.8566, 2.3522); // un 4e mois à Paris (la démo n'en a que 3)
    rebuildTrips(db);
    expect(listLifePlaces(db).map((p) => p.slug).sort()).toEqual(["paris", "rennes"]);
    expect(listTrips(db).some((t) => t.title === "Rennes")).toBe(false);
    expect(getLifePlace(db, "rennes")!.periods).toHaveLength(5);
  });

  it("garde le lien, le nom donné, la couverture et le statut d'un recalcul à l'autre", () => {
    rebuildTrips(db);
    const before = getLifePlace(db, "paris")!;
    const cover = before.periods[1].media[0].id;
    expect(renameLifePlace(db, "paris", "Chez nous")).toBe(true);
    expect(setLifePlaceCover(db, "paris", cover)).toBe(true);
    setLifePlaceStatus(db, "paris", "confirmed");
    rebuildTrips(db);
    const after = getLifePlace(db, "paris")!;
    expect(after).toMatchObject({ id: before.id, slug: "paris", title: "Chez nous", autoTitle: "Paris", status: "confirmed", coverMediaId: cover });
  });

  it("refuse une couverture qui n'est pas une photo du lieu", () => {
    rebuildTrips(db);
    const berlin = listTrips(db).find((t) => t.title === "Berlin")!;
    expect(setLifePlaceCover(db, "paris", berlin.coverMediaId)).toBe(false);
  });

  it("un lieu rejeté n'est plus actif : ses photos retournent aux voyages, et le refus survit au recalcul", () => {
    rebuildTrips(db);
    const trips = listTrips(db).length;
    setLifePlaceStatus(db, "paris", "rejected");
    expect(listLifePlaces(db)).toEqual([]);
    expect(listTrips(db).length).toBe(trips + 3);
    rebuildTrips(db);
    expect(listLifePlaces(db)).toEqual([]);
    expect(getLifePlace(db, "paris")).toMatchObject({ status: "rejected", mediaCount: 0 });
  });

  it("un voyage devient un lieu de vie confirmé, qui reste actif sans être détecté", () => {
    rebuildTrips(db);
    const berlin = listTrips(db).find((t) => t.title === "Berlin")!;
    const slug = tripToLifePlace(db, berlin.slug);
    expect(slug).toBe("berlin");
    expect(listTrips(db).some((t) => t.title === "Berlin")).toBe(false);
    const place = getLifePlace(db, "berlin")!;
    expect(place).toMatchObject({ title: "Berlin", status: "confirmed", mediaCount: berlin.mediaCount });
    rebuildTrips(db);
    expect(listLifePlaces(db).map((p) => p.slug).sort()).toEqual(["berlin", "paris"]);
    expect(tripToLifePlace(db, "inconnu")).toBeNull();
  });

  it("réactive un lieu rejeté quand on transforme un voyage proche", () => {
    rebuildTrips(db);
    setLifePlaceStatus(db, "paris", "rejected");
    const parisTrip = listTrips(db).find((t) => t.title === "Paris")!;
    expect(tripToLifePlace(db, parisTrip.slug)).toBe("paris");
    expect(getLifePlace(db, "paris")!.status).toBe("confirmed");
    expect(listTrips(db).some((t) => t.title === "Paris")).toBe(false);
  });
});
