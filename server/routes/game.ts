import type { FastifyInstance, FastifyReply } from "fastify";
import type { Db } from "../db.js";
import { GameError, createGame, gameView, listGames, placeGuess } from "../game.js";
import { identify } from "./users.js";

const NEED_PROFILE = { error: "Choisis ton profil d'abord", code: "profile_required" };
const fail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof GameError) return reply.code(e.status).send({ error: e.message, code: e.code });
  throw e;
};
const isCoord = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;

export function gameRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/games", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    return listGames(db, user.id);
  });

  app.post<{ Body: { mode?: unknown } }>("/api/games", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    const mode = req.body?.mode;
    if (mode !== "defi" && mode !== "enquete") return reply.code(400).send({ error: "Mode de jeu inconnu.", code: "invalid_game_mode" });
    try {
      return { id: createGame(db, user.id, mode) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get<{ Params: { id: string } }>("/api/games/:id", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    try {
      return gameView(db, Number(req.params.id), user.id);
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post<{ Params: { id: string }; Body: { round?: unknown; lat?: unknown; lon?: unknown } }>("/api/games/:id/guess", async (req, reply) => {
    const user = identify(db, req);
    if (!user) return reply.code(401).send(NEED_PROFILE);
    const { round, lat, lon } = req.body ?? {};
    if (!Number.isInteger(round) || !isCoord(lat, 90) || !isCoord(lon, 180)) return reply.code(400).send({ error: "Épingle invalide.", code: "invalid_guess" });
    try {
      return placeGuess(db, Number(req.params.id), user.id, round as number, { lat, lon });
    } catch (e) {
      return fail(reply, e);
    }
  });
}
