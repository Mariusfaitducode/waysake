import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type WaysakeApp } from "./app.js";
import { insertDemoMedia } from "../test/demo-db.js";

const PASSWORD = "carnet de route 2026";

let dir: string;
let app: WaysakeApp;
async function start(password?: string) {
  await app?.close();
  app = await buildApp({ dataDir: join(dir, "data"), webDir: join(dir, "web"), password });
  return app;
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "waysake-auth-"));
  mkdirSync(join(dir, "web", "assets"), { recursive: true });
  writeFileSync(join(dir, "web", "index.html"), "<!doctype html><title>Waysake</title>");
  writeFileSync(join(dir, "web", "assets", "index.js"), "console.log(1)");
  mkdirSync(join(dir, "data", "x"), { recursive: true });
  writeFileSync(join(dir, "data", "x", "1.jpg"), "JPEG-original");
  mkdirSync(join(dir, "data", "app"), { recursive: true });
  writeFileSync(join(dir, "data", "app", "atlas.apk"), "PK-apk");
  app = undefined as unknown as WaysakeApp;
});
afterEach(async () => {
  await app?.close();
});

/** Se connecte et renvoie l'en-tête cookie de session. */
async function login(password = PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { password } });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === "atlas_session");
  expect(c).toBeTruthy();
  return `atlas_session=${c!.value}`;
}

// Tout ce qui livre des données du foyer : listes, voyages, notes, et chaque route qui sert un fichier.
const PROTECTED = [
  "/api/users",
  "/api/me",
  "/api/media",
  "/api/stats",
  "/api/trips",
  "/api/countries",
  "/api/overview",
  "/api/notes",
  "/api/wishes",
  "/api/places?q=par",
  "/api/unlocated",
  "/api/imports/last",
  "/api/geo/countries.geojson",
  "/api/media/1/original",
  "/api/media/1/thumb",
  "/api/media/1/preview",
  "/api/media/1/place",
];

describe("sans WAYSAKE_PASSWORD : rien ne change", () => {
  beforeEach(async () => {
    await start(undefined);
    insertDemoMedia(app.waysake.db);
  });

  it("l'API et les originaux restent ouverts", async () => {
    expect((await app.inject({ url: "/api/trips" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/users" })).statusCode).toBe(200);
    const original = await app.inject({ url: "/api/media/1/original" });
    expect(original.statusCode).toBe(200);
    expect(original.headers["cache-control"]).toMatch(/public/);
  });

  it("/api/health ne demande pas de mot de passe", async () => {
    const res = await app.inject({ url: "/api/health" });
    expect(res.json().auth).toBeFalsy();
  });

  it("/api/login répond sans poser de session", async () => {
    const res = await app.inject({ method: "POST", url: "/api/login", payload: { password: "x" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, auth: false });
    expect(res.cookies.find((c) => c.name === "atlas_session")).toBeUndefined();
  });
});

describe("avec WAYSAKE_PASSWORD", () => {
  beforeEach(async () => {
    await start(PASSWORD);
    insertDemoMedia(app.waysake.db);
  });

  it("/api/health reste ouvert et annonce le mot de passe", async () => {
    const res = await app.inject({ url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, auth: true });
  });

  for (const url of PROTECTED)
    it(`refuse GET ${url} sans session`, async () => {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("AUTH_REQUIRED");
      expect(res.body).not.toContain("JPEG-original");
    });

  it("refuse aussi HEAD et les modifications, même avec un profil", async () => {
    expect((await app.inject({ method: "HEAD", url: "/api/media/1/original" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/me", payload: { userId: "alex" } })).statusCode).toBe(401);
    const r = await app.inject({ method: "POST", url: "/api/imports", headers: { "x-atlas-user": "alex", cookie: "atlas_user=alex" } });
    expect(r.statusCode).toBe(401);
    expect(app.waysake.db.prepare("SELECT COUNT(*) AS n FROM import").get()).toEqual({ n: 0 });
  });

  it("ne se laisse pas contourner par une adresse encodée", async () => {
    for (const url of ["/%61pi/media/1/original", "/api/health/../media/1/original", "/api/media/1/original?x=/api/health", "/API/trips"]) {
      const res = await app.inject({ url });
      expect(res.body).not.toContain("JPEG-original");
      expect(res.body).not.toContain('"slug"');
    }
  });

  it("laisse passer le site lui-même (sinon pas d'écran de connexion) et l'APK", async () => {
    expect((await app.inject({ url: "/" })).body).toContain("<title>Waysake</title>");
    expect((await app.inject({ url: "/v/un-voyage" })).body).toContain("<title>Waysake</title>");
    expect((await app.inject({ url: "/assets/index.js" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/waysake.apk" })).body).toBe("PK-apk");
    expect((await app.inject({ url: "/atlas.apk" })).body).toBe("PK-apk");
    expect((await app.inject({ url: "/waysake.shortcut" })).statusCode).not.toBe(401); // le raccourci ne contient aucune donnée
    expect((await app.inject({ url: "/api/inconnue" })).statusCode).toBe(404);
  });

  it("login correct : cookie de session httpOnly, SameSite=Lax, un an", async () => {
    const res = await app.inject({ method: "POST", url: "/api/login", payload: { password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    const c = res.cookies.find((x) => x.name === "atlas_session")!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
    expect(c.maxAge).toBe(60 * 60 * 24 * 365);
    expect(c.path).toBe("/");
    expect(c.secure).toBeFalsy();
    expect(c.value).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // Jamais le mot de passe en clair dans le cookie.
    expect(c.value).not.toContain("carnet");
  });

  it("le cookie est Secure quand la requête arrive en HTTPS (Tailscale serve, proxy)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/login", payload: { password: PASSWORD }, headers: { "x-forwarded-proto": "https" } });
    expect(res.cookies.find((x) => x.name === "atlas_session")!.secure).toBe(true);
  });

  it("une fois connecté, tout est accessible, originaux compris", async () => {
    const cookie = await login();
    expect((await app.inject({ url: "/api/trips", headers: { cookie } })).statusCode).toBe(200);
    const original = await app.inject({ url: "/api/media/1/original", headers: { cookie } });
    expect(original.statusCode).toBe(200);
    expect(original.body).toBe("JPEG-original");
    // Un cache partagé ne doit pas garder une photo protégée.
    expect(original.headers["cache-control"]).toMatch(/private/);
    expect(original.headers["cache-control"]).not.toMatch(/public/);
    expect((await app.inject({ url: "/api/media/1/thumb", headers: { cookie } })).statusCode).toBe(404); // pas de miniature générée ici
  });

  it("la protection CSRF reste en place derrière le mot de passe", async () => {
    const cookie = await login();
    expect((await app.inject({ method: "POST", url: "/api/imports", headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/me", payload: { userId: "alex" }, headers: { cookie } })).statusCode).toBe(200);
    const both = `${cookie}; atlas_user=alex`;
    expect((await app.inject({ method: "POST", url: "/api/imports", headers: { cookie: both } })).statusCode).toBe(201);
  });

  it("login refusé avec un mauvais mot de passe ou un corps invalide", async () => {
    for (const [i, payload] of [{ password: "nope" }, { password: "" }, {}, { password: 123 }].entries()) {
      const res = await app.inject({ method: "POST", url: "/api/login", payload, remoteAddress: `10.0.1.${i}` });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("wrong_password"); // traduit par l'interface (api.wrong_password)
      expect(res.cookies.find((c) => c.name === "atlas_session")).toBeUndefined();
    }
    // Un formulaire posté depuis un autre site (text/plain) n'est pas un login.
    const form = await app.inject({ method: "POST", url: "/api/login", payload: `password=${PASSWORD}`, headers: { "content-type": "text/plain" }, remoteAddress: "10.0.1.9" });
    expect(form.statusCode).not.toBe(200);
  });

  it("un cookie de session inventé ne vaut rien", async () => {
    const res = await app.inject({ url: "/api/trips", headers: { cookie: "atlas_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } });
    expect(res.statusCode).toBe(401);
  });

  it("freine les essais répétés depuis une même adresse", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await app.inject({ method: "POST", url: "/api/login", payload: { password: `faux-${i}` } })).statusCode);
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses).toContain(429);
    // Même le bon mot de passe attend la fin du délai : on ne peut pas deviner pendant le blocage.
    const blocked = await app.inject({ method: "POST", url: "/api/login", payload: { password: PASSWORD } });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.json()).toMatchObject({ code: "too_many_attempts", seconds: Number(blocked.headers["retry-after"]) });
    // Le bearer passe par le même frein.
    expect((await app.inject({ url: "/api/trips", headers: { authorization: `Bearer ${PASSWORD}` } })).statusCode).toBe(429);
    // Une autre adresse n'est pas pénalisée.
    const other = await app.inject({ method: "POST", url: "/api/login", payload: { password: PASSWORD }, remoteAddress: "10.0.0.9" });
    expect(other.statusCode).toBe(200);
  });

  it("l'app s'authentifie avec Authorization: Bearer <mot de passe>, téléversement compris", async () => {
    const authorization = `Bearer ${PASSWORD}`;
    expect((await app.inject({ url: "/api/trips", headers: { authorization } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/media/1/original", headers: { authorization } })).body).toBe("JPEG-original");
    const created = await app.inject({ method: "POST", url: "/api/imports", headers: { authorization, "x-atlas-user": "alex" } });
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ url: "/api/trips", headers: { authorization: "Bearer faux" } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/trips", headers: { authorization: `Basic ${PASSWORD}` } })).statusCode).toBe(401);
  });

  it("le jeton de session vaut aussi en Bearer (raccourci iPhone)", async () => {
    const cookie = await login();
    const token = cookie.split("=")[1];
    expect((await app.inject({ url: "/api/trips", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
  });

  it("logout ferme la session côté tour", async () => {
    const cookie = await login();
    const out = await app.inject({ method: "POST", url: "/api/logout", headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const cleared = out.cookies.find((c) => c.name === "atlas_session")!;
    expect(cleared.value).toBe("");
    // Le jeton volé avant la déconnexion ne sert plus.
    expect((await app.inject({ url: "/api/trips", headers: { cookie } })).statusCode).toBe(401);
  });

  it("logout depuis un autre site (sans cookie) ne passe pas", async () => {
    expect((await app.inject({ method: "POST", url: "/api/logout" })).statusCode).toBe(401);
  });

  it("changer WAYSAKE_PASSWORD invalide toutes les sessions", async () => {
    const cookie = await login();
    await start(PASSWORD); // simple redémarrage : la session survit
    expect((await app.inject({ url: "/api/trips", headers: { cookie } })).statusCode).toBe(200);
    await start("nouveau mot de passe");
    expect((await app.inject({ url: "/api/trips", headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/trips", headers: { authorization: `Bearer ${PASSWORD}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/trips", headers: { authorization: "Bearer nouveau mot de passe" } })).statusCode).toBe(200);
  });

  it("retirer puis remettre le même mot de passe ne ressuscite pas les anciennes sessions", async () => {
    const cookie = await login();
    await start(undefined);
    await start(PASSWORD);
    expect((await app.inject({ url: "/api/trips", headers: { cookie } })).statusCode).toBe(401);
  });
});
