import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { cancelImport, confirmImport, lastImportedAt, proposal, setExclusions } from "../imports.js";
import { identify } from "./users.js";

const ids = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => Number.isInteger(x)));

export function importRoutes(app: FastifyInstance, db: Db, dataDir: string) {
  app.post("/api/imports", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send({ error: "Choisis ton profil d'abord.", code: "profile_required" });
    const { id } = db.prepare("INSERT INTO import (user_id, created_at) VALUES (?, ?) RETURNING id").get(user.id, Date.now()) as { id: number };
    return reply.code(201).send({ id });
  });

  app.get("/api/imports/last", async () => ({ since: lastImportedAt(db) }));

  app.get<{ Params: { id: string } }>("/api/imports/:id", async (req, reply) => {
    const p = proposal(db, Number(req.params.id));
    return p ?? reply.code(404).send({ error: "Cet import n'existe pas.", code: "import_not_found" });
  });

  app.patch<{ Params: { id: string }; Body: { exclude?: unknown; include?: unknown; keepHome?: unknown } }>("/api/imports/:id", async (req, reply) => {
    const b = req.body ?? {};
    if (!ids(b.exclude) || !ids(b.include) || (b.keepHome !== undefined && typeof b.keepHome !== "boolean"))
      return reply.code(400).send({ error: "Modification invalide.", code: "invalid_change" });
    setExclusions(db, Number(req.params.id), b as { exclude?: number[]; include?: number[]; keepHome?: boolean });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/imports/:id/confirm", async (req, reply) => {
    if (!proposal(db, Number(req.params.id))) return reply.code(404).send({ error: "Cet import n'existe pas.", code: "import_not_found" });
    return confirmImport(db, dataDir, Number(req.params.id));
  });

  app.delete<{ Params: { id: string } }>("/api/imports/:id", async (req) => {
    cancelImport(db, dataDir, Number(req.params.id));
    return { ok: true };
  });
}
