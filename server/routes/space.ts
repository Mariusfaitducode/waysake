import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { averageSizes, diskSpace, forecast, knownItems, monthlyGrowth, recordUploadRate, uploadRate, usedSpace, type PhoneItem } from "../space.js";

const MAX_ITEMS = 5000;
const validItems = (v: unknown): v is PhoneItem[] =>
  Array.isArray(v) &&
  v.length <= MAX_ITEMS &&
  v.every((i) => i && typeof i === "object" && typeof i.name === "string" && i.name.length <= 255 && Number.isFinite(i.takenAt));

export function spaceRoutes(app: FastifyInstance, db: Db, dataDir: string) {
  app.get("/api/space", async () => {
    const disk = diskSpace(dataDir);
    const monthly = monthlyGrowth(db);
    return {
      disk,
      used: usedSpace(db, dataDir),
      monthly,
      forecast: forecast(disk.free, monthly.bytes),
      average: averageSizes(db),
      uploadRate: uploadRate(db),
    };
  });

  // Lecture seule, mais en POST : la liste d'un mois de photos ne tient pas dans une adresse.
  app.post<{ Body: { items?: unknown } }>("/api/media/known", async (req, reply) => {
    const items = req.body?.items;
    if (!validItems(items)) return reply.code(400).send({ error: "Liste de fichiers invalide.", code: "invalid_items" });
    return { known: knownItems(db, items) };
  });

  app.post<{ Body: { bytes?: unknown; ms?: unknown } }>("/api/uploads/rate", async (req, reply) => {
    const { bytes, ms } = req.body ?? {};
    // Moins d'une seconde ou moins de 100 Ko : la mesure dirait surtout la latence. Au-delà de 10 Go/s : absurde.
    if (typeof bytes !== "number" || typeof ms !== "number" || !(bytes >= 100_000) || !(ms >= 1000) || bytes / ms > 1e7)
      return reply.code(400).send({ error: "Mesure de débit invalide.", code: "invalid_rate" });
    return recordUploadRate(db, bytes, ms);
  });
}
