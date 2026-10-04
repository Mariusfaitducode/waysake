import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type AtlasApp } from "../app.js";

let app: AtlasApp;
const me = { "x-atlas-user": "alex" };
const ins = (id: number, local: string, lat: number | null = null, lon: number | null = null, source: string | null = null) =>
  app.atlas.db
    .prepare(`INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs, location_source)
              VALUES (?, ?, 'photo', 'x', 'x.jpg', 'image/jpeg', 1, 4, 3, ?, ?, ?, ?, 'alex', 0, 1, ?)`)
    .run(id, `s${id}`, Date.parse(`${local}Z`), local, lat, lon, source);

beforeEach(async () => {
  app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "atlas-")) });
  // Journée à Bled sans GPS : deux moments (matin, après-midi), plus une journée où une photo a un GPS.
  ins(1, "2026-09-06T10:00:00"); ins(2, "2026-09-06T10:20:00"); ins(3, "2026-09-06T15:00:00");
  ins(4, "2026-09-07T09:00:00", 45.08, 13.64, "exif"); ins(5, "2026-09-07T09:30:00"); ins(6, "2026-09-07T18:00:00");
  app.atlas.rebuild();
});
const unlocated = async () => (await app.inject({ url: "/api/unlocated" })).json();

describe("à localiser", () => {
  it("liste les journées et moments sans lieu, en ignorant les photos éclairées par une voisine à moins de 2 h", async () => {
    const u = await unlocated();
    expect(u.total).toBe(4); // la 5 profite du GPS de la 4 (30 min)
    expect(u.days.map((d: any) => [d.day, d.count])).toEqual([["2026-09-07", 1], ["2026-09-06", 3]]);
    expect(u.days[1].moments.map((m: any) => m.ids)).toEqual([[1, 2], [3]]);
    expect(u.days[1].media[0]).toMatchObject({ id: 1, thumb: "/api/media/1/thumb" });
  });

  it("pose un lieu sur un groupe, crée le voyage, et les photos sortent de la liste", async () => {
    const res = await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload: { ids: [1, 2, 3], lat: 46.3683, lon: 14.1146 } });
    expect(res.json()).toEqual({ updated: 3 });
    expect((await unlocated()).total).toBe(1);
    const row = app.atlas.db.prepare("SELECT lat, lon, location_source FROM media WHERE id = 1").get();
    expect(row).toEqual({ lat: 46.3683, lon: 14.1146, location_source: "manual" });
    const trips = (await app.inject({ url: "/api/trips" })).json();
    expect(trips.map((t: any) => t.countryCodes).flat()).toContain("SI");
  });

  it("ne remplace jamais un GPS d'origine, mais peut corriger un lieu manuel", async () => {
    await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload: { ids: [4, 6], lat: 1, lon: 1 } });
    expect(app.atlas.db.prepare("SELECT lat FROM media WHERE id = 4").get()).toEqual({ lat: 45.08 });
    await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload: { ids: [6], lat: 43.5, lon: 16.44 } });
    expect(app.atlas.db.prepare("SELECT lat FROM media WHERE id = 6").get()).toEqual({ lat: 43.5 });
  });

  it("refuse une requête invalide ou anonyme", async () => {
    expect((await app.inject({ method: "POST", url: "/api/media/locate", payload: { ids: [1], lat: 1, lon: 1 } })).statusCode).toBe(401);
    for (const payload of [{ ids: [], lat: 1, lon: 1 }, { ids: [1], lat: 99, lon: 1 }, { ids: ["1"], lat: 1, lon: 1 }, { ids: [1], lat: "a", lon: 1 }])
      expect((await app.inject({ method: "POST", url: "/api/media/locate", headers: me, payload })).statusCode).toBe(400);
  });
});
