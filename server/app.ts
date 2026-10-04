import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { createReadStream, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, type Db } from "./db.js";
import { rebuildTrips } from "./trips.js";
import { expireImports } from "./imports.js";
import { identify, userRoutes } from "./routes/users.js";
import { mediaRoutes } from "./routes/media.js";
import { tripRoutes } from "./routes/trips.js";
import { journalRoutes } from "./routes/journal.js";
import { importRoutes } from "./routes/imports.js";
import { locateRoutes } from "./routes/locate.js";

export type AtlasApp = FastifyInstance & { atlas: { db: Db; rebuild: () => void; scheduleRebuild: () => void } };

export async function buildApp(opts: { dataDir: string; webDir?: string; rebuildDelayMs?: number }): Promise<AtlasApp> {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const db = openDb(opts.dataDir);
  // Envois interrompus par un redémarrage : leurs fichiers temporaires ne serviront plus.
  rmSync(resolve(opts.dataDir, "tmp"), { recursive: true, force: true });

  // Les voyages sont recalculés au démarrage, puis quelques secondes après le dernier envoi d'un lot.
  let timer: NodeJS.Timeout | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    rebuildTrips(db);
  };
  const scheduleRebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        rebuildTrips(db);
      } catch (err) {
        app.log.error(err);
      }
    }, opts.rebuildDelayMs ?? 4000);
  };
  app.decorate("atlas", { db, rebuild, scheduleRebuild });
  app.addHook("onClose", async () => {
    clearTimeout(timer);
    db.close();
  });

  // Messages d'erreur en français, jamais de détails techniques côté interface.
  app.setErrorHandler((err: { statusCode?: number; code?: string }, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) app.log.error(err);
    const message =
      err.code === "FST_REQ_FILE_TOO_LARGE" || status === 413
        ? "Fichier trop lourd (2 Go maximum)."
        : status >= 500
          ? "La tour n'a pas pu terminer. Réessaie dans un instant."
          : "Requête invalide.";
    return reply.code(status).send({ error: message });
  });

  await app.register(cookie);

  // Protection CSRF : toute modification exige une identité. Le cookie (SameSite=Lax) n'accompagne
  // jamais un formulaire posté depuis un autre site, et un autre site ne peut pas poser l'en-tête
  // X-Atlas-User sans CORS. Seul le choix du profil reste ouvert.
  // On juge la route reconnue par le routeur (déjà décodée), jamais le texte brut de l'adresse :
  // « /%61pi/… » atteint les mêmes routes que « /api/… ».
  app.addHook("preHandler", async (req, reply) => {
    if (req.method === "GET" || req.method === "HEAD") return;
    if (req.method === "POST" && req.routeOptions.url === "/api/me") return;
    if (!identify(db, req)) return reply.code(401).send({ error: "Choisis ton profil d'abord." });
  });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 ** 3, files: 1 } });
  // Originaux servis avec prise en charge des plages (Range) : indispensable aux vidéos sur iPhone.
  await app.register(fastifyStatic, { root: resolve(opts.dataDir), serve: false });

  app.get("/api/health", async () => ({ ok: true }));

  // L'app Android : déposée dans DATA_DIR/app/atlas.apk sur la tour (elle n'est pas dans git), sinon celle du site compilé.
  app.get("/atlas.apk", async (_req, reply) => {
    const inData = resolve(opts.dataDir, "app", "atlas.apk");
    const inWeb = opts.webDir ? resolve(opts.webDir, "atlas.apk") : null;
    const file = existsSync(inData) ? inData : inWeb && existsSync(inWeb) ? inWeb : null;
    if (!file) return reply.code(404).send({ error: "L'app Android n'a pas encore été déposée sur la tour." });
    return reply
      .type("application/vnd.android.package-archive")
      .header("Content-Disposition", 'attachment; filename="Atlas.apk"')
      .send(createReadStream(file));
  });
  userRoutes(app, db);
  mediaRoutes(app, db, opts.dataDir, scheduleRebuild);
  tripRoutes(app, db);
  journalRoutes(app, db);
  importRoutes(app, db, opts.dataDir);
  locateRoutes(app, db);

  const webDir = opts.webDir && resolve(opts.webDir);
  if (webDir && existsSync(webDir)) {
    // wildcard : les fichiers d'une nouvelle version du site sont servis sans redémarrer la tour.
    await app.register(fastifyStatic, { root: webDir, wildcard: true, decorateReply: false });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/") ? reply.code(404).send({ error: "Introuvable" }) : reply.sendFile("index.html", webDir),
    );
  }

  try {
    expireImports(db, opts.dataDir); // imports oubliés depuis plus de 7 jours
    rebuildTrips(db);
  } catch (err) {
    app.log.error(err);
  }
  return app as unknown as AtlasApp;
}
