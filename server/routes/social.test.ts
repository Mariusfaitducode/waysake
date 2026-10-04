import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type WaysakeApp } from "../app.js";

let app: WaysakeApp;
const alex = { "x-atlas-user": "alex" };
const sam = { "x-atlas-user": "sam" };
const ins = (id: number, local: string, lat: number, lon: number, width = 4, height = 3) =>
  app.waysake.db
    .prepare(`INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs, location_source)
              VALUES (?, ?, 'photo', 'x', 'x.jpg', 'image/jpeg', 1, ?, ?, ?, ?, ?, ?, 'alex', 0, 1, 'exif')`)
    .run(id, `s${id}`, width, height, Date.parse(`${local}Z`), local, lat, lon);

const react = (id: number, emoji: string, on: boolean, who = alex) =>
  app.inject({ method: "POST", url: `/api/media/${id}/reactions`, headers: who, payload: { emoji, on } });
const note = (id: number, text: string, who = alex) => app.inject({ method: "PUT", url: `/api/media/${id}/note`, headers: who, payload: { text } });
const trip = async () => {
  const [t] = (await app.inject({ url: "/api/trips" })).json();
  return { summary: t, detail: (await app.inject({ url: `/api/trips/${t.slug}` })).json() };
};

beforeEach(async () => {
  app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "atlas-")) });
  // Un week-end à Bled (Slovénie) : 4 photos.
  ins(1, "2026-09-05T10:00:00", 46.3683, 14.1146);
  ins(2, "2026-09-05T11:00:00", 46.3683, 14.1146);
  ins(3, "2026-09-06T10:00:00", 46.3683, 14.1146);
  ins(4, "2026-09-06T12:00:00", 46.3683, 14.1146);
  app.waysake.rebuild();
});

describe("réactions", () => {
  it("ajoute et retire une réaction, une de chaque au plus par personne", async () => {
    expect((await react(2, "❤️", true)).json()).toEqual({ reactions: { "❤️": ["alex"] }, note: null });
    await react(2, "❤️", true); // deux fois : toujours une seule
    await react(2, "❤️", true, sam);
    expect((await react(2, "😂", true, sam)).json().reactions).toEqual({ "❤️": ["alex", "sam"], "😂": ["sam"] });
    expect((await react(2, "❤️", false)).json().reactions).toEqual({ "❤️": ["sam"], "😂": ["sam"] });
  });

  it("refuse une réaction inconnue, une photo inconnue, et sans profil", async () => {
    expect((await react(2, "💩", true)).statusCode).toBe(400);
    expect((await react(2, "❤️", "oui" as unknown as boolean)).statusCode).toBe(400);
    expect((await react(99, "❤️", true)).statusCode).toBe(404);
    const anonymous = await app.inject({ method: "POST", url: "/api/media/2/reactions", payload: { emoji: "❤️", on: true } });
    expect(anonymous.statusCode).toBe(401);
  });

  it("apparaît dans la photothèque et dans le voyage", async () => {
    await react(3, "🤩", true, sam);
    await note(3, "Le lac au réveil");
    const lib = (await app.inject({ url: "/api/media" })).json();
    expect(lib.items.find((m: any) => m.id === 3)).toMatchObject({ reactions: { "🤩": ["sam"] }, note: "Le lac au réveil" });
    expect(lib.items.find((m: any) => m.id === 1)).toMatchObject({ reactions: {}, note: null });
    const { detail } = await trip();
    expect(detail.chapters[0].media.find((m: any) => m.id === 3)).toMatchObject({ reactions: { "🤩": ["sam"] }, note: "Le lac au réveil" });
  });
});

describe("notes de photo", () => {
  it("enregistre, remplace puis efface la légende partagée", async () => {
    expect((await note(1, "  Premier café  ")).json()).toEqual({ reactions: {}, note: "Premier café" });
    expect((await note(1, "Premier café, au bord du lac", sam)).json().note).toBe("Premier café, au bord du lac");
    expect((await note(1, "   ")).json().note).toBeNull();
    expect(app.waysake.db.prepare("SELECT COUNT(*) AS n FROM media_note").get()).toEqual({ n: 0 });
  });

  it("refuse une note trop longue ou qui n'est pas du texte", async () => {
    expect((await note(1, "x".repeat(501))).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/media/1/note", headers: alex, payload: { text: 3 } })).statusCode).toBe(400);
  });
});

describe("coups de cœur", () => {
  it("les photos les plus réagies du voyage, dans l'ordre, et rien sans réaction", async () => {
    expect((await trip()).detail.favorites).toEqual([]);
    await react(4, "❤️", true);
    await react(2, "❤️", true);
    await react(2, "😮", true, sam);
    expect((await trip()).detail.favorites).toEqual([2, 4]);
  });

  it("deviennent la couverture tant qu'aucune n'est choisie à la main", async () => {
    const auto = (await trip()).summary.coverMediaId;
    const fav = auto === 1 ? 4 : 1;
    await react(fav, "❤️", true);
    expect((await trip()).summary.coverMediaId).toBe(fav);
    expect((await trip()).detail.coverMediaId).toBe(fav);
    const slug = (await trip()).summary.slug;
    await app.inject({ method: "PATCH", url: `/api/trips/${slug}`, headers: alex, payload: { coverMediaId: 3 } });
    expect((await trip()).summary.coverMediaId).toBe(3);
  });
});
