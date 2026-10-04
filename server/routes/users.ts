import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";

export type User = { id: string; name: string; color: string };
export const COOKIE = "atlas_user";

export function currentUser(db: Db, cookies: Record<string, string | undefined>): User | null {
  const id = cookies[COOKIE];
  if (!id) return null;
  return (db.prepare("SELECT id, name, color FROM user WHERE id = ?").get(id) as User | undefined) ?? null;
}

/**
 * Qui envoie ? Le navigateur a un cookie (SameSite=Lax) ; l'app et le raccourci envoient l'en-tête
 * `X-Atlas-User`. Jamais d'identité dans l'adresse : un site tiers pourrait la forger (CSRF), alors
 * qu'il ne peut pas poser d'en-tête personnalisé sans CORS, que Waysake n'autorise pas.
 */
export function identify(db: Db, req: { cookies: Record<string, string | undefined>; headers: Record<string, unknown> }): User | null {
  const header = req.headers["x-atlas-user"];
  const id = req.cookies[COOKIE] ?? (typeof header === "string" ? header : undefined);
  if (!id) return null;
  return (db.prepare("SELECT id, name, color FROM user WHERE id = ?").get(id) as User | undefined) ?? null;
}

export function userRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/users", async () => db.prepare("SELECT id, name, color FROM user ORDER BY id").all());

  app.get("/api/me", async (req) => ({ user: currentUser(db, req.cookies) }));

  app.post<{ Body: { userId?: string } }>("/api/me", async (req, reply) => {
    const user = db.prepare("SELECT id, name, color FROM user WHERE id = ?").get(req.body?.userId ?? "") as User | undefined;
    if (!user) return reply.code(400).send({ error: "Profil inconnu", code: "unknown_profile" });
    reply.setCookie(COOKIE, user.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    return { user };
  });
}
