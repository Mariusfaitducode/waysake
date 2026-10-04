import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.js";
import { readVersion } from "./version.js";

/**
 * Mot de passe du foyer (WAYSAKE_PASSWORD), facultatif. Sans lui, Waysake reste ouvert comme avant.
 *
 * Avec lui, toute l'API et tous les fichiers (originaux, miniatures, vidéos) exigent :
 * - le cookie `atlas_session` (navigateur), obtenu par POST /api/login ;
 * - ou l'en-tête `Authorization: Bearer <mot de passe ou jeton de session>` (app Android, raccourci iPhone).
 *
 * Les sessions sont des jetons aléatoires (256 bits) dont la tour ne garde que l'empreinte : contrairement à un
 * cookie signé, une déconnexion ferme vraiment la session, et un jeton volé ne sert plus après le logout.
 */
export const SESSION_COOKIE = "atlas_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // secondes
const AUTH_REQUIRED = { error: "Mot de passe requis.", code: "AUTH_REQUIRED" };

// Ce qui reste ouvert : l'état de la tour, la connexion, l'APK (une appli publique, sans aucune donnée) et le
// site lui-même (HTML/JS/CSS, sinon pas d'écran de connexion). On juge la route reconnue par le routeur, jamais
// l'adresse brute : toute nouvelle route est protégée d'office.
const OPEN_ROUTES = new Set(["/api/health", "/api/login", "/waysake.apk", "/atlas.apk", "/waysake.shortcut", "/*"]);

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const hashToken = (token: string) => sha256(token).toString("hex");
const safeEqual = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b)); // longueurs égales : 32 octets

/**
 * Changer (ou retirer) le mot de passe ferme toutes les sessions : au démarrage, on compare le mot de passe à
 * l'empreinte scrypt (salée) retenue la dernière fois. Jamais le mot de passe en clair dans la base.
 */
function syncPassword(db: Db, password: string | null) {
  const row = db.prepare("SELECT value FROM setting WHERE key = 'auth_password'").get() as { value: string } | undefined;
  if (password && row) {
    const [salt, hash] = row.value.split(":");
    if (salt && hash && timingSafeEqual(scryptSync(password, Buffer.from(salt, "hex"), 32), Buffer.from(hash, "hex"))) return;
  }
  db.transaction(() => {
    db.prepare("DELETE FROM session").run();
    db.prepare("DELETE FROM setting WHERE key = 'auth_password'").run();
    if (password) {
      const salt = randomBytes(16);
      const value = `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
      db.prepare("INSERT INTO setting (key, value) VALUES ('auth_password', ?)").run(value);
    }
  })();
}

/**
 * Frein aux essais : 3 erreurs gratuites par adresse, puis un délai qui double à chaque erreur (5 s, 10 s…,
 * 15 min au plus). Pendant le délai, même le bon mot de passe est refusé. En mémoire : un redémarrage remet à zéro.
 */
function createThrottle(now = () => Date.now()) {
  const FREE = 3;
  const failures = new Map<string, { count: number; until: number; last: number }>();
  return {
    /** Secondes à attendre, ou 0. */
    wait(ip: string) {
      const f = failures.get(ip);
      return f && f.until > now() ? Math.ceil((f.until - now()) / 1000) : 0;
    },
    fail(ip: string) {
      // Ménage : on oublie les adresses calmes depuis une journée.
      if (failures.size > 1000) for (const [k, v] of failures) if (now() - v.last > 86_400_000) failures.delete(k);
      const f = failures.get(ip) ?? { count: 0, until: 0, last: 0 };
      f.count++;
      f.last = now();
      if (f.count >= FREE) f.until = now() + Math.min(5_000 * 2 ** (f.count - FREE), 900_000);
      failures.set(ip, f);
    },
    succeed(ip: string) {
      failures.delete(ip);
    },
  };
}

/** HTTPS directement, ou derrière un proxy (Tailscale serve, Caddy…) qui l'annonce. */
function isHttps(req: FastifyRequest) {
  const proto = req.headers["x-forwarded-proto"];
  // Un en-tête forgé ne change que le cookie de celui qui le forge : aucun risque à s'y fier ici.
  return req.protocol === "https" || (typeof proto === "string" && proto.split(",")[0].trim() === "https");
}

export function setupAuth(app: FastifyInstance, db: Db, rawPassword: string | undefined) {
  const password = rawPassword ? rawPassword : null;
  syncPassword(db, password);
  const throttle = createThrottle();

  const version = readVersion() ?? "dev";
  app.get("/api/health", async () => (password ? { ok: true, auth: true, version } : { ok: true, version }));

  if (!password) {
    // Rien à protéger : /api/login répond simplement que la tour est ouverte.
    app.post("/api/login", async () => ({ ok: true, auth: false }));
    return;
  }

  const findSession = (token: string | undefined) => {
    if (!token) return null;
    const row = db.prepare("SELECT created_at FROM session WHERE token_hash = ?").get(hashToken(token)) as { created_at: number } | undefined;
    return row && Date.now() - row.created_at < SESSION_MAX_AGE * 1000 ? token : null;
  };
  const sessionCookie = (req: FastifyRequest) => req.cookies[SESSION_COOKIE];
  const bearer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    const m = typeof h === "string" ? /^Bearer\s+(.+)$/i.exec(h.trim()) : null;
    return m ? m[1] : undefined;
  };

  function tooMany(reply: FastifyReply, seconds: number) {
    return reply.code(429).header("Retry-After", String(seconds)).send({ error: `Trop d'essais. Réessaie dans ${seconds} s.`, code: "too_many_attempts", seconds });
  }

  app.addHook("onRequest", async (req, reply) => {
    if (OPEN_ROUTES.has(req.routeOptions.url ?? "")) return;
    // Route inconnue : la réponse « introuvable » (ou la page du site) ne livre rien.
    if (req.routeOptions.url === undefined) return;
    if (findSession(sessionCookie(req))) return;
    const token = bearer(req);
    if (token !== undefined) {
      if (findSession(token)) return;
      const wait = throttle.wait(req.ip);
      if (wait) return tooMany(reply, wait);
      if (safeEqual(token, password)) {
        throttle.succeed(req.ip);
        return;
      }
      throttle.fail(req.ip);
    }
    return reply.code(401).send(AUTH_REQUIRED);
  });

  // Une photo protégée ne doit jamais rester dans un cache partagé.
  app.addHook("onSend", async (req, reply, payload) => {
    const cc = reply.getHeader("cache-control");
    if (typeof cc === "string" && cc.includes("public") && !OPEN_ROUTES.has(req.routeOptions.url ?? "")) {
      reply.header("cache-control", cc.replace("public", "private"));
    }
    return payload;
  });

  app.post<{ Body: unknown }>("/api/login", async (req, reply) => {
    const wait = throttle.wait(req.ip);
    if (wait) return tooMany(reply, wait);
    const body = req.body as { password?: unknown } | null;
    const given = body && typeof body === "object" && typeof body.password === "string" ? body.password : "";
    if (!given || !safeEqual(given, password)) {
      throttle.fail(req.ip);
      return reply.code(401).send({ error: "Ce n'est pas le bon mot de passe.", code: "wrong_password" });
    }
    throttle.succeed(req.ip);
    const token = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO session (token_hash, created_at) VALUES (?, ?)").run(hashToken(token), Date.now());
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(req),
      maxAge: SESSION_MAX_AGE,
    });
    return { ok: true, auth: true };
  });

  app.post("/api/logout", async (req, reply) => {
    const token = sessionCookie(req) ?? bearer(req);
    if (token) db.prepare("DELETE FROM session WHERE token_hash = ?").run(hashToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: isHttps(req) });
    return { ok: true };
  });
}
