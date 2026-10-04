import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { makeJpeg } from "../../test/fixtures.js";
import { makeVideo } from "../../test/video.js";

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
});

function multipart(name: string, data: Buffer) {
  const boundary = "----waysake" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const asAlex = { cookie: "atlas_user=alex" };
const upload = (name: string, data: Buffer, cookie = asAlex) => {
  const { payload, headers } = multipart(name, data);
  return app.inject({ method: "POST", url: "/api/media", payload, headers: { ...headers, ...cookie } });
};

describe("profils", () => {
  it("liste les profils et mémorise le choix", async () => {
    const users = await app.inject({ url: "/api/users" });
    expect(users.json().map((u: any) => u.id)).toEqual(["alex", "sam"]);
    expect((await app.inject({ url: "/api/me" })).json()).toEqual({ user: null });
    const set = await app.inject({ method: "POST", url: "/api/me", payload: { userId: "sam" } });
    expect(set.statusCode).toBe(200);
    const cookie = set.headers["set-cookie"] as string;
    expect(cookie).toMatch(/atlas_user=sam/);
    const me = await app.inject({ url: "/api/me", headers: { cookie: "atlas_user=sam" } });
    expect(me.json().user.name).toBe("Sam");
  });

  it("refuse un profil inconnu", async () => {
    const res = await app.inject({ method: "POST", url: "/api/me", payload: { userId: "bob" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("médias", () => {
  it("exige un profil pour déposer", async () => {
    const res = await upload("a.jpg", await makeJpeg(), {} as any);
    expect(res.statusCode).toBe(401);
  });

  it("dépose puis détecte le doublon", async () => {
    const data = await makeJpeg({ takenAt: "2026:09:01 10:00:00" });
    const first = await upload("a.jpg", data);
    expect(first.statusCode).toBe(201);
    expect(first.json().duplicate).toBe(false);
    const again = await upload("b.jpg", data);
    expect(again.json()).toEqual({ id: first.json().id, duplicate: true });
  });

  it("répond 415 pour un format non supporté et 422 pour une image illisible", async () => {
    expect((await upload("notes.txt", Buffer.from("x"))).statusCode).toBe(415);
    expect((await upload("broken.jpg", randomBytes(1024))).statusCode).toBe(422);
  });

  it("liste par date, sans date en dernier, et sert les fichiers", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    const late = await makeJpeg({ takenAt: "2026:09:05 10:00:00", lat: 45.4, lon: 12.3, color: "#a00" });
    const early = await makeJpeg({ takenAt: "2026:09:01 10:00:00", color: "#0a0" });
    await upload("nodate.png", png);
    await upload("late.jpg", late);
    await upload("early.jpg", early);

    const list = (await app.inject({ url: "/api/media" })).json();
    expect(list.items.map((m: any) => m.takenAtLocal)).toEqual(["2026-09-01T10:00:00", "2026-09-05T10:00:00", null]);
    const item = list.items[1];
    expect(item).toMatchObject({ kind: "photo", lat: expect.any(Number), uploadedBy: "alex", width: 64, height: 48 });
    // L'origine du lieu dit à la visionneuse si l'on peut le poser ou le corriger (jamais un GPS d'origine).
    expect(item.locationSource).toBe("exif");
    expect(list.items[0].locationSource).toBeNull();

    const thumb = await app.inject({ url: item.thumb });
    expect(thumb.headers["content-type"]).toBe("image/webp");
    expect(thumb.headers["cache-control"]).toMatch(/immutable/);
    const original = await app.inject({ url: item.original });
    expect(Buffer.compare(original.rawPayload, late)).toBe(0);
    expect(original.headers["content-disposition"]).toContain("late.jpg");

    expect((await app.inject({ url: "/api/stats" })).json()).toEqual({ photos: 3, videos: 0 });
  });

  it("pagine avec un curseur", async () => {
    for (let d = 1; d <= 5; d++) await upload(`${d}.jpg`, await makeJpeg({ takenAt: `2026:09:0${d} 10:00:00` }));
    const p1 = (await app.inject({ url: "/api/media?limit=2" })).json();
    expect(p1.items).toHaveLength(2);
    const p2 = (await app.inject({ url: `/api/media?limit=2&cursor=${p1.nextCursor}` })).json();
    const p3 = (await app.inject({ url: `/api/media?limit=2&cursor=${p2.nextCursor}` })).json();
    expect([...p1.items, ...p2.items, ...p3.items].map((m: any) => m.takenAtLocal.slice(8, 10))).toEqual([
      "01", "02", "03", "04", "05",
    ]);
    expect(p3.nextCursor).toBeNull();
  });

  it("répond 404 pour un média inconnu", async () => {
    expect((await app.inject({ url: "/api/media/999/thumb" })).statusCode).toBe(404);
  });

  it("sert l'original par plages (Range) pour la lecture vidéo sur iPhone", async () => {
    const data = makeVideo();
    const { id } = (await upload("clip.mov", data)).json();
    const res = await app.inject({ url: `/api/media/${id}/original`, headers: { range: "bytes=0-99" } });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 0-99/${data.length}`);
    expect(res.headers["content-type"]).toBe("video/quicktime");
    expect(Buffer.compare(res.rawPayload, data.subarray(0, 100))).toBe(0);
  });
});
