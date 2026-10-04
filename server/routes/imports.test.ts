import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildApp, type WaysakeApp } from "../app.js";
import { makeJpeg } from "../../test/fixtures.js";

let app: WaysakeApp;
beforeEach(async () => {
  app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
});

function multipart(name: string, data: Buffer, fields: Record<string, string> = {}) {
  const b = "----waysake" + Math.random().toString(16).slice(2);
  const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  // Les champs arrivent avant le fichier, comme le font l'app et le raccourci.
  const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  return { payload: Buffer.concat([...parts, head, data, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}
const newImport = async (headers: Record<string, string> = { "x-atlas-user": "alex" }) =>
  app.inject({ method: "POST", url: "/api/imports", headers });
const send = (importId: number, name: string, data: Buffer, fields: Record<string, string> = {}) => {
  const { payload, headers } = multipart(name, data, fields);
  return app.inject({ method: "POST", url: `/api/media?import=${importId}`, payload, headers: { ...headers, "x-atlas-user": "sam" } });
};
const row = (id: number) => app.waysake.db.prepare("SELECT * FROM media WHERE id = ?").get(id) as any;

describe("sessions d'import", () => {
  it("se crée avec l'en-tête ou le cookie, et exige une identité", async () => {
    expect((await newImport()).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/api/imports", headers: { cookie: "atlas_user=alex" } })).statusCode).toBe(201);
    expect((await newImport({})).statusCode).toBe(401);
    expect((await newImport({ "x-atlas-user": "bob" })).statusCode).toBe(401);
  });

  it("un envoi dans une session est en attente et rattaché à la session", async () => {
    const { id } = (await newImport()).json();
    const res = await send(id, "a.jpg", await makeJpeg({ takenAt: "2026:09:01 10:00:00", lat: 45.4, lon: 12.3 }));
    expect(res.statusCode).toBe(201);
    expect(row(res.json().id)).toMatchObject({ status: "pending", import_id: id, uploaded_by: "sam" });
  });

  it("session inconnue ou close → 404", async () => {
    expect((await send(999, "a.jpg", await makeJpeg())).statusCode).toBe(404);
  });
});

describe("sécurité (CSRF)", () => {
  it("refuse l'identité passée dans l'adresse : un site tiers pourrait la forger", async () => {
    expect((await app.inject({ method: "POST", url: "/api/imports?user=sam" })).statusCode).toBe(401);
    const { payload, headers } = multipart("a.jpg", await makeJpeg());
    const res = await app.inject({ method: "POST", url: "/api/media?user=alex", payload, headers });
    expect(res.statusCode).toBe(401);
  });
});

describe("métadonnées envoyées par le téléphone", () => {
  it("comblent la date et le lieu absents de l'EXIF", async () => {
    const { id } = (await newImport()).json();
    const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#456" } }).png().toBuffer();
    const res = await send(id, "IMG.png", png, { takenAt: String(Date.UTC(2026, 8, 3, 8, 0, 0)), takenAtLocal: "2026-09-03T10:00:00", lat: "46.3683", lon: "14.1146" });
    expect(row(res.json().id)).toMatchObject({ taken_at: Date.UTC(2026, 8, 3, 8, 0, 0), taken_at_local: "2026-09-03T10:00:00", lat: 46.3683, lon: 14.1146 });
    expect(row(res.json().id).original_path).toMatch(/^originals\/2026\/09\//);
  });

  it("sont lus même quand ils arrivent après le fichier", async () => {
    const { id } = (await newImport()).json();
    const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#654" } }).png().toBuffer();
    const b = "----waysake-after";
    const payload = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="IMG.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${b}\r\nContent-Disposition: form-data; name="lat"\r\n\r\n43.5081\r\n--${b}\r\nContent-Disposition: form-data; name="lon"\r\n\r\n16.4402\r\n--${b}--\r\n`),
    ]);
    const res = await app.inject({ method: "POST", url: `/api/media?import=${id}`, payload, headers: { "content-type": `multipart/form-data; boundary=${b}`, "x-atlas-user": "alex" } });
    expect(res.statusCode).toBe(201);
    expect(row(res.json().id)).toMatchObject({ lat: 43.5081, lon: 16.4402 });
  });

  it("ne remplacent jamais l'EXIF", async () => {
    const { id } = (await newImport()).json();
    const res = await send(id, "a.jpg", await makeJpeg({ takenAt: "2026:09:01 10:00:00", lat: 45.4, lon: 12.3 }), {
      takenAtLocal: "2020-01-01T00:00:00", lat: "1", lon: "1",
    });
    expect(row(res.json().id)).toMatchObject({ taken_at_local: "2026-09-01T10:00:00", lat: expect.closeTo(45.4, 3) });
  });

  it("ignorent les valeurs invalides sans erreur", async () => {
    const { id } = (await newImport()).json();
    const res = await send(id, "a.jpg", await makeJpeg(), { lat: "nord", lon: "999", takenAt: "hier", takenAtLocal: "2026-13-45" });
    expect(res.statusCode).toBe(201);
    expect(row(res.json().id)).toMatchObject({ lat: null, lon: null, taken_at: null, taken_at_local: null });
  });

  it("une photo déjà dans Waysake est un doublon compté, jamais dupliquée", async () => {
    const data = await makeJpeg({ takenAt: "2026:09:01 10:00:00" });
    const { payload, headers } = multipart("old.jpg", data);
    const first = await app.inject({ method: "POST", url: "/api/media", payload, headers: { ...headers, cookie: "atlas_user=alex" } });
    const { id } = (await newImport()).json();
    const again = await send(id, "same.jpg", data);
    expect(again.json()).toEqual({ id: first.json().id, duplicate: true });
    expect(row(first.json().id)).toMatchObject({ status: "ready", import_id: null });
    expect(app.waysake.db.prepare("SELECT duplicates FROM import WHERE id = ?").get(id)).toEqual({ duplicates: 1 });
  });
});

describe("proposition, validation et annulation par l'API", () => {
  const me = { "x-atlas-user": "alex" };
  it("montre la proposition, décoche une photo, valide (double tap sans effet)", async () => {
    const { id } = (await newImport()).json();
    const a = (await send(id, "a.jpg", await makeJpeg({ takenAt: "2026:09:01 10:00:00", lat: 46.3683, lon: 14.1146 }))).json();
    const b = (await send(id, "b.jpg", await makeJpeg({ takenAt: "2026:09:01 11:00:00", lat: 46.37, lon: 14.11, color: "#a33" }))).json();
    const p = (await app.inject({ url: `/api/imports/${id}` })).json();
    expect(p.newTrips[0]).toMatchObject({ title: "Bled", count: 2 });
    expect(p.newTrips[0].color).toMatch(/^(coral|amber|moss|pine|lagoon|azure|indigo|lilac|raspberry|slate)$/);
    expect((await app.inject({ method: "PATCH", url: `/api/imports/${id}`, payload: { exclude: [b.id] }, headers: me })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/imports/${id}` })).json().counts.toImport).toBe(1);
    const c1 = await app.inject({ method: "POST", url: `/api/imports/${id}/confirm`, headers: me });
    const c2 = await app.inject({ method: "POST", url: `/api/imports/${id}/confirm`, headers: me });
    expect(c1.json()).toEqual({ trips: ["bled-2026"] });
    expect(c2.json()).toEqual(c1.json());
    expect((await app.inject({ url: "/api/media" })).json().items.map((m: any) => m.id)).toEqual([a.id]);
  });

  it("propose la couleur du nouveau voyage, tirée de sa couverture", async () => {
    const { id } = (await newImport()).json();
    for (const h of ["10", "11"]) await send(id, `${h}.jpg`, await makeJpeg({ takenAt: `2026:09:01 ${h}:00:00`, lat: 46.3683, lon: 14.1146, color: "#2a6fd6", width: 96, height: 64 }));
    const p = (await app.inject({ url: `/api/imports/${id}` })).json();
    expect(p.newTrips[0].color).toBe("azure");
  });

  it("valide le corps de la modification", async () => {
    const { id } = (await newImport()).json();
    for (const payload of [{ exclude: "1" }, { exclude: [1.5] }, { keepHome: "oui" }])
      expect((await app.inject({ method: "PATCH", url: `/api/imports/${id}`, payload, headers: me })).statusCode).toBe(400);
  });

  it("annule et refuse ensuite de nouveaux envois", async () => {
    const { id } = (await newImport()).json();
    await send(id, "a.jpg", await makeJpeg({ takenAt: "2026:09:01 10:00:00" }));
    expect((await app.inject({ method: "DELETE", url: `/api/imports/${id}`, headers: me })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/imports/${id}` })).json().status).toBe("cancelled");
    expect((await send(id, "b.jpg", await makeJpeg())).statusCode).toBe(404);
  });

  it("donne la date du dernier import et 404 pour une session inconnue", async () => {
    expect((await app.inject({ url: "/api/imports/last" })).json()).toEqual({ since: null });
    expect((await app.inject({ url: "/api/imports/999" })).statusCode).toBe(404);
  });
});
