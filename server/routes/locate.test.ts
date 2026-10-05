import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type WaysakeApp } from "../app.js";

let app: WaysakeApp;
const me = { "x-atlas-user": "alex" };
const ins = (id: number, local: string, lat: number | null = null, lon: number | null = null, source: string | null = null) =>
  app.waysake.db
    .prepare(`INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs, location_source)
              VALUES (?, ?, 'photo', 'x', 'x.jpg', 'image/jpeg', 1, 4, 3, ?, ?, ?, ?, 'alex', 0, 1, ?)`)
    .run(id, `s${id}`, Date.parse(`${local}Z`), local, lat, lon, source);

beforeEach(async () => {
  app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
  // Journée à Bled sans GPS : deux moments (matin, après-midi), plus une journée où une photo a un GPS.
  ins(1, "2026-09-06T10:00:00"); ins(2, "2026-09-06T10:20:00"); ins(3, "2026-09-06T15:00:00");
  ins(4, "2026-09-07T09:00:00", 45.08, 13.64, "exif"); ins(5, "2026-09-07T09:30:00"); ins(6, "2026-09-07T18:00:00");
  app.waysake.rebuild();
});
const unlocated = async () => (await app.inject({ url: "/api/unlocated" })).json();

describe("à localiser", () => {
  it("liste les journées et moments sans lieu, en ignorant les photos éclairées par une voisine à moins de 2 h", async () => {
    const u = await unlocated();
    expect(u.total).toBe(4); // la 5 profite du GPS de la 4 (30 min)
    expect(u.days.map((d: any) => [d.day, d.count])).toEqual([["2026-09-07", 1], ["2026-09-06", 3]]);
    expect(u.days[1].moments.map((m: any) => m.ids)).toEqual([[1, 2], [3]]);
    expect(u.days[1].media[0]).toMatchObject({ id: 1, thumb: "/api/media/1/thumb", original: "/api/media/1/original", uploadedBy: "alex" });
  });

  it("pose un lieu sur un groupe, crée le voyage, et les photos sortent de la liste", async () => {
    const res = await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload: { ids: [1, 2, 3], lat: 46.3683, lon: 14.1146 } });
    expect(res.json()).toEqual({ updated: 3 });
    expect((await unlocated()).total).toBe(1);
    const row = app.waysake.db.prepare("SELECT lat, lon, location_source FROM media WHERE id = 1").get();
    expect(row).toEqual({ lat: 46.3683, lon: 14.1146, location_source: "manual" });
    const trips = (await app.inject({ url: "/api/trips" })).json();
    expect(trips.map((t: any) => t.countryCodes).flat()).toContain("SI");
  });

  it("ne remplace jamais un GPS d'origine, mais peut corriger un lieu manuel", async () => {
    await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload: { ids: [4, 6], lat: 1, lon: 1 } });
    expect(app.waysake.db.prepare("SELECT lat FROM media WHERE id = 4").get()).toEqual({ lat: 45.08 });
    await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload: { ids: [6], lat: 43.5, lon: 16.44 } });
    expect(app.waysake.db.prepare("SELECT lat FROM media WHERE id = 6").get()).toEqual({ lat: 43.5 });
  });

  it("refuse une requête invalide ou anonyme", async () => {
    expect((await app.inject({ method: "POST", url: "/api/media/locate", payload: { ids: [1], lat: 1, lon: 1 } })).statusCode).toBe(401);
    for (const payload of [{ ids: [], lat: 1, lon: 1 }, { ids: [1], lat: 99, lon: 1 }, { ids: ["1"], lat: 1, lon: 1 }, { ids: [1], lat: "a", lon: 1 }])
      expect((await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload })).statusCode).toBe(400);
  });
});

describe("lieu d'un point posé sur la carte", () => {
  it("nomme le lieu le plus proche, hors ligne", async () => {
    const res = (await app.inject({ url: "/api/places/reverse?lat=46.3683&lon=14.1146" })).json();
    expect(res).toMatchObject({ countryCode: "SI", flag: "🇸🇮", lat: 46.3683, lon: 14.1146 });
    expect(typeof res.name).toBe("string");
  });

  it("en pleine mer : pas de nom, mais le point reste valable", async () => {
    expect((await app.inject({ url: "/api/places/reverse?lat=40&lon=-40" })).json()).toMatchObject({ name: null, lat: 40, lon: -40 });
  });

  it("refuse des coordonnées invalides", async () => {
    expect((await app.inject({ url: "/api/places/reverse?lat=abc&lon=1" })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/places/reverse?lat=95&lon=1" })).statusCode).toBe(400);
  });
});

describe("lieux suggérés pour un groupe", () => {
  const suggest = async (ids: string) => app.inject({ url: `/api/places/suggest?ids=${ids}` });
  beforeEach(() => {
    ins(10, "2026-09-05T12:00:00", 46.3683, 14.1146, "exif"); // Bled, la veille
    ins(11, "2026-09-05T12:30:00", 46.3690, 14.1150, "exif");
    ins(12, "2026-08-31T12:00:00", 46.0569, 14.5058, "exif"); // Ljubljana, six jours avant : seulement en élargissant
    ins(13, "2026-07-01T12:00:00", 45.8150, 15.9819, "exif"); // Zagreb, deux mois avant : jamais
  });

  it("propose les villes des photos localisées prises au même moment, la plus probable d'abord", async () => {
    const res = await suggest("1,2,3");
    expect(res.statusCode).toBe(200);
    const out = res.json();
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ country: "Slovénie", countryCode: "SI", flag: "🇸🇮", count: 2 });
    expect(out[0].lat).toBeCloseTo(46.36865, 4);
    expect(out[1].countryCode).toBe("HR"); // la photo 4, le lendemain matin
    expect(out[2]).toMatchObject({ countryCode: "SI", count: 1 });
    expect(out.map((s: any) => s.name)).not.toContain("Zagreb");
    for (const s of out) expect(Object.keys(s).sort()).toEqual(["count", "country", "countryCode", "flag", "lat", "lon", "name"]);
  });

  it("ne compte pas les photos du groupe lui-même, et ignore les identifiants inconnus", async () => {
    const out = (await suggest("1,2,3,4,9999")).json();
    expect(out.map((s: any) => s.countryCode)).toEqual(["SI", "SI"]);
    expect((await suggest("9999")).json()).toEqual([]);
  });

  it("refuse une liste invalide", async () => {
    for (const ids of ["", "abc", "1,,2", "1.5", "-1", Array.from({ length: 501 }, (_, i) => i + 1).join(",")]) {
      const res = await suggest(ids);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("invalid_place");
    }
    expect((await app.inject({ url: "/api/places/suggest" })).statusCode).toBe(400);
  });
});
