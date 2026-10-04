import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVersion } from "./version.js";
import { buildApp } from "./app.js";

describe("version déployée", () => {
  it("lit le commit et la date écrits par le déploiement, null sinon", () => {
    const dir = mkdtempSync(join(tmpdir(), "waysake-"));
    expect(readVersion(dir)).toBeNull();
    writeFileSync(join(dir, "version.json"), JSON.stringify({ commit: "20b810d", date: "2026-10-04T15:43:00Z" }));
    expect(readVersion(dir)).toEqual({ commit: "20b810d", date: "2026-10-04T15:43:00Z" });
    writeFileSync(join(dir, "version.json"), "{pas du json");
    expect(readVersion(dir)).toBeNull();
  });

  it("GET /api/health annonce la version (ou « dev » sans fichier)", async () => {
    const app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
    expect((await app.inject({ url: "/api/health" })).json()).toMatchObject({ ok: true, version: expect.anything() });
  });
});
