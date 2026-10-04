import { useEffect, useState } from "react";
import type { Game, GameRound, GameScore, GameSummary, GuessResult, Media, MemoryGroup } from "../api.js";
import { setLocale, t, type Locale } from "../i18n/index.js";
import type { DemoRuntime } from "./types.js";
import "./demo.css";

/**
 * Mode démo statique (waysake.com/demo/) : aucun serveur. Les réponses GET viennent de `data/api.json`
 * (scripts/build-demo-data.ts), les photos de `data/m/`. Les écritures affichent « This is a demo… »,
 * sauf le Défi de « Where was it? », joué ici même (manches et score calculés dans le navigateur).
 */
const BASE = import.meta.env.BASE_URL;
const REPO = "https://github.com/Mariusfaitducode/waysake";
const ME = "alex";

type Data = { api: Record<string, unknown>; mediaTrips: Record<string, { slug: string; title: string }> };

/** Une action que la démo ne fait pas : un message, et une erreur que personne n'a besoin d'attraper. */
class DemoError extends Error {}

// ---- Réglages par l'adresse (iframe de la page d'accueil) : ?theme=dark|light, ?lang=en|fr ----
const params = new URLSearchParams(location.search);
const theme = params.get("theme");
if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
const lang = params.get("lang");
if (lang === "en" || lang === "fr") setLocale(lang as Locale);
// Une action bloquée rejette sa promesse : pas d'erreur rouge dans la console pour autant.
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason instanceof DemoError) e.preventDefault();
});

// ---- Données exportées ----
let loading: Promise<Data> | null = null;
const load = () =>
  (loading ??= fetch(`${BASE}data/api.json`)
    .then((r) => {
      if (!r.ok) throw new Error(t("api.unreachable"));
      return r.text();
    })
    .then((text) =>
      JSON.parse(
        // Les photos : miniature et aperçu réduits, servis à côté de la page (l'original n'est pas publié).
        text.replace(/\/api\/media\/(\d+)\/(thumb|preview|original)/g, (_, id: string, kind: string) => `${BASE}data/m/${id}-${kind === "thumb" ? "t" : "p"}.webp`),
      ) as Data,
    ));
const clone = <T,>(v: T): T => structuredClone(v);
const notFound = () => new Error(t("api.not_found"));

async function allMedia(): Promise<Media[]> {
  const page = (await load()).api["/api/media?limit=1000&cursor=0"] as { items: Media[] };
  return page.items;
}

// ---- « Il y a un an… » : calculé ici, pour le jour du visiteur (même logique que server/souvenirs.ts) ----
async function memories(today: string): Promise<{ groups: MemoryGroup[] }> {
  const { mediaTrips } = await load();
  const media = await allMedia();
  const year = Number(today.slice(0, 4));
  const md = today.slice(5, 10);
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = new Set([md, ...(md === "02-28" && !leap(year) ? ["02-29"] : [])]);
  const byYear = new Map<number, Media[]>();
  for (const m of media) {
    const at = m.takenAtLocal;
    if (!at || Number(at.slice(0, 4)) >= year || !days.has(at.slice(5, 10))) continue;
    const y = Number(at.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  const groups = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([y, items]) => {
      const sorted = items.sort((a, b) => (a.takenAtLocal ?? "").localeCompare(b.takenAtLocal ?? "") || a.id - b.id);
      return { year: y, yearsAgo: year - y, count: sorted.length, trip: mediaTrips[sorted[0].id] ?? null, media: clone(sorted.slice(0, 60)) };
    });
  return { groups };
}

// ---- « Where was it? » : le Défi, joué dans le navigateur ----
const ROUNDS = 10;
const score = (km: number) => Math.round(5000 * Math.exp(-km / 300));
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
type LocalRound = { media: Media; guess: { lat: number; lon: number; km: number; points: number } | null };
type LocalGame = { id: number; createdAt: number; rounds: LocalRound[] };
const games = new Map<number, LocalGame>();
let nextGameId = 1000;

async function newGame(): Promise<{ id: number }> {
  const pool = (await allMedia()).filter((m) => m.kind === "photo" && m.hasThumbs && m.lat !== null && m.lon !== null);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const id = nextGameId++;
  games.set(id, { id, createdAt: Date.now(), rounds: pool.slice(0, ROUNDS).map((media) => ({ media, guess: null })) });
  return { id };
}
const localScores = (g: LocalGame): GameScore[] => {
  const played = g.rounds.filter((r) => r.guess);
  return played.length ? [{ userId: ME, points: played.reduce((n, r) => n + r.guess!.points, 0), rounds: played.length }] : [];
};
function gameView(g: LocalGame): Game {
  const rounds: GameRound[] = g.rounds.map(({ media: m, guess }, index) => ({
    index,
    status: guess ? "agreed" : "open",
    media: { id: m.id, width: m.width, height: m.height, thumb: m.thumb, preview: m.preview },
    takenAtLocal: guess ? m.takenAtLocal : null,
    momentSize: 1,
    answer: guess ? { lat: m.lat!, lon: m.lon! } : null,
    guesses: guess ? [{ userId: ME, lat: guess.lat, lon: guess.lon, km: Math.round(guess.km * 10) / 10, points: guess.points }] : [],
  }));
  return { id: g.id, mode: "defi", createdBy: ME, createdAt: g.createdAt, rounds, scores: localScores(g) };
}
function guess(g: LocalGame, round: number, lat: number, lon: number): GuessResult {
  const r = g.rounds[round];
  if (!r || r.guess) throw new Error(t("api.invalid_request"));
  const km = distanceKm(lat, lon, r.media.lat!, r.media.lon!);
  r.guess = { lat, lon, km, points: score(km) };
  return { status: "agreed", km: Math.round(km * 10) / 10, points: r.guess.points, answer: { lat: r.media.lat!, lon: r.media.lon! } };
}
async function gameList() {
  const exported = clone((await load()).api["/api/games"]) as { games: GameSummary[]; records: { userId: string; points: number; gameId: number }[] };
  const local: GameSummary[] = [...games.values()].reverse().map((g) => {
    const played = g.rounds.filter((r) => r.guess).length;
    return { id: g.id, mode: "defi", createdBy: ME, createdAt: g.createdAt, rounds: g.rounds.length, played, done: played >= g.rounds.length, scores: localScores(g) };
  });
  // Record d'Alex : une partie complète jouée ici peut le battre.
  const records = exported.records.filter((r) => r.userId !== ME);
  const best = [...exported.records.filter((r) => r.userId === ME), ...local.filter((g) => g.done).map((g) => ({ userId: ME, points: g.scores[0]?.points ?? 0, gameId: g.id }))].sort(
    (a, b) => b.points - a.points,
  )[0];
  if (best) records.push(best);
  return { games: [...local, ...exported.games], records: records.sort((a, b) => b.points - a.points) };
}

// ---- Message des actions bloquées ----
const listeners = new Set<() => void>();
function blocked() {
  listeners.forEach((l) => l());
}
function reject(): Promise<never> {
  blocked();
  return Promise.reject(new DemoError(t("demo.blocked")));
}

function Chrome() {
  const [notice, setNotice] = useState(0);
  useEffect(() => {
    const show = () => setNotice((n) => n + 1);
    listeners.add(show);
    return () => void listeners.delete(show);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(0), 3600);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <>
      <a className="demo-badge" href={REPO} target="_blank" rel="noopener noreferrer">
        <span className="demo-badge__tag">{t("demo.badge")}</span>
        <span className="demo-badge__cta">{t("demo.install")}</span>
      </a>
      <div className="demo-toast-region" role="status" aria-live="polite">
        {notice > 0 && (
          <p className="demo-toast" key={notice}>
            <span>{t("demo.blocked")}</span>
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              {t("demo.install")}
            </a>
          </p>
        )}
      </div>
    </>
  );
}

export const demo: DemoRuntime | null = {
  async get(url) {
    const u = new URL(url, "http://demo");
    const path = u.pathname;
    if (path === "/api/memories") return memories(u.searchParams.get("today") ?? new Date().toISOString().slice(0, 10));
    if (path === "/api/places") return [];
    if (path === "/api/places/reverse") {
      const lat = Number(u.searchParams.get("lat"));
      const lon = Number(u.searchParams.get("lon"));
      return { lat, lon, name: null, country: null, countryCode: null, flag: null };
    }
    if (path === "/api/games") return gameList();
    const local = /^\/api\/games\/(\d+)$/.exec(path);
    if (local && games.has(Number(local[1]))) return gameView(games.get(Number(local[1]))!);
    const { api } = await load();
    const hit = api[url] ?? api[path];
    if (hit === undefined) throw notFound();
    return clone(hit);
  },
  async send(method, url, body) {
    const b = (body ?? {}) as { mode?: string; round?: number; lat?: number; lon?: number };
    if (method === "POST" && url === "/api/games" && b.mode === "defi") return newGame();
    const play = method === "POST" && /^\/api\/games\/(\d+)\/guess$/.exec(url);
    if (play && games.has(Number(play[1]))) return guess(games.get(Number(play[1]))!, b.round ?? -1, b.lat ?? 0, b.lon ?? 0);
    return reject();
  },
  url(path) {
    if (path.startsWith("/api/geo/countries.geojson")) return `${BASE}data/countries.geojson`;
    const postcard = /^\/api\/trips\/([^/]+)\/postcard\.jpg\?lang=(en|fr)/.exec(path);
    if (postcard) return `${BASE}data/postcards/${decodeURIComponent(postcard[1])}-${postcard[2]}.jpg`;
    return path;
  },
  blocked,
  Chrome,
};
