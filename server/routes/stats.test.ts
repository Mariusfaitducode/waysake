import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type WaysakeApp } from "../app.js";

const PASSWORD = "carnet de route 2026";
let app: WaysakeApp;
let dir: string;

const ins = (id: number, user: string, uploadedAt: number, kind = "photo", bytes = 1000, lat: number | null = 46.37) =>
  app.waysake.db
    .prepare(
      `INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs)
       VALUES (?, ?, ?, 'x', 'x.jpg', 'image/jpeg', ?, 4, 3, ?, '2026-09-05T10:00:00', ?, ?, ?, ?, 1)`,
    )
    .run(id, `s${id}`, kind, bytes, Date.parse("2026-09-05T10:00:00Z") + id * 60_000, lat, lat === null ? null : 14.11, user, uploadedAt);

async function start(password?: string) {
  await app?.close();
  app = await buildApp({ dataDir: dir, password });
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "waysake-stats-"));
  app = undefined as unknown as WaysakeApp;
  await start();
});
afterEach(async () => {
  await app?.close();
});

describe("GET /api/stats/overview", () => {
  it("rassemble envois, personnes, sauvegarde, trafic, accès et application", async () => {
    ins(1, "alex", Date.parse("2026-08-02T10:00:00Z"));
    ins(2, "alex", Date.parse("2026-09-02T10:00:00Z"), "video", 9000);
    ins(3, "sam", Date.parse("2026-09-03T10:00:00Z"), "photo", 1000, null);
    app.waysake.rebuild();
    app.waysake.db.prepare("INSERT INTO reaction (media_id, user_id, emoji, created_at) VALUES (1, 'sam', '❤️', 0)").run();
    mkdirSync(join(dir, "backups"), { recursive: true });
    writeFileSync(join(dir, "backups", "atlas-2026-10-04.db"), "x");

    // Un peu de trafic : une liste et un original, puis la page elle-même.
    await app.inject({ url: "/api/trips", headers: { "x-atlas-user": "alex" } });
    const res = await app.inject({ url: "/api/stats/overview", headers: { "x-atlas-user": "sam" } });
    expect(res.statusCode).toBe(200);
    const s = res.json();

    expect(s.uploads.totals).toEqual({ photos: 2, videos: 1, bytes: 11_000 });
    expect(s.uploads.months[0]).toEqual({ month: "2026-08", total: 1, byUser: { alex: 1 } });
    expect(s.uploads.months[1]).toEqual({ month: "2026-09", total: 2, byUser: { alex: 1, sam: 1 } });
    const alex = s.people.find((p: { userId: string }) => p.userId === "alex");
    expect(alex).toMatchObject({ photos: 1, videos: 1, bytes: 10_000, reactions: 0, share: 67 });
    expect(s.people.find((p: { userId: string }) => p.userId === "sam")).toMatchObject({ reactions: 1, share: 33 });

    expect(s.backup).toMatchObject({ snapshots: 1, external: null });
    expect(s.backup.lastSnapshotAt).toBeGreaterThan(0);

    expect(s.traffic.days).toHaveLength(7);
    expect(s.traffic.days.at(-1).requests).toBeGreaterThanOrEqual(1);
    expect(s.traffic.people.map((p: { userId: string }) => p.userId)).toContain("alex");
    expect(s.traffic.since).toBeGreaterThan(0);

    expect(s.access).toEqual({
      password: false,
      users: [
        { id: "alex", name: "Alex", color: expect.any(String) },
        { id: "sam", name: "Sam", color: expect.any(String) },
      ],
      devices: null,
    });

    expect(s.app.node).toBe(process.version);
    expect(s.app.startedAt).toBeGreaterThan(0);
    expect(s.app.uptime).toBeGreaterThanOrEqual(0);
    expect(s.app.database).toBeGreaterThan(0);
    expect(s.app.library).toMatchObject({ trips: 1, chapters: 1, countries: 1 });
    expect(s.app.library.unlocated).toBe((await app.inject({ url: "/api/unlocated" })).json().total); // même compte que « À localiser »
    expect(JSON.stringify(s)).not.toContain(dir); // jamais de chemin de la machine hôte
  });

  it("compte les envois reçus et le volume des originaux servis", async () => {
    mkdirSync(join(dir, "x"), { recursive: true });
    writeFileSync(join(dir, "x", "1.jpg"), Buffer.alloc(5000));
    app.waysake.db
      .prepare(
        `INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, uploaded_by, uploaded_at) VALUES (1, 's1', 'photo', 'x/1.jpg', '1.jpg', 'image/jpeg', 5000, 'alex', 0)`,
      )
      .run();
    expect((await app.inject({ url: "/api/media/1/original" })).statusCode).toBe(200);
    const s = (await app.inject({ url: "/api/stats/overview" })).json();
    expect(s.traffic.served.photos).toBe(5000);
  });

  it("n'écrase pas GET /api/stats", async () => {
    ins(1, "alex", 0);
    expect((await app.inject({ url: "/api/stats" })).json()).toEqual({ photos: 1, videos: 0 });
  });
});

describe("avec le mot de passe du foyer", () => {
  beforeEach(async () => {
    await start(PASSWORD);
  });

  it("401 sans session", async () => {
    const res = await app.inject({ url: "/api/stats/overview" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("nombre d'appareils connectés et date de la plus récente, jamais un jeton ni une empreinte", async () => {
    const login = await app.inject({ method: "POST", url: "/api/login", payload: { password: PASSWORD } });
    const token = login.cookies.find((c) => c.name === "atlas_session")!.value;
    await app.inject({ method: "POST", url: "/api/login", payload: { password: PASSWORD } });
    const res = await app.inject({ url: "/api/stats/overview", headers: { cookie: `atlas_session=${token}` } });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.access.password).toBe(true);
    expect(s.access.devices.count).toBe(2);
    expect(s.access.devices.latestAt).toBeGreaterThan(0);
    const hashes = app.waysake.db.prepare("SELECT token_hash FROM session").all() as { token_hash: string }[];
    for (const h of hashes) expect(res.body).not.toContain(h.token_hash);
    expect(res.body).not.toContain(token);
    expect(res.body).not.toContain(PASSWORD);
    expect(res.body).not.toMatch(/token|hash/i);
    expect(res.body).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/); // aucune adresse IP
  });
});
