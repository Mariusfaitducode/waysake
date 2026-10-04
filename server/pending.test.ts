import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type AtlasApp } from "./app.js";
import { insertDemoMedia } from "../test/demo-db.js";

let app: AtlasApp;
beforeEach(async () => {
  app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "atlas-")) });
  insertDemoMedia(app.atlas.db);
  // Le road trip est encore en attente de validation.
  app.atlas.db.prepare("INSERT INTO import (id, user_id, created_at) VALUES (1, 'alex', ?)").run(Date.now());
  app.atlas.db.prepare("UPDATE media SET status = 'pending', import_id = 1 WHERE taken_at >= ?").run(Date.UTC(2026, 7, 1));
  app.atlas.rebuild();
});
const get = async (url: string) => (await app.inject({ url })).json();

describe("médias en attente", () => {
  it("n'apparaissent pas dans la photothèque ni les compteurs", async () => {
    const pending = (app.atlas.db.prepare("SELECT count(*) AS n FROM media WHERE status = 'pending'").get() as any).n;
    expect(pending).toBeGreaterThan(50);
    const { items } = await get("/api/media?limit=2000");
    expect(items).toHaveLength(162 - pending);
    expect((await get("/api/stats")).photos).toBe(162 - pending);
    expect((await get("/api/overview")).photos).toBe(162 - pending);
  });

  it("ne forment aucun voyage ni aucun pays", async () => {
    expect((await get("/api/trips")).map((t: any) => t.title)).toEqual(["Sicile", "Îles Canaries", "Berlin", "Amsterdam"]);
    expect((await get("/api/countries")).map((c: any) => c.code)).not.toContain("HR");
  });
});
