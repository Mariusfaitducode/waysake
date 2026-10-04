import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "./app.js";

describe("app", () => {
  it("répond sur /api/health", async () => {
    const app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "waysake-")) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
