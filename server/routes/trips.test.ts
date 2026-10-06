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
const send = (method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: cookie });

describe("voyages", () => {
  it("liste les voyages, du plus récent au plus ancien", async () => {
    const trips = await get("/api/trips");
    expect(trips.map((t: any) => t.title)[0]).toBe("Italie, Slovénie & Croatie");
    expect(trips[0]).toMatchObject({ slug: "italie-slovenie-croatie-2026", countryCodes: ["IT", "SI", "HR"], cover: expect.stringMatching(/\/thumb$/) });
  });

  it("détaille un voyage avec étapes, médias, itinéraire et notes", async () => {
    const t = await get("/api/trips/italie-slovenie-croatie-2026");
    expect(t.chapters.map((c: any) => c.title)).toEqual(["Italie", "Dolomites", "Slovénie", "Croatie"]);
    expect(t.chapters[0].media[0]).toMatchObject({ thumb: expect.any(String), place: "Venise" });
    expect(t.route.length).toBeGreaterThan(10);
    expect(t.notes).toEqual([]);
    expect((await app.inject({ url: "/api/trips/inconnu" })).statusCode).toBe(404);
  });

  it("renomme, change la couverture et fusionne", async () => {
    const t = await get("/api/trips/italie-slovenie-croatie-2026");
    expect((await send("PATCH", `/api/trips/${t.slug}`, { title: "Été 2026", coverMediaId: t.chapters[1].media[2].id })).statusCode).toBe(200);
    expect((await send("PATCH", `/api/chapters/${t.chapters[2].id}`, { title: "Lacs slovènes" })).statusCode).toBe(200);
    expect((await send("POST", `/api/chapters/${t.chapters[3].id}/merge-previous`)).statusCode).toBe(200);
    const after = await get(`/api/trips/${t.slug}`);
    expect(after.title).toBe("Été 2026");
    expect(after.coverMediaId).toBe(t.chapters[1].media[2].id);
    expect(after.chapters.map((c: any) => c.title)).toEqual(["Italie", "Dolomites", "Lacs slovènes"]);
  });

  it("refuse une couverture qui n'appartient pas au voyage", async () => {
    const berlin = (await get("/api/trips")).find((t: any) => t.title === "Berlin");
    expect((await send("PATCH", "/api/trips/italie-slovenie-croatie-2026", { coverMediaId: berlin.coverMediaId })).statusCode).toBe(400);
  });
});

describe("étapes du globe", () => {
  it("donne chaque étape avec sa position, la couleur du voyage et une à trois vignettes", async () => {
    const stops = await get("/api/globe/stops");
    const t = await get("/api/trips/italie-slovenie-croatie-2026");
    const mine = stops.filter((s: any) => s.tripSlug === t.slug);
    expect(mine.map((s: any) => s.chapterId)).toEqual(t.chapters.map((c: any) => c.id));
    expect(mine[0]).toEqual({
      tripSlug: t.slug,
      color: t.color,
      chapterId: t.chapters[0].id,
      title: t.chapters[0].title,
      lat: t.chapters[0].centerLat,
      lon: t.chapters[0].centerLon,
      thumbs: expect.any(Array),
    });
    for (const s of stops) {
      expect(s.thumbs.length).toBeGreaterThanOrEqual(1);
      expect(s.thumbs.length).toBeLessThanOrEqual(3);
      for (const u of s.thumbs) expect(u).toMatch(/^\/api\/media\/\d+\/thumb$/);
    }
  });

  it("met en premier la photo la plus réagie de l'étape", async () => {
    const t = await get("/api/trips/italie-slovenie-croatie-2026");
    const fav = t.chapters[1].media.at(-1).id;
    expect((await send("POST", `/api/media/${fav}/reactions`, { emoji: "❤️", on: true })).statusCode).toBe(200);
    const stop = (await get("/api/globe/stops")).find((s: any) => s.chapterId === t.chapters[1].id);
    expect(stop.thumbs[0]).toBe(`/api/media/${fav}/thumb`);
  });
});

describe("pays et vue d'ensemble", () => {
  it("liste les pays découverts avec drapeau et première visite", async () => {
    const countries = await get("/api/countries");
    expect(countries.map((c: any) => c.code).sort()).toEqual(["DE", "ES", "HR", "IT", "NL", "SI"]);
    const it = countries.find((c: any) => c.code === "IT");
    expect(it).toMatchObject({ name: "Italie", flag: "🇮🇹", trips: 2, firstVisit: expect.any(Number) });
    expect(it.photos).toBeGreaterThan(20);
  });

  it("résume les compteurs", async () => {
    const o = await get("/api/overview");
    expect(o).toMatchObject({ countries: 6, trips: 5, photos: 162, videos: 0 });
    expect(o.km).toBeGreaterThan(1000);
  });

  it("sert les pays en GeoJSON", async () => {
    const res = await app.inject({ url: "/api/geo/countries.geojson" });
    expect(res.json().features.length).toBeGreaterThan(150);
    expect(res.headers["cache-control"]).toMatch(/max-age/);
  });
});

describe("carnet", () => {
  it("enregistre, met à jour puis efface une note de voyage et d'étape", async () => {
    const t = await get("/api/trips/italie-slovenie-croatie-2026");
    await send("PUT", "/api/notes", { tripId: t.id, body: "Le meilleur voyage." });
    await send("PUT", "/api/notes", { tripId: t.id, body: "Le meilleur voyage de notre vie." });
    await send("PUT", "/api/notes", { tripId: t.id, chapterId: t.chapters[1].id, body: "Lever de soleil à Braies." });
    let notes = (await get(`/api/trips/${t.slug}`)).notes;
    expect(notes).toHaveLength(2);
    expect(notes.find((n: any) => n.chapterId === null)).toMatchObject({ body: "Le meilleur voyage de notre vie.", author: "sam" });
    await send("PUT", "/api/notes", { tripId: t.id, body: "  " });
    notes = (await get(`/api/trips/${t.slug}`)).notes;
    expect(notes.map((n: any) => n.chapterId)).toEqual([t.chapters[1].id]);
  });

  it("liste toutes les notes avec leur voyage, la plus récente d'abord", async () => {
    const t = await get("/api/trips/italie-slovenie-croatie-2026");
    await send("PUT", "/api/notes", { tripId: t.id, body: "Voyage" });
    await send("PUT", "/api/notes", { tripId: t.id, chapterId: t.chapters[1].id, body: "Braies" });
    const notes = await get("/api/notes");
    expect(notes[0]).toMatchObject({ body: "Braies", trip: { slug: t.slug, title: t.title }, chapterTitle: "Dolomites", author: "sam" });
    expect(notes[1]).toMatchObject({ body: "Voyage", chapterTitle: null });
  });

  it("gère les envies : ajout, réalisation, suppression", async () => {
    const created = await send("POST", "/api/wishes", { title: "Lisbonne", countryCode: "PT", lat: 38.72, lon: -9.14, month: "2027-05", note: "Les pastéis" });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    const trip = (await get("/api/trips"))[0];
    await send("PATCH", `/api/wishes/${id}`, { doneTripSlug: trip.slug });
    let wishes = await get("/api/wishes");
    expect(wishes[0]).toMatchObject({ title: "Lisbonne", flag: "🇵🇹", month: "2027-05", done: true, doneTrip: { slug: trip.slug } });
    await send("PATCH", `/api/wishes/${id}`, { done: false });
    expect((await get("/api/wishes"))[0].done).toBe(false);
    await send("DELETE", `/api/wishes/${id}`);
    wishes = await get("/api/wishes");
    expect(wishes).toEqual([]);
  });

  it("valide les envies : un code pays ou des coordonnées invalides ne peuvent pas casser la liste", async () => {
    expect((await send("POST", "/api/wishes", { title: "X", countryCode: "ZZZZ" })).statusCode).toBe(400);
    expect((await send("POST", "/api/wishes", { title: "X", countryCode: "12" })).statusCode).toBe(400);
    expect((await send("POST", "/api/wishes", { title: "X", lat: 200, lon: 0 })).statusCode).toBe(400);
    expect((await send("POST", "/api/wishes", { title: "X", lat: "abc", lon: 0 })).statusCode).toBe(400);
    expect((await send("POST", "/api/wishes", { title: { a: 1 } })).statusCode).toBe(400);
    expect((await send("POST", "/api/wishes", { title: "X", note: 42 })).statusCode).toBe(400);
    // même une ligne corrompue en base n'empêche pas d'afficher les envies
    app.waysake.db.prepare("INSERT INTO wish (title, country_code, author, created_at) VALUES ('Y', '??', 'alex', 0)").run();
    const res = await app.inject({ url: "/api/wishes" });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].flag).toBeNull();
  });

  it("valide les notes", async () => {
    expect((await send("PUT", "/api/notes", { tripId: "1 OR 1", body: "x" })).statusCode).toBe(400);
    expect((await send("PUT", "/api/notes", { tripId: 1, body: { x: 1 } })).statusCode).toBe(400);
  });

  it("refuse une envie sans titre", async () => {
    expect((await send("POST", "/api/wishes", { title: " " })).statusCode).toBe(400);
  });

  it("cherche un lieu hors ligne", async () => {
    const hits = await get("/api/places?q=lisb");
    expect(hits[0]).toMatchObject({ countryCode: "PT", flag: "🇵🇹" });
  });
});

describe("liens courts (badges NFC)", () => {
  it("/v/:slug sert l'application", async () => {
    const res = await app.inject({ url: "/v/italie-slovenie-croatie-2026" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>Waysake</title>");
  });
});
