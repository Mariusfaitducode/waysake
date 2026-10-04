import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
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
import { socialRoutes } from "./routes/social.js";
import { souvenirRoutes } from "./routes/souvenirs.js";
import { liveRoutes } from "./routes/live.js";
import { gameRoutes } from "./routes/game.js";
import { spaceRoutes } from "./routes/space.js";
import { setupAuth } from "./auth.js";
import { scheduleSnapshots } from "./backup.js";
import { setting } from "./config.js";

export type WaysakeApp = FastifyInstance & { waysake: { db: Db; rebuild: () => void; scheduleRebuild: () => void } };

export async function buildApp(opts: {
  dataDir: string;
  webDir?: string;
  rebuildDelayMs?: number;
  /** Mot de passe du foyer ; absent ou vide : Waysake reste ouvert (WAYSAKE_PASSWORD par défaut). */
  password?: string;
  /** Instantané quotidien de la base dans DATA_DIR/backups (activé par main.ts). */
  snapshots?: boolean;
}): Promise<WaysakeApp> {
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
  app.decorate("waysake", { db, rebuild, scheduleRebuild });
  const stopSnapshots = opts.snapshots ? scheduleSnapshots(db, opts.dataDir, (err) => app.log.error(err)) : () => {};
  app.addHook("onClose", async () => {
    clearTimeout(timer);
    stopSnapshots();
    db.close();
  });

  // Messages d'erreur en français (et un `code` que l'interface traduit), jamais de détails techniques.
  app.setErrorHandler((err: { statusCode?: number; code?: string }, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) app.log.error(err);
    // `code` : identifiant stable que l'interface traduit (le texte français reste pour les anciens clients).
    const [code, message] =
      err.code === "FST_REQ_FILE_TOO_LARGE" || status === 413
        ? ["file_too_large", "Fichier trop lourd (2 Go maximum)."]
        : status >= 500
          ? ["server_error", "La tour n'a pas pu terminer. Réessaie dans un instant."]
          : ["invalid_request", "Requête invalide."];
    return reply.code(status).send({ error: message, code });
  });

  await app.register(cookie);
  // Le mot de passe passe avant tout le reste, y compris le choix du profil.
  setupAuth(app, db, "password" in opts ? opts.password : setting("PASSWORD"));

  // Protection CSRF : toute modification exige une identité. Le cookie (SameSite=Lax) n'accompagne
  // jamais un formulaire posté depuis un autre site, et un autre site ne peut pas poser l'en-tête
  // X-Atlas-User sans CORS. Seuls le choix du profil et la connexion (mot de passe du foyer) restent ouverts.
  // On juge la route reconnue par le routeur (déjà décodée), jamais le texte brut de l'adresse :
  // « /%61pi/… » atteint les mêmes routes que « /api/… ».
  app.addHook("preHandler", async (req, reply) => {
    if (req.method === "GET" || req.method === "HEAD") return;
    if (req.method === "POST" && ["/api/me", "/api/login", "/api/logout"].includes(req.routeOptions.url ?? "")) return;
    if (!identify(db, req)) return reply.code(401).send({ error: "Choisis ton profil d'abord.", code: "profile_required" });
  });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 ** 3, files: 1 } });
  // Originaux servis avec prise en charge des plages (Range) : indispensable aux vidéos sur iPhone.
  await app.register(fastifyStatic, { root: resolve(opts.dataDir), serve: false });

  // L'app Android : déposée dans DATA_DIR/app/waysake.apk sur la tour (elle n'est pas dans git), sinon celle du
  // site compilé. Avant le changement de nom, elle s'appelait atlas.apk : ce nom de fichier et l'adresse
  // /atlas.apk (liens et QR codes déjà partagés) restent acceptés.
  const sendApk = async (_req: unknown, reply: FastifyReply) => {
    const dirs = [resolve(opts.dataDir, "app"), ...(opts.webDir ? [resolve(opts.webDir)] : [])];
    const file = dirs.flatMap((d) => [resolve(d, "waysake.apk"), resolve(d, "atlas.apk")]).find((f) => existsSync(f));
    if (!file) return reply.code(404).send({ error: "L'app Android n'a pas encore été déposée sur la tour.", code: "apk_missing" });
    return reply
      .type("application/vnd.android.package-archive")
      .header("Content-Disposition", 'attachment; filename="Waysake.apk"')
      .send(createReadStream(file));
  };
  app.get("/waysake.apk", sendApk);
  app.get("/atlas.apk", sendApk);
  // Le raccourci iPhone signé (scripts/build-shortcut.ts) : dans DATA_DIR/app/ comme l'APK, sinon dans le site compilé.
  app.get("/waysake.shortcut", async (_req, reply) => {
    const file = [resolve(opts.dataDir, "app"), ...(opts.webDir ? [resolve(opts.webDir)] : [])].map((d) => resolve(d, "waysake.shortcut")).find((f) => existsSync(f));
    if (!file) return reply.code(404).send({ error: "Le raccourci iPhone n'a pas encore été déposé sur la tour.", code: "shortcut_missing" });
    return reply
      .type("application/octet-stream")
      .header("Content-Disposition", "attachment; filename=\"Importer dans Waysake.shortcut\"")
      .send(createReadStream(file));
  });
  userRoutes(app, db);
  mediaRoutes(app, db, opts.dataDir, scheduleRebuild);
  tripRoutes(app, db);
  journalRoutes(app, db);
  importRoutes(app, db, opts.dataDir);
  locateRoutes(app, db);
  socialRoutes(app, db);
  souvenirRoutes(app, db, opts.dataDir);
  liveRoutes(app, db);
  gameRoutes(app, db);
  spaceRoutes(app, db, opts.dataDir);

  const webDir = opts.webDir && resolve(opts.webDir);
  if (webDir && existsSync(webDir)) {
    // wildcard : les fichiers d'une nouvelle version du site sont servis sans redémarrer la tour.
    await app.register(fastifyStatic, { root: webDir, wildcard: true, decorateReply: false });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/") ? reply.code(404).send({ error: "Introuvable", code: "not_found" }) : reply.sendFile("index.html", webDir),
    );
  }

  try {
    expireImports(db, opts.dataDir); // imports oubliés depuis plus de 7 jours
    rebuildTrips(db);
  } catch (err) {
    app.log.error(err);
  }
  return app as unknown as WaysakeApp;
}
