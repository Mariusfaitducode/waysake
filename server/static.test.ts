import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "./app.js";

describe("site statique", () => {
  it("sert les fichiers ajoutés après le démarrage (nouvelle version du site)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    const web = join(dir, "web");
    mkdirSync(join(web, "assets"), { recursive: true });
    writeFileSync(join(web, "index.html"), "<!doctype html><title>Waysake</title>");
    const app = await buildApp({ dataDir: join(dir, "data"), webDir: web });
    writeFileSync(join(web, "assets", "index-nouveau.js"), "console.log(1)");
    const js = await app.inject({ url: "/assets/index-nouveau.js" });
    expect(js.statusCode).toBe(200);
    expect(js.headers["content-type"]).toMatch(/javascript/);
    const spa = await app.inject({ url: "/v/un-voyage" });
    expect(spa.body).toContain("<title>Waysake</title>");
    expect((await app.inject({ url: "/api/inconnue" })).statusCode).toBe(404);
  });

  it("sert l'APK Android depuis le dossier de données de la tour, aussi à l'ancienne adresse /atlas.apk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    mkdirSync(join(dir, "data", "app"), { recursive: true });
    writeFileSync(join(dir, "data", "app", "waysake.apk"), "PK-apk");
    const app = await buildApp({ dataDir: join(dir, "data") });
    for (const url of ["/waysake.apk", "/atlas.apk"]) {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/vnd.android.package-archive");
      expect(res.headers["content-disposition"]).toBe('attachment; filename="Waysake.apk"');
      expect(res.body).toBe("PK-apk");
    }
  });

  it("sert encore un atlas.apk déposé avant le changement de nom, mais préfère waysake.apk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    mkdirSync(join(dir, "data", "app"), { recursive: true });
    writeFileSync(join(dir, "data", "app", "atlas.apk"), "PK-ancien");
    const app = await buildApp({ dataDir: join(dir, "data") });
    expect((await app.inject({ url: "/waysake.apk" })).body).toBe("PK-ancien");
    writeFileSync(join(dir, "data", "app", "waysake.apk"), "PK-neuf");
    expect((await app.inject({ url: "/waysake.apk" })).body).toBe("PK-neuf");
    expect((await app.inject({ url: "/atlas.apk" })).body).toBe("PK-neuf");
  });

  it("sert le raccourci iPhone signé depuis le dossier de données, 404 sinon", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    const app = await buildApp({ dataDir: join(dir, "data") });
    expect((await app.inject({ url: "/waysake.shortcut" })).json()).toMatchObject({ code: "shortcut_missing" });
    mkdirSync(join(dir, "data", "app"), { recursive: true });
    writeFileSync(join(dir, "data", "app", "waysake.shortcut"), "AEA1-signed");
    const res = await app.inject({ url: "/waysake.shortcut" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("Importer dans Waysake.shortcut");
    expect(res.body).toBe("AEA1-signed");
  });

  it("sert aussi le raccourci posé dans le site compilé (sortie de build-shortcut)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    mkdirSync(join(dir, "web"), { recursive: true });
    writeFileSync(join(dir, "web", "index.html"), "<title>Waysake</title>");
    writeFileSync(join(dir, "web", "waysake.shortcut"), "AEA1-web");
    const app = await buildApp({ dataDir: join(dir, "data"), webDir: join(dir, "web") });
    expect((await app.inject({ url: "/waysake.shortcut" })).body).toBe("AEA1-web");
  });

  it("répond 404 pour l'APK quand il n'a pas été déposé", async () => {
    const app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
    const res = await app.inject({ url: "/waysake.apk" });
    expect(res.statusCode).toBe(404);
    // Texte français pour les anciens clients, code stable pour l'interface traduite.
    expect(res.json()).toEqual({ error: "L'app Android n'a pas encore été déposée sur la tour.", code: "apk_missing" });
  });

  it("joint un code stable aux erreurs génériques", async () => {
    const app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
    expect((await app.inject({ url: "/api/trips/inconnu" })).json()).toMatchObject({ code: "trip_not_found" });
    expect((await app.inject({ method: "POST", url: "/api/wishes", payload: {} })).json()).toMatchObject({ code: "profile_required" });
  });
});
