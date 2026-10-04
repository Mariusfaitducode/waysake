import type { FastifyInstance } from "fastify";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../db.js";
import { readBackups, uploadsByMonth, uploadsByPerson, uploadTotals, type Traffic, type UploadRow } from "../stats.js";
import { findUnlocated } from "./locate.js";
import { readVersion } from "../version.js";

/**
 * GET /api/stats/overview : tout ce qu'affiche la page « Statistiques », en une requête (l'espace disque vient
 * de /api/space). Lecture seule, protégée comme le reste par le mot de passe du foyer. Ni jeton, ni empreinte
 * de session, ni chemin de la machine, ni adresse IP : des nombres, des dates et des identifiants de profil.
 */
export function statsRoutes(app: FastifyInstance, db: Db, dataDir: string, opts: { traffic: Traffic; password: boolean; startedAt: number }) {
  const version = readVersion();

  app.get("/api/stats/overview", async () => {
    const rows = db
      .prepare("SELECT uploaded_by AS userId, kind, bytes, uploaded_at AS uploadedAt FROM media WHERE status = 'ready'")
      .all() as UploadRow[];
    const users = db.prepare("SELECT id, name, color FROM user ORDER BY id").all() as { id: string; name: string; color: string }[];
    const hasReactions = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'reaction'").get();
    const reactions = hasReactions
      ? Object.fromEntries(
          (db.prepare("SELECT user_id AS id, count(*) AS n FROM reaction GROUP BY user_id").all() as { id: string; n: number }[]).map((r) => [r.id, r.n]),
        )
      : null;

    // Appareils connectés : seulement combien et quand, jamais les jetons (dont la tour ne garde que l'empreinte).
    const devices = opts.password
      ? (({ n, latest }) => ({ count: n, latestAt: latest }))(
          db.prepare("SELECT count(*) AS n, max(created_at) AS latest FROM session").get() as { n: number; latest: number | null },
        )
      : null;

    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    const countries = new Set(
      (db.prepare("SELECT country_codes FROM trip").all() as { country_codes: string }[]).flatMap((t) => JSON.parse(t.country_codes) as string[]),
    );
    const database = ["atlas.sqlite", "atlas.sqlite-wal"].reduce((n, f) => n + (statSync(join(dataDir, f), { throwIfNoEntry: false })?.size ?? 0), 0);

    return {
      uploads: { totals: uploadTotals(rows), months: uploadsByMonth(rows) },
      people: uploadsByPerson(rows, users.map((u) => u.id), reactions),
      backup: readBackups(dataDir),
      traffic: opts.traffic.snapshot(),
      access: { password: opts.password, users, devices },
      app: {
        version,
        startedAt: opts.startedAt,
        uptime: Math.round(process.uptime()),
        node: process.version,
        database,
        library: {
          trips: count("SELECT count(*) AS n FROM trip"),
          chapters: count("SELECT count(*) AS n FROM chapter"),
          countries: countries.size,
          unlocated: findUnlocated(db).lost.size,
        },
      },
    };
  });
}
