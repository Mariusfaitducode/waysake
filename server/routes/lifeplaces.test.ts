import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type WaysakeApp } from "../app.js";
import { insertDemoMedia } from "../../test/demo-db.js";

let app: WaysakeApp;
const cookie = { cookie: "atlas_user=sam" };
beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "waysake-"));
  const web = join(dir, "web");
  mkdirSync(web);
  writeFileSync(join(web, "index.html"), "<!doctype html><title>Waysake</title>");
  app = await buildApp({ dataDir: join(dir, "data"), webDir: web });
  insertDemoMedia(app.waysake.db);
  app.waysake.rebuild();
});
const get = async (url: string) => (await app.inject({ url, headers: cookie })).json();
const send = (method: "POST" | "PATCH", url: string, payload?: object, headers: Record<string, string> = cookie) =>
  app.inject({ method, url, payload, headers });

describe("lieux de vie", () => {
  it("liste les lieux actifs avec couverture et nombre de périodes", async () => {
    const places = await get("/api/places-of-life");
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      slug: "paris", title: "Paris", autoTitle: "Paris", status: "auto", periods: 3,
      mediaCount: expect.any(Number), startAt: expect.any(Number), endAt: expect.any(Number),
      lat: expect.any(Number), lon: expect.any(Number),
      cover: expect.stringMatching(/\/thumb$/), coverLarge: expect.stringMatching(/\/preview$/),
    });
  });

  it("détaille un lieu : périodes de la plus récente à la plus ancienne, médias avec réactions", async () => {
    const p = await get("/api/places-of-life/paris");
    expect(p.periods).toHaveLength(3);
    const starts = p.periods.map((x: any) => x.startAt);
    expect([...starts].sort((a: number, b: number) => b - a)).toEqual(starts);
    expect(p.periods[0]).toMatchObject({ count: p.periods[0].media.length, startAt: expect.any(Number), endAt: expect.any(Number) });
    expect(p.periods[0].media[0]).toMatchObject({ thumb: expect.any(String), preview: expect.any(String), reactions: {}, note: null, place: "Paris" });
    expect((await app.inject({ url: "/api/places-of-life/inconnu" })).json()).toMatchObject({ code: "place_not_found" });
  });

  it("renomme et change la couverture ; le lien et le nom survivent au recalcul", async () => {
    const p = await get("/api/places-of-life/paris");
    const cover = p.periods[2].media[0].id;
    expect((await send("PATCH", "/api/places-of-life/paris", { title: "Chez nous", coverMediaId: cover })).statusCode).toBe(200);
    app.waysake.rebuild();
    expect(await get("/api/places-of-life/paris")).toMatchObject({ slug: "paris", title: "Chez nous", autoTitle: "Paris", coverMediaId: cover });
  });

  it("refuse une couverture étrangère, un statut inconnu, et toute écriture sans profil", async () => {
    const berlin = (await get("/api/trips")).find((t: any) => t.title === "Berlin");
    expect((await send("PATCH", "/api/places-of-life/paris", { coverMediaId: berlin.coverMediaId })).json()).toMatchObject({ code: "cover_not_in_place" });
    expect((await send("PATCH", "/api/places-of-life/paris", { status: "auto" })).json()).toMatchObject({ code: "invalid_status" });
    expect((await send("PATCH", "/api/places-of-life/inconnu", { title: "x" })).statusCode).toBe(404);
    expect((await send("PATCH", "/api/places-of-life/paris", { title: "x" }, {})).statusCode).toBe(401);
    expect((await send("POST", `/api/trips/${berlin.slug}/to-place-of-life`, {}, {})).statusCode).toBe(401);
  });

  it("« Ce n'est pas un lieu de vie » : les photos reviennent aux voyages", async () => {
    const before = (await get("/api/trips")).length;
    expect((await send("PATCH", "/api/places-of-life/paris", { status: "rejected" })).statusCode).toBe(200);
    expect(await get("/api/places-of-life")).toEqual([]);
    const trips = await get("/api/trips");
    expect(trips.length).toBe(before + 3);
    expect(trips.filter((t: any) => t.title === "Paris")).toHaveLength(3);
  });

  it("transforme un voyage en lieu de vie, puis arrive sur le lieu", async () => {
    const berlin = (await get("/api/trips")).find((t: any) => t.title === "Berlin");
    const res = await send("POST", `/api/trips/${berlin.slug}/to-place-of-life`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ slug: "berlin" });
    expect((await get("/api/trips")).some((t: any) => t.title === "Berlin")).toBe(false);
    expect(await get("/api/places-of-life/berlin")).toMatchObject({ title: "Berlin", status: "confirmed", mediaCount: berlin.mediaCount });
    app.waysake.rebuild();
    expect((await get("/api/places-of-life")).map((p: any) => p.slug).sort()).toEqual(["berlin", "paris"]);
    expect((await send("POST", "/api/trips/inconnu/to-place-of-life")).json()).toMatchObject({ code: "trip_not_found" });
  });
});
