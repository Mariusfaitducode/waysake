import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onThisDay, tripStats } from "./souvenirs.js";
import { buildApp, type WaysakeApp } from "./app.js";

describe("il y a un an", () => {
  const rows = [
    { id: 1, takenAtLocal: "2025-10-04T09:00:00" },
    { id: 2, takenAtLocal: "2025-10-04T18:30:00" },
    { id: 3, takenAtLocal: "2023-10-04T12:00:00" },
    { id: 4, takenAtLocal: "2025-10-05T12:00:00" }, // le lendemain : non
    { id: 5, takenAtLocal: "2026-10-04T08:00:00" }, // aujourd'hui même : non
    { id: 6, takenAtLocal: null },
  ];

  it("regroupe les photos du même jour, les années passées, la plus récente d'abord", () => {
    expect(onThisDay(rows, "2026-10-04")).toEqual([
      { year: 2025, yearsAgo: 1, ids: [1, 2] },
      { year: 2023, yearsAgo: 3, ids: [3] },
    ]);
  });

  it("rien ce jour-là", () => {
    expect(onThisDay(rows, "2026-03-01")).toEqual([]);
  });

  it("un 28 février d'année non bissextile reprend aussi les 29 février", () => {
    const leap = [{ id: 7, takenAtLocal: "2024-02-29T10:00:00" }, { id: 8, takenAtLocal: "2024-02-28T10:00:00" }];
    expect(onThisDay(leap, "2027-02-28")).toEqual([{ year: 2024, yearsAgo: 3, ids: [8, 7] }]);
    expect(onThisDay(leap, "2028-02-28")).toEqual([{ year: 2024, yearsAgo: 4, ids: [8] }]);
  });
});

describe("statistiques de voyage", () => {
  const photo = (uploadedBy: string, takenAtLocal: string) => ({ uploadedBy, takenAtLocal });
  const trip = {
    startAt: Date.parse("2026-08-25T08:00:00Z"),
    endAt: Date.parse("2026-08-28T20:00:00Z"),
    countryCodes: ["IT", "SI"],
    // [lon, lat] : Venise → Bled → Ljubljana
    route: [
      [12.3155, 45.4408],
      [14.1146, 46.3683],
      [14.5058, 46.0569],
    ] as [number, number][],
    chapters: [
      { id: 1, title: "Italie", media: [photo("alex", "2026-08-25T10:00:00"), photo("sam", "2026-08-25T11:00:00")] },
      {
        id: 2,
        title: "Slovénie",
        media: [photo("sam", "2026-08-27T09:00:00"), photo("sam", "2026-08-27T10:00:00"), photo("sam", "2026-08-27T11:00:00"), photo("alex", "2026-08-28T09:00:00")],
      },
    ],
  };

  it("km, jours, pays, étape et jour les plus photographiés, répartition par personne", () => {
    const s = tripStats(trip);
    expect(s.km).toBeGreaterThan(200);
    expect(s.km).toBeLessThan(260);
    expect(s.days).toBe(4);
    expect(s.countries).toBe(2);
    expect(s.photos).toBe(6);
    expect(s.topChapter).toEqual({ id: 2, title: "Slovénie", count: 4 });
    expect(s.topDay).toEqual({ day: "2026-08-27", count: 3 });
    expect(s.byUser).toEqual([
      { userId: "sam", count: 4, share: 67 },
      { userId: "alex", count: 2, share: 33 },
    ]);
  });

  it("un voyage d'une seule étape n'a pas d'« étape la plus photographiée »", () => {
    const s = tripStats({ ...trip, route: [[12.3, 45.4]], chapters: [trip.chapters[0]] });
    expect(s.km).toBe(0);
    expect(s.topChapter).toBeNull();
  });
});

describe("API souvenirs", () => {
  let app: WaysakeApp;
  const ins = (id: number, local: string, by = "alex") =>
    app.waysake.db
      .prepare(`INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs, location_source)
                VALUES (?, ?, 'photo', 'x', 'x.jpg', 'image/jpeg', 1, 4, 3, ?, ?, 46.3683, 14.1146, ?, 0, 1, 'exif')`)
      .run(id, `s${id}`, Date.parse(`${local}Z`), local, by);

  beforeEach(async () => {
    app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "atlas-")) });
    ins(1, "2025-10-04T10:00:00");
    ins(2, "2025-10-04T12:00:00", "sam");
    ins(3, "2025-10-05T10:00:00", "sam");
    app.waysake.rebuild();
  });

  it("GET /api/memories : les photos de ce jour-là, avec leur voyage", async () => {
    const res = (await app.inject({ url: "/api/memories?today=2026-10-04" })).json();
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0]).toMatchObject({ year: 2025, yearsAgo: 1, trip: { slug: expect.any(String), title: expect.any(String) } });
    expect(res.groups[0].media.map((m: any) => m.id)).toEqual([1, 2]);
    expect(res.groups[0].media[0]).toMatchObject({ thumb: "/api/media/1/thumb", reactions: {} });
    expect((await app.inject({ url: "/api/memories?today=2026-12-25" })).json()).toEqual({ groups: [] });
  });

  it("GET /api/memories refuse une date mal formée", async () => {
    expect((await app.inject({ url: "/api/memories?today=demain" })).statusCode).toBe(400);
  });

  it("GET /api/trips/:slug/stats", async () => {
    const [t] = (await app.inject({ url: "/api/trips" })).json();
    const s = (await app.inject({ url: `/api/trips/${t.slug}/stats` })).json();
    expect(s).toMatchObject({ photos: 3, days: 2, countries: 1, topDay: { day: "2025-10-04", count: 2 } });
    expect(s.byUser).toEqual([
      { userId: "sam", count: 2, share: 67 },
      { userId: "alex", count: 1, share: 33 },
    ]);
    expect((await app.inject({ url: "/api/trips/nulle-part/stats" })).statusCode).toBe(404);
  });
});
