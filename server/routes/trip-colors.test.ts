import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildApp, type WaysakeApp } from "../app.js";
import { derivedPath } from "../ingest.js";
import { insertDemoMedia } from "../../test/demo-db.js";
import { TRIP_COLOR_IDS } from "../trip-palette.js";

let app: WaysakeApp;
let dataDir: string;
const cookie = { cookie: "atlas_user=sam" };
const get = async (url: string) => (await app.inject({ url, headers: cookie })).json();
const send = (method: "PUT" | "PATCH", url: string, payload?: object) => app.inject({ method, url, payload, headers: cookie });
const trips = async () => (await get("/api/trips")) as { id: number; slug: string; title: string; coverMediaId: number; color: string; colorAuto: boolean; autoColor: string }[];
const byTitle = async (title: string) => (await trips()).find((t) => t.title === title)!;
const settle = () => app.waysake.colors.idle();

/** Miniature unie (fond + bande plus sombre) à l'emplacement où l'ingestion l'aurait écrite. */
async function thumb(mediaId: number, color: string) {
  mkdirSync(join(dataDir, "derived"), { recursive: true });
  await sharp({ create: { width: 400, height: 266, channels: 3, background: color } })
    .composite([{ input: { create: { width: 400, height: 60, channels: 3, background: "#1a1a1a" } }, top: 206, left: 0 }])
    .webp()
    .toFile(derivedPath(dataDir, `sha-${mediaId}`, 400));
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "waysake-"));
  dataDir = join(dir, "data");
  app = await buildApp({ dataDir });
  insertDemoMedia(app.waysake.db);
  app.waysake.rebuild();
  await settle();
});

describe("couleur des voyages", () => {
  it("chaque voyage a une couleur de la palette, automatique par défaut", async () => {
    for (const t of await trips()) {
      expect(TRIP_COLOR_IDS).toContain(t.color);
      expect(t).toMatchObject({ colorAuto: true, autoColor: t.color });
    }
    const detail = await get(`/api/trips/${(await trips())[0].slug}`);
    expect(detail).toMatchObject({ color: expect.any(String), colorAuto: true });
  });

  it("extrait la couleur de la couverture, sans donner deux fois la même teinte", async () => {
    const list = await trips();
    const palette: Record<string, string> = { Berlin: "#2E6FB8", Amsterdam: "#2B78C0", "Îles Canaries": "#E0705A" };
    for (const t of list) await thumb(t.coverMediaId, palette[t.title] ?? "#8C8C8A");
    app.waysake.colors.schedule();
    await settle();
    const after = Object.fromEntries((await trips()).map((t) => [t.title, t.color]));
    expect(after["Îles Canaries"]).toBe("coral");
    // Amsterdam (avril 2024) est plus ancien que Berlin (novembre 2024) : il garde Azur, Berlin prend une voisine.
    expect(after.Amsterdam).toBe("azure");
    expect(["lagoon", "indigo"]).toContain(after.Berlin);
    const gray = list.filter((t) => !palette[t.title]).map((t) => after[t.title]);
    expect(new Set(Object.values(after)).size).toBe(list.length);
    expect(gray).toContain("slate");
  });

  it("recalcule quand la couverture change", async () => {
    const t = await get("/api/trips/italie-slovenie-croatie-2026");
    const other = t.chapters[1].media[0].id as number;
    await thumb(t.coverMediaId, "#E0705A");
    await thumb(other, "#3F7A2A");
    app.waysake.colors.schedule();
    await settle();
    expect((await byTitle(t.title)).color).toBe("coral");
    expect((await send("PATCH", `/api/trips/${t.slug}`, { coverMediaId: other })).statusCode).toBe(200);
    await settle();
    expect(["moss", "pine"]).toContain((await byTitle(t.title)).color);
  });

  it("PUT choisit une couleur, ou revient à « Automatique »", async () => {
    const { slug, autoColor } = (await trips())[0];
    const res = await send("PUT", `/api/trips/${slug}/color`, { color: "raspberry" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ color: "raspberry", colorAuto: false, autoColor });
    expect((await get(`/api/trips/${slug}`)).color).toBe("raspberry");
    await settle();

    const back = await send("PUT", `/api/trips/${slug}/color`, { color: null });
    expect(back.json()).toMatchObject({ colorAuto: true });
    await settle();
    expect((await trips())[0]).toMatchObject({ colorAuto: true, color: (await trips())[0].autoColor });
  });

  it("refuse une couleur inconnue et un voyage inconnu", async () => {
    const { slug } = (await trips())[0];
    for (const color of ["vert-autoroute", "#2D8D64", 3, undefined]) {
      const res = await send("PUT", `/api/trips/${slug}/color`, { color });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("invalid_color");
    }
    expect((await send("PUT", "/api/trips/inconnu/color", { color: "coral" })).statusCode).toBe(404);
  });

  it("expose la palette", async () => {
    const palette = await get("/api/trip-colors");
    expect(palette.map((c: { id: string }) => c.id)).toEqual(TRIP_COLOR_IDS);
  });
});
