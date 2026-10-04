import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type WaysakeApp } from "./app.js";
import { insertDemoMedia } from "../test/demo-db.js";

let app: WaysakeApp;
beforeEach(async () => {
  app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
  insertDemoMedia(app.waysake.db);
  app.waysake.rebuild();
  app.waysake.db.prepare("INSERT INTO import (id, user_id, created_at) VALUES (1, 'alex', ?)").run(Date.now());
});

describe("toute modification exige une identité (protection CSRF)", () => {
  // Ce qu'un formulaire HTML d'un site tiers peut envoyer : un POST sans cookie (SameSite=Lax) ni en-tête.
  const forged = ["/api/imports/1/confirm", "/api/chapters/1/merge-previous", "/api/imports"];
  for (const url of forged)
    it(`refuse POST ${url} anonyme`, async () => {
      expect((await app.inject({ method: "POST", url })).statusCode).toBe(401);
    });

  it("refuse aussi PATCH, PUT et DELETE anonymes", async () => {
    expect((await app.inject({ method: "DELETE", url: "/api/imports/1" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PATCH", url: "/api/imports/1", payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: "/api/notes", payload: {} })).statusCode).toBe(401);
  });

  it("ne se laisse pas contourner par une adresse encodée ou déguisée", async () => {
    for (const url of ["/%61pi/imports/1/confirm", "/api/me/../imports/1/confirm", "/api/imports/1/confirm?x=/api/me", "/%2Fapi/imports/1/confirm"]) {
      const res = await app.inject({ method: "POST", url });
      expect([401, 404]).toContain(res.statusCode);
    }
    expect(app.waysake.db.prepare("SELECT status FROM import WHERE id = 1").get()).toEqual({ status: "pending" });
  });

  it("laisse passer le cookie et l'en-tête de l'app", async () => {
    expect((await app.inject({ method: "POST", url: "/api/imports/1/confirm", headers: { cookie: "atlas_user=alex" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/imports", headers: { "x-atlas-user": "sam" } })).statusCode).toBe(201);
  });

  it("laisse choisir son profil sans être identifié", async () => {
    expect((await app.inject({ method: "POST", url: "/api/me", payload: { userId: "alex" } })).statusCode).toBe(200);
  });

  it("la lecture reste libre", async () => {
    expect((await app.inject({ url: "/api/trips" })).statusCode).toBe(200);
  });
});
