/**
 * Données du mode démo statique (`pnpm build:demo`, voir web/demo/runtime.ts).
 *
 * 1. Lance le seed de démo (photos libres, scripts/seed.ts) dans un WAYSAKE_DATA_DIR temporaire.
 * 2. Démarre la tour en mémoire (sans port), y ajoute un peu de vie en anglais : couleurs de voyage,
 *    notes, envies, réactions, légendes, une partie « Where was it? » déjà jouée.
 * 3. Exporte toutes les réponses GET dont l'interface a besoin dans `<out>/data/api.json`,
 *    le contour des pays, les cartes postales, et les miniatures / aperçus (WebP réduits) dans `<out>/data/m/`.
 *
 * Usage : tsx scripts/build-demo-data.ts [dossier de sortie, dist-demo par défaut]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";

const out = resolve(process.argv[2] ?? "dist-demo");
const dataDir = mkdtempSync(join(tmpdir(), "waysake-demo-"));
const DEMO_USER = "alex";
/** Aperçus réduits : la démo doit rester légère (≤ ~25 Mo en tout). */
const PREVIEW_PX = 1024;
const PREVIEW_QUALITY = 56;
const THUMB_QUALITY = 68;
/** Contour des pays arrondi au millième de degré (~100 m) : invisible sur le globe, 2 fois plus léger. */
const GEO_DIGITS = 3;

console.log(`seed de démo dans ${dataDir}`);
const seed = spawnSync("pnpm", ["-s", "seed"], { env: { ...process.env, WAYSAKE_DATA_DIR: dataDir, WAYSAKE_PROFILES: "" }, encoding: "utf8" });
// onnxruntime peut faire avorter le processus à sa fermeture : seule compte la ligne de bilan.
if (!/photos ajoutées/.test(seed.stdout ?? "")) {
  console.error(seed.stdout, seed.stderr);
  throw new Error("le seed de démo a échoué");
}
console.log(seed.stdout.trim().split("\n").slice(-2).join("\n"));

process.env.WAYSAKE_DATA_DIR = dataDir;
const { buildApp } = await import("../server/app.js");
const { createGame, placeGuess } = await import("../server/game.js");
const app = await buildApp({ dataDir, password: "" });
await app.waysake.colors.idle();
const db = app.waysake.db;

const cookie = (user: string) => ({ cookie: `atlas_user=${user}` });
async function get<T = unknown>(url: string, user = DEMO_USER): Promise<T> {
  const r = await app.inject({ method: "GET", url, headers: cookie(user) });
  if (r.statusCode !== 200) throw new Error(`GET ${url} → ${r.statusCode} ${r.body}`);
  return r.json() as T;
}
async function write(method: "POST" | "PUT" | "PATCH", url: string, payload: unknown, user = DEMO_USER) {
  const r = await app.inject({ method, url, payload: payload as object, headers: cookie(user) });
  if (r.statusCode >= 300) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
  return r.json();
}

type TripRow = { id: number; slug: string; title: string; startAt: number };
type Media = { id: number; lat: number | null; lon: number | null; takenAtLocal: string | null };
type TripDetail = TripRow & { chapters: { id: number; title: string; media: Media[] }[] };

// --- Un peu de vie, en anglais ---------------------------------------------------------------
const trips = await get<TripRow[]>("/api/trips");
const tripBy = (re: RegExp) => {
  const t = trips.find((x) => re.test(x.title));
  if (!t) throw new Error(`voyage de démo introuvable : ${re}`);
  return t;
};
const amsterdam = tripBy(/Amsterdam/);
const berlin = tripBy(/Berlin/);
const canaries = tripBy(/Canaries/);
const sicily = tripBy(/Sicile/);
const roadTrip = [...trips].sort((a, b) => b.startAt - a.startAt)[0];

// Des couleurs bien distinctes sur le globe.
for (const [trip, color] of [
  [amsterdam, "azure"],
  [berlin, "raspberry"],
  [canaries, "coral"],
  [sicily, "lagoon"],
  [roadTrip, "amber"],
] as const)
  await write("PUT", `/api/trips/${trip.slug}/color`, { color });

const detail = async (t: TripRow) => get<TripDetail>(`/api/trips/${t.slug}`);
const [dRoad, dSicily, dCanaries, dAmsterdam] = await Promise.all([detail(roadTrip), detail(sicily), detail(canaries), detail(amsterdam)]);

const note = (trip: TripRow, chapterId: number | null, body: string, user: string) => write("PUT", "/api/notes", { tripId: trip.id, chapterId, body }, user);
await note(roadTrip, null, "Three weeks, one tiny rental car, eleven stops. We said we'd keep it slow — we didn't, and it was perfect.", "alex");
await note(roadTrip, dRoad.chapters[2]?.id ?? null, "Up at 5:30 to have the lake to ourselves. Worth every minute of lost sleep.", "sam");
await note(roadTrip, dRoad.chapters.at(-1)?.id ?? null, "Walked the city walls at sunset. Sam bought far too much fig jam.", "alex");
await note(sicily, null, "Cannoli count: 14. Arancini count: we stopped counting.", "sam");
await note(sicily, dSicily.chapters[2]?.id ?? null, "Hiked to the 1,900 m craters. Smelled like sulphur and hot stones.", "alex");
await note(canaries, null, "Winter sun! Teide at dawn above the clouds was unreal.", "sam");
await note(amsterdam, null, "Tulip season, bikes everywhere, and the best apple pie at Winkel 43.", "alex");

const wishes = [
  { title: "Northern lights in Lofoten", countryCode: "NO", lat: 68.2, lon: 14.0, month: "2027-02", note: "Rent a red cabin by the water. Pack the thermals.", user: "sam" },
  { title: "Cherry blossoms in Kyoto", countryCode: "JP", lat: 35.0116, lon: 135.7681, month: "2027-04", note: "Philosopher's Path early in the morning.", user: "alex" },
  { title: "Lisbon by tram", countryCode: "PT", lat: 38.7223, lon: -9.1393, month: null, note: "Tram 28, pastéis de nata, sunset at a miradouro.", user: "sam" },
  { title: "Road trip through Iceland's ring road", countryCode: "IS", lat: 64.9631, lon: -19.0208, month: null, note: "", user: "alex" },
];
for (const { user, ...w } of wishes) await write("POST", "/api/wishes", w, user);
const done = (await write("POST", "/api/wishes", { title: "Swim in Lago di Braies", countryCode: "IT", lat: 46.6943, lon: 12.0853, note: "Freezing. Glorious.", }, "sam")) as { id: number };
await write("PATCH", `/api/wishes/${done.id}`, { done: true, doneTripSlug: roadTrip.slug }, "sam");

// Réactions et légendes sur quelques photos.
const allTripMedia = [dRoad, dSicily, dCanaries, dAmsterdam].flatMap((t) => t.chapters.flatMap((c) => c.media));
const captions = ["Best gelato of the trip, no contest.", "The view that made us pull over.", "Golden hour, no filter.", "We got lost here. Happily."];
for (const [i, m] of allTripMedia.filter((_, i) => i % 9 === 0).entries()) {
  await write("POST", `/api/media/${m.id}/reactions`, { emoji: ["❤️", "🤩", "😂", "😮"][i % 4], on: true }, i % 2 ? "alex" : "sam");
  if (i % 3 === 0) await write("POST", `/api/media/${m.id}/reactions`, { emoji: "❤️", on: true }, i % 2 ? "sam" : "alex");
  if (i < captions.length * 2 && i % 2 === 0) await write("PUT", `/api/media/${m.id}/note`, { text: captions[i / 2] }, i % 4 ? "alex" : "sam");
}

// Une partie de « Where was it? » déjà jouée par les deux, pour les records et l'historique.
let s = 42;
const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const gameId = createGame(db, "sam", "defi", rng);
const rounds = JSON.parse((db.prepare("SELECT rounds FROM game WHERE id = ?").get(gameId) as { rounds: string }).rounds) as { mediaId: number }[];
const at = db.prepare("SELECT lat, lon FROM media WHERE id = ?");
rounds.forEach((r, i) => {
  const m = at.get(r.mediaId) as { lat: number; lon: number };
  for (const [user, spread] of [["sam", 1.6], ["alex", 2.4]] as const)
    placeGuess(db, gameId, user, i, { lat: m.lat + (rng() - 0.5) * spread, lon: m.lon + (rng() - 0.5) * spread });
});

// --- Export ----------------------------------------------------------------------------------
const api: Record<string, unknown> = {};
const keep = async (url: string) => (api[url] = await get(url));
for (const url of ["/api/health", "/api/users", "/api/me", "/api/countries", "/api/overview", "/api/notes", "/api/wishes", "/api/unlocated", "/api/space", "/api/stats/overview", "/api/games"])
  await keep(url);
// « Moi » : la démo ouvre directement sur le profil d'Alex.
api["/api/me"] = { user: (api["/api/users"] as { id: string }[]).find((u) => u.id === DEMO_USER) };
const media = await get<{ items: Media[]; nextCursor: string | null }>("/api/media?limit=1000&cursor=0");
if (media.nextCursor !== null) throw new Error("plus de 1000 médias : la démo n'en exporte qu'une page");
api["/api/media?limit=1000&cursor=0"] = media;
await keep(`/api/games/${gameId}`);

const finalTrips = await get<TripRow[]>("/api/trips");
api["/api/trips"] = finalTrips;
/** Pour les souvenirs (« Il y a un an… »), calculés dans le navigateur : à quel voyage appartient chaque photo. */
const mediaTrips: Record<number, { slug: string; title: string }> = {};
for (const t of finalTrips) {
  const d = await get<TripDetail>(`/api/trips/${t.slug}`);
  api[`/api/trips/${t.slug}`] = d;
  await keep(`/api/trips/${t.slug}/stats`);
  for (const c of d.chapters) for (const m of c.media) mediaTrips[m.id] = { slug: t.slug, title: t.title };
}

const dataOut = join(out, "data");
rmSync(dataOut, { recursive: true, force: true });
mkdirSync(join(dataOut, "m"), { recursive: true });
mkdirSync(join(dataOut, "postcards"), { recursive: true });
writeFileSync(join(dataOut, "api.json"), JSON.stringify({ api, mediaTrips, builtAt: Date.now() }));
const geo = (await app.inject({ url: "/api/geo/countries.geojson" })).json() as { features: { geometry: { coordinates: unknown } }[] };
const k = 10 ** GEO_DIGITS;
const round = (v: unknown): unknown => (Array.isArray(v) ? v.map(round) : typeof v === "number" ? Math.round(v * k) / k : v);
for (const f of geo.features) f.geometry.coordinates = round(f.geometry.coordinates);
writeFileSync(join(dataOut, "countries.geojson"), JSON.stringify(geo));

// Cartes postales : une par voyage et par langue (le titre est celui que l'interface afficherait).
const { setLocale } = await import("../web/i18n/index.js");
const { placeTitle } = await import("../web/i18n/places.js");
for (const lang of ["en", "fr"] as const) {
  setLocale(lang);
  for (const t of finalTrips) {
    const r = await app.inject({ url: `/api/trips/${t.slug}/postcard.jpg?lang=${lang}&title=${encodeURIComponent(placeTitle(t.title))}` });
    if (r.statusCode !== 200) throw new Error(`carte postale ${t.slug} → ${r.statusCode}`);
    writeFileSync(join(dataOut, "postcards", `${t.slug}-${lang}.jpg`), await sharp(r.rawPayload).jpeg({ quality: 78, mozjpeg: true }).toBuffer());
  }
}

// Miniatures (400 px) et aperçus (réduits) de chaque photo.
const all = media.items as (Media & { hasThumbs: boolean })[];
await Promise.all(
  Array.from({ length: 6 }, async (_, w) => {
    for (let i = w; i < all.length; i += 6) {
      const m = all[i];
      if (!m.hasThumbs) continue;
      const thumb = (await app.inject({ url: `/api/media/${m.id}/thumb` })).rawPayload;
      const preview = (await app.inject({ url: `/api/media/${m.id}/preview` })).rawPayload;
      writeFileSync(join(dataOut, "m", `${m.id}-t.webp`), await sharp(thumb).webp({ quality: THUMB_QUALITY }).toBuffer());
      writeFileSync(
        join(dataOut, "m", `${m.id}-p.webp`),
        await sharp(preview).resize(PREVIEW_PX, PREVIEW_PX, { fit: "inside", withoutEnlargement: true }).webp({ quality: PREVIEW_QUALITY }).toBuffer(),
      );
    }
  }),
);

await app.close();
rmSync(dataDir, { recursive: true, force: true });

const size = (dir: string): number => readdirSync(dir).reduce((n, f) => n + (statSync(join(dir, f)).isDirectory() ? size(join(dir, f)) : statSync(join(dir, f)).size), 0);
console.log(`démo : ${all.length} médias, ${finalTrips.length} voyages · données ${(size(dataOut) / 1e6).toFixed(1)} Mo · dossier ${(size(out) / 1e6).toFixed(1)} Mo`);
process.exit(0);
