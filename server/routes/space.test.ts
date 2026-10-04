import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type WaysakeApp } from "../app.js";
import { makeJpeg } from "../../test/fixtures.js";
import { ingest } from "../ingest.js";

let app: WaysakeApp;
let dir: string;
const user = { "x-atlas-user": "alex" };
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "waysake-"));
  app = await buildApp({ dataDir: dir });
});
afterEach(async () => {
  await app.close();
});

describe("GET /api/space", () => {
  it("espace libre du disque, place prise par Waysake, rythme et débit", async () => {
    await ingest(app.waysake.db, dir, { name: "a.jpg", data: await makeJpeg({ takenAt: "2026:09:01 10:00:00" }), userId: "alex" });
    const res = await app.inject({ method: "GET", url: "/api/space" });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.disk.free).toBeGreaterThan(0);
    expect(s.disk.total).toBeGreaterThanOrEqual(s.disk.free);
    expect(s.used.originals).toBeGreaterThan(0);
    expect(s.used.total).toBeGreaterThanOrEqual(s.used.originals + s.used.derived);
    expect(s.used.derived).toBeGreaterThan(0);
    expect(s.average.photo).toBeGreaterThan(0);
    expect(s.uploadRate).toMatchObject({ measured: false });
    expect(s.monthly.bytes).toBeGreaterThanOrEqual(0);
    expect(s).toHaveProperty("forecast");
  });
});

describe("POST /api/media/known", () => {
  it("dit, pour chaque élément du téléphone, s'il est déjà dans Waysake", async () => {
    await ingest(app.waysake.db, dir, { name: "IMG_1.jpg", data: await makeJpeg({ takenAt: "2026:09:01 10:00:00" }), userId: "alex" });
    const res = await app.inject({
      method: "POST",
      url: "/api/media/known",
      headers: user,
      payload: { items: [{ name: "IMG_1.jpg", takenAt: Date.UTC(2026, 8, 1, 8) }, { name: "IMG_2.jpg", takenAt: Date.UTC(2026, 8, 1, 8) }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ known: [true, false] });
  });

  it("refuse une liste invalide ou trop longue, avec un code", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/media/known", headers: user, payload: { items: [{ name: 3 }] } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("invalid_items");
    const many = Array.from({ length: 5001 }, () => ({ name: "a.jpg", takenAt: 0 }));
    expect((await app.inject({ method: "POST", url: "/api/media/known", headers: user, payload: { items: many } })).statusCode).toBe(400);
  });
});

describe("POST /api/uploads/rate", () => {
  it("garde le débit mesuré par le téléphone", async () => {
    const res = await app.inject({ method: "POST", url: "/api/uploads/rate", headers: user, payload: { bytes: 50e6, ms: 10_000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ bytesPerSecond: 5e6, measured: true });
    expect((await app.inject({ method: "GET", url: "/api/space" })).json().uploadRate).toEqual({ bytesPerSecond: 5e6, measured: true });
  });
  it("ignore une mesure trop courte ou absurde", async () => {
    for (const payload of [{ bytes: 1e6, ms: 200 }, { bytes: -1, ms: 5000 }, { bytes: "x", ms: 5000 }]) {
      const res = await app.inject({ method: "POST", url: "/api/uploads/rate", headers: user, payload });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("invalid_rate");
    }
  });
});

describe("mot de passe", () => {
  it("protège l'espace disque, la déduplication et le débit", async () => {
    await app.close();
    app = await buildApp({ dataDir: dir, password: "secret du foyer" });
    expect((await app.inject({ method: "GET", url: "/api/space" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/media/known", headers: user, payload: { items: [] } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/uploads/rate", headers: user, payload: { bytes: 1e7, ms: 5000 } })).statusCode).toBe(401);
    const ok = await app.inject({ method: "GET", url: "/api/space", headers: { authorization: "Bearer secret du foyer" } });
    expect(ok.statusCode).toBe(200);
  });
});
