import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { score, agree, pick, ROUNDS, AGREE_KM } from "./game.js";
import { buildApp, type WaysakeApp } from "./app.js";

describe("règles du jeu « Où était-ce ? »", () => {
  it("score : 5 000 au point exact, environ 1 840 à 300 km, presque rien à 2 000 km", () => {
    expect(score(0)).toBe(5000);
    expect(score(300)).toBe(1839);
    expect(score(2000)).toBeLessThan(10);
    expect(score(50)).toBeGreaterThan(score(51));
  });

  it("accord en Enquête : deux épingles à moins de 25 km", () => {
    expect(AGREE_KM).toBe(25);
    expect(agree({ lat: 46.3683, lon: 14.1146 }, { lat: 46.42, lon: 14.0 })).toBe(true); // Bled ↔ près de Radovljica
    expect(agree({ lat: 46.3683, lon: 14.1146 }, { lat: 46.0569, lon: 14.5058 })).toBe(false); // Bled ↔ Ljubljana
  });

  it("tire 10 photos au plus, sans doublon, de façon reproductible avec le même hasard", () => {
    const ids = Array.from({ length: 40 }, (_, i) => i + 1);
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const a = pick(ids, rng);
    expect(a).toHaveLength(ROUNDS);
    expect(new Set(a).size).toBe(ROUNDS);
    expect(pick([1, 2, 3], Math.random).sort()).toEqual([1, 2, 3]);
  });
});

describe("API du jeu", () => {
  let app: WaysakeApp;
  const alex = { "x-atlas-user": "alex" };
  const sam = { "x-atlas-user": "sam" };
  const ins = (id: number, local: string, lat: number | null, lon: number | null) =>
    app.waysake.db
      .prepare(`INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs, location_source)
                VALUES (?, ?, 'photo', 'x', 'x.jpg', 'image/jpeg', 1, 4, 3, ?, ?, ?, ?, 'alex', 0, 1, ?)`)
      .run(id, `s${id}`, Date.parse(`${local}Z`), local, lat, lon, lat === null ? null : "exif");
  const post = (url: string, payload: unknown, headers = alex) => app.inject({ method: "POST", url, headers, payload: payload as object });
  const get = (url: string, headers = alex) => app.inject({ url, headers });

  beforeEach(async () => {
    app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
    // 12 photos localisées à Bled (Défi), et une journée sans lieu à Piran, en deux photos d'un même moment (Enquête).
    for (let i = 1; i <= 12; i++) ins(i, `2026-09-0${1 + (i % 5)}T1${i % 10}:00:00`, 46.3683, 14.1146);
    ins(20, "2026-08-10T10:00:00", null, null);
    ins(21, "2026-08-10T10:20:00", null, null);
    app.waysake.rebuild();
  });

  it("Défi : 10 photos, le lieu reste caché jusqu'à l'épingle, puis les points", async () => {
    const created = await post("/api/games", { mode: "defi" });
    expect(created.statusCode).toBe(200);
    const { id } = created.json();
    const game = (await get(`/api/games/${id}`)).json();
    expect(game.mode).toBe("defi");
    expect(game.rounds).toHaveLength(10);
    expect(game.rounds[0].answer).toBeNull(); // caché
    expect(JSON.stringify(game.rounds[0].media)).not.toMatch(/46\.36/);

    const guess = await post(`/api/games/${id}/guess`, { round: 0, lat: 46.36, lon: 14.11 });
    expect(guess.json()).toMatchObject({ points: expect.any(Number), km: expect.any(Number) });
    expect(guess.json().points).toBeGreaterThan(4900);
    const after = (await get(`/api/games/${id}`)).json();
    expect(after.rounds[0].answer).toEqual({ lat: 46.3683, lon: 14.1146 });
    expect(after.rounds[0].guesses).toEqual([expect.objectContaining({ userId: "alex", points: guess.json().points })]);
    expect(after.scores).toEqual([{ userId: "alex", points: guess.json().points, rounds: 1 }]);

    // Une seule épingle par manche et par personne ; l'autre voit le lieu seulement après la sienne.
    expect((await post(`/api/games/${id}/guess`, { round: 0, lat: 0, lon: 0 })).statusCode).toBe(409);
    expect((await get(`/api/games/${id}`, sam)).json().rounds[0]).toMatchObject({ answer: null, guesses: [] });
  });

  it("refuse une épingle hors des clous", async () => {
    const { id } = (await post("/api/games", { mode: "defi" })).json();
    expect((await post(`/api/games/${id}/guess`, { round: 10, lat: 1, lon: 1 })).statusCode).toBe(400);
    expect((await post(`/api/games/${id}/guess`, { round: 0, lat: 91, lon: 1 })).statusCode).toBe(400);
    expect((await post(`/api/games/999/guess`, { round: 0, lat: 1, lon: 1 })).statusCode).toBe(404);
    expect((await post("/api/games", { mode: "poker" })).statusCode).toBe(400);
  });

  it("Enquête : la proposition, puis l'accord de l'autre à moins de 25 km, localise la photo et tout son moment", async () => {
    const { id } = (await post("/api/games", { mode: "enquete" })).json();
    const game = (await get(`/api/games/${id}`)).json();
    // Une photo par moment : localiser le moment éclaire toutes ses photos.
    expect(game.rounds).toHaveLength(1);
    expect([20, 21]).toContain(game.rounds[0].media.id);
    const round = 0;

    const first = (await post(`/api/games/${id}/guess`, { round, lat: 45.528, lon: 13.568 })).json(); // Piran
    expect(first).toMatchObject({ status: "proposed", points: 0 });
    const second = (await post(`/api/games/${id}/guess`, { round, lat: 45.53, lon: 13.6 }, sam)).json();
    expect(second).toMatchObject({ status: "agreed", points: 100 });

    const rows = app.waysake.db.prepare("SELECT id, lat, lon, location_source FROM media WHERE id IN (20, 21) ORDER BY id").all();
    expect(rows).toEqual([
      { id: 20, lat: 45.528, lon: 13.568, location_source: "game" },
      { id: 21, lat: 45.528, lon: 13.568, location_source: "game" },
    ]);
    const after = (await get(`/api/games/${id}`)).json();
    expect(after.rounds[round].status).toBe("agreed");
    expect(after.scores).toEqual([
      { userId: "alex", points: 300, rounds: 1 },
      { userId: "sam", points: 100, rounds: 1 },
    ]);
  });

  it("Enquête : en désaccord, rien n'est enregistré", async () => {
    const { id } = (await post("/api/games", { mode: "enquete" })).json();
    await post(`/api/games/${id}/guess`, { round: 0, lat: 45.528, lon: 13.568 });
    const second = (await post(`/api/games/${id}/guess`, { round: 0, lat: 46.05, lon: 14.5 }, sam)).json();
    expect(second).toMatchObject({ status: "disagreed", points: 0 });
    expect(app.waysake.db.prepare("SELECT COUNT(*) AS n FROM media WHERE id IN (20, 21) AND lat IS NOT NULL").get()).toEqual({ n: 0 });
  });

  it("liste des parties et record de chacun en Défi", async () => {
    const { id } = (await post("/api/games", { mode: "defi" })).json();
    for (let r = 0; r < 10; r++) await post(`/api/games/${id}/guess`, { round: r, lat: 46.3683, lon: 14.1146 });
    const list = (await get("/api/games")).json();
    expect(list.games[0]).toMatchObject({ id, mode: "defi", done: true });
    expect(list.records).toEqual([{ userId: "alex", points: 50000, gameId: id }]);
  });

  it("pas assez de photos : un message clair", async () => {
    app.waysake.db.prepare("UPDATE media SET lat = 1, lon = 1, location_source = 'exif' WHERE id IN (20, 21)").run();
    const res = await post("/api/games", { mode: "enquete" });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("no_photos_for_game");
  });
});
