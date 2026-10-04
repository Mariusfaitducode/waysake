/**
 * Spike / test de contrat Atlas × Immich — contre une stack Immich jetable et figée (v3.2.4) :
 *
 *   scripts/immich-spike/run.sh            # démarre la stack, lance ce script, puis la supprime
 *
 * Il crée l'admin (ou se connecte), une seconde utilisatrice, des clés API, téléverse des photos de
 * test (EXIF GPS/date, HEIC, vidéo), puis vérifie la recherche, les modifications, les miniatures,
 * la vidéo, l'archivage, la corbeille, la suppression, les albums, le partage partenaire, le flux de
 * synchro et le webhook des Workflows. Chaque observation est imprimée (« NOTE … ») et les réponses
 * utiles sont enregistrées en fixtures JSON (test/fixtures/immich/ par défaut).
 * Résultats commentés : docs/superpowers/specs/2026-10-04-atlas-immich-design.md, §11.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { makeJpeg } from "../../test/fixtures.js";
import { makeVideo } from "../../test/video.js";

const REPO = resolve(import.meta.dirname, "../..");
const BASE = process.env.IMMICH_URL ?? "http://127.0.0.1:22883/api";
const OUT = resolve(process.env.FIXTURES ?? join(REPO, "test/fixtures/immich"));
const FILLER = Number(process.env.FILLER ?? 120);
const HOOK_PORT = Number(process.env.HOOK_PORT ?? 22884);
mkdirSync(OUT, { recursive: true });

const notes: string[] = [];
const note = (s: string) => {
  notes.push(s);
  console.log("NOTE", s);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Auth = { token?: string; key?: string };
type Res = { status: number; headers: Record<string, string>; body: any; ms: number; raw?: any };
const KEEP_HEADERS = [
  "content-type", "content-length", "cache-control", "etag", "last-modified", "content-range",
  "accept-ranges", "content-disposition", "vary",
];

async function call(method: string, path: string, auth: Auth, opts: { json?: unknown; form?: FormData; headers?: Record<string, string>; binary?: boolean } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (auth.token) headers.authorization = `Bearer ${auth.token}`;
  if (auth.key) headers["x-api-key"] = auth.key;
  let body: any;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) body = opts.form;
  const t0 = performance.now();
  const r = await fetch(BASE + path, { method, headers, body });
  const buf = Buffer.from(await r.arrayBuffer());
  const ms = Math.round(performance.now() - t0);
  const h: Record<string, string> = {};
  for (const k of KEEP_HEADERS) if (r.headers.get(k)) h[k] = r.headers.get(k)!;
  let parsed: any = buf;
  if (!opts.binary && (r.headers.get("content-type") ?? "").includes("json")) parsed = buf.length ? JSON.parse(buf.toString()) : null;
  else if (!opts.binary && (r.headers.get("content-type") ?? "").startsWith("text")) parsed = buf.toString();
  // POST /search/metadata renvoie { albums, assets } : on déballe assets, la fixture garde le brut.
  if (path === "/search/metadata" && parsed && parsed.assets) return { status: r.status, headers: h, body: parsed.assets, ms, raw: parsed };
  return { status: r.status, headers: h, body: parsed, ms };
}

/** Enregistre une fixture : requête + réponse (corps binaire résumé). */
function fixture(name: string, req: { method: string; path: string; body?: unknown; headers?: Record<string, string> }, res: Res, transform?: (b: any) => any) {
  let body = res.raw ?? res.body;
  if (Buffer.isBuffer(body)) body = { binaryBytes: body.length };
  if (transform) body = transform(body);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ request: req, response: { status: res.status, headers: res.headers, body } }, null, 2) + "\n");
}

const must = (r: Res, what: string) => {
  if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

// ---------------------------------------------------------------- comptes
const ADMIN = { email: "alex@atlas.test", password: "spike-password", name: "Alex" };
const YAS = { email: "sam@atlas.test", password: "spike-password", name: "Sam" };

async function login(u: { email: string; password: string }) {
  return must(await call("POST", "/auth/login", {}, { json: { email: u.email, password: u.password } }), "login").accessToken as string;
}

const version = must(await call("GET", "/server/version", {}), "version");
note(`Version Immich : ${JSON.stringify(version)} (GET /server/version sans authentification)`);
fixture("server-version", { method: "GET", path: "/server/version" }, await call("GET", "/server/version", {}));

const signup = await call("POST", "/auth/admin-sign-up", {}, { json: ADMIN });
note(`admin-sign-up : ${signup.status}`);
const mToken = await login(ADMIN);
let yToken: string;
try {
  yToken = await login(YAS);
} catch {
  must(await call("POST", "/admin/users", { token: mToken }, { json: { ...YAS, shouldChangePassword: false } }), "create sam");
  yToken = await login(YAS);
}
const alex = must(await call("GET", "/users/me", { token: mToken }), "me");
const sam = must(await call("GET", "/users/me", { token: yToken }), "me y");

// ---------------------------------------------------------------- clés API
async function makeKey(token: string, name: string, permissions: string[]) {
  const r = await call("POST", "/api-keys", { token }, { json: { name, permissions } });
  return { status: r.status, body: r.body, secret: r.body?.secret as string | undefined };
}
const empty = await makeKey(mToken, "spike-vide", []);
note(`Clé sans permission : ${empty.status} ${JSON.stringify(empty.body?.message ?? "")}`);
const weak = (await makeKey(mToken, "spike-faible", ["server.about"])).secret!;


// ---------------------------------------------------------------- téléversements
type Up = { label: string; data: Buffer; name: string; created: string; owner: "m" | "y"; mime: string };
const PLACES: [string, number, number, string, string][] = [
  ["lisbonne", 38.7139, -9.1394, "2026:06:12 10:15:00", "+01:00"],
  ["porto", 41.1496, -8.611, "2026:06:14 18:40:00", "+01:00"],
  ["paris", 48.8584, 2.2945, "2026:08:02 09:05:00", "+02:00"],
  ["tokyo", 35.6595, 139.7005, "2026:04:03 21:30:00", "+09:00"],
  ["new-york", 40.758, -73.9855, "2026:01:20 15:00:00", "-05:00"],
  ["reykjavik", 64.1466, -21.9426, "2025:12:30 12:00:00", "+00:00"],
];
const uploads: Up[] = [];
for (const [label, lat, lon, takenAt, offset] of PLACES) {
  uploads.push({ label, data: await makeJpeg({ takenAt, offset, lat, lon, width: 800, height: 600, color: "#" + createHash("md5").update(label).digest("hex").slice(0, 6) }), name: `${label}.jpg`, created: "2026-10-04T00:00:00.000Z", owner: "m", mime: "image/jpeg" });
}
uploads.push({ label: "sans-gps", data: await makeJpeg({ takenAt: "2026:07:01 08:00:00", offset: "+02:00", width: 800, height: 600, color: "#335577" }), name: "sans-gps.jpg", created: "2026-10-04T00:00:00.000Z", owner: "m", mime: "image/jpeg" });
uploads.push({ label: "sans-exif", data: await sharp({ create: { width: 640, height: 480, channels: 3, background: "#aa2233" } }).jpeg().toBuffer(), name: "capture.jpg", created: "2026-03-03T03:03:03.000Z", owner: "m", mime: "image/jpeg" });
uploads.push({ label: "heic", data: readFileSync(join(REPO, "test/assets/sample.heic")), name: "sample.heic", created: "2026-10-04T00:00:00.000Z", owner: "m", mime: "image/heic" });
uploads.push({ label: "video", data: makeVideo({ creationTime: "2026-06-13T12:00:00Z", location: "+38.7139-009.1394/", seconds: 3, ext: "mov" }), name: "clip.mov", created: "2026-06-13T12:00:00.000Z", owner: "m", mime: "video/quicktime" });
uploads.push({ label: "yas-rome", data: await makeJpeg({ takenAt: "2026:05:05 11:00:00", offset: "+02:00", lat: 41.8902, lon: 12.4922, width: 800, height: 600, color: "#22aa66" }), name: "rome.jpg", created: "2026-10-04T00:00:00.000Z", owner: "y", mime: "image/jpeg" });
uploads.push({ label: "yas-archive", data: await makeJpeg({ takenAt: "2026:05:06 11:00:00", offset: "+02:00", lat: 41.9, lon: 12.5, width: 800, height: 600, color: "#2266aa" }), name: "rome-archive.jpg", created: "2026-10-04T00:00:00.000Z", owner: "y", mime: "image/jpeg" });
for (let i = 0; i < FILLER; i++) {
  const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000);
  const ts = d.toISOString().replace(/-/g, ":").replace("T", " ").slice(0, 19);
  uploads.push({ label: `filler-${i}`, data: await makeJpeg({ takenAt: ts, offset: "+01:00", lat: 45 + i / 100, lon: 5 + i / 100, width: 64, height: 48, color: "#" + (0x100000 + i * 997).toString(16).slice(-6) }), name: `IMG_${1000 + i}.jpg`, created: d.toISOString(), owner: "m", mime: "image/jpeg" });
}

const ids: Record<string, string> = {};
const sha1: Record<string, string> = {};
async function upload(u: Up, extraHeaders: Record<string, string> = {}) {
  const form = new FormData();
  form.set("assetData", new Blob([new Uint8Array(u.data)], { type: u.mime }), u.name);
  form.set("fileCreatedAt", u.created);
  form.set("fileModifiedAt", u.created);
  return call("POST", "/assets", { token: u.owner === "m" ? mToken : yToken }, { form, headers: extraHeaders });
}
const tUp = performance.now();
for (const u of uploads) {
  const r = await upload(u);
  if (r.status >= 300) throw new Error(`upload ${u.label}: ${r.status} ${JSON.stringify(r.body)}`);
  ids[u.label] = r.body.id;
  sha1[u.label] = createHash("sha1").update(u.data).digest("base64");
  if (u.label === "lisbonne") fixture("upload-created", { method: "POST", path: "/assets", body: "multipart: assetData, fileCreatedAt, fileModifiedAt" }, r);
}
note(`${uploads.length} téléversements en ${Math.round(performance.now() - tUp)} ms`);
const dup = await upload(uploads[0]);
note(`Re-téléversement identique : ${dup.status} ${JSON.stringify(dup.body)}`);
fixture("upload-duplicate", { method: "POST", path: "/assets" }, dup);
const dupHdr = await upload(uploads[1], { "x-immich-checksum": createHash("sha1").update(uploads[1].data).digest("hex") });
note(`Avec x-immich-checksum (hex) : ${dupHdr.status} ${JSON.stringify(dupHdr.body)}`);
const bulkCheck = await call("POST", "/assets/bulk-upload-check", { token: mToken }, { json: { assets: [{ id: "local-1", checksum: sha1.lisbonne }, { id: "local-2", checksum: createHash("sha1").update("absent").digest("base64") }] } });
note(`bulk-upload-check : ${bulkCheck.status} ${JSON.stringify(bulkCheck.body)}`);
fixture("bulk-upload-check", { method: "POST", path: "/assets/bulk-upload-check" }, bulkCheck);

// ---------------------------------------------------------------- attente des traitements
async function getAsset(id: string, auth: Auth = { token: mToken }) {
  return call("GET", `/assets/${id}`, auth);
}
const tWait = performance.now();
for (let i = 0; i < 120; i++) {
  const a = (await getAsset(ids.lisbonne)).body;
  const v = (await getAsset(ids.video)).body;
  const thumb = await call("GET", `/assets/${ids["filler-" + (FILLER - 1)]}/thumbnail?size=thumbnail`, { token: mToken }, { binary: true });
  if (a.exifInfo?.city && v.exifInfo && thumb.status === 200) break;
  await sleep(1000);
}
note(`Extraction des métadonnées + géocodage + miniatures : ~${Math.round((performance.now() - tWait) / 1000)} s après la fin des envois (${uploads.length} fichiers, ML désactivé)`);
await sleep(3000);

// ---------------------------------------------------------------- clé minimale
const MIN_PERMS = ["asset.read", "asset.view", "asset.download", "user.read", "partner.read"];
const minKey = await makeKey(mToken, "atlas-lecture", MIN_PERMS);
fixture("api-key-create", { method: "POST", path: "/api-keys", body: { name: "atlas-lecture", permissions: MIN_PERMS } }, { ...(await call("GET", "/api-keys", { token: mToken })), body: minKey.body } as Res, (b) => ({ ...b, secret: "<secret>" }));
const K: Auth = { key: minKey.secret! };
const kme = await call("GET", "/api-keys/me", K);
note(`GET /api-keys/me avec la clé minimale : ${kme.status} ${JSON.stringify(kme.body).slice(0, 300)}`);
fixture("api-key-me", { method: "GET", path: "/api-keys/me" }, kme);

const endpoints: [string, string, unknown?][] = [
  ["GET", "/users/me"],
  ["GET", `/assets/${ids.lisbonne}`],
  ["POST", "/search/metadata", { size: 1 }],
  ["GET", `/assets/${ids.lisbonne}/thumbnail?size=thumbnail`],
  ["GET", `/assets/${ids.lisbonne}/thumbnail?size=preview`],
  ["GET", `/assets/${ids.lisbonne}/original`],
  ["GET", `/assets/${ids.video}/video/playback`],
  ["GET", "/partners?direction=shared-with"],
  ["GET", "/map/markers"],
  ["GET", "/albums"],
  ["POST", "/albums", { albumName: "probe" }],
  ["PUT", `/assets/${ids.lisbonne}`, { isFavorite: false }],
  ["POST", "/sync/stream", { types: ["AssetsV1"] }],
  ["GET", "/server/about"],
  ["GET", "/server/statistics"],
  ["GET", "/workflows"],
];
const permTable: string[] = [];
for (const [m, p, b] of endpoints) {
  const r = await call(m, p, { key: weak }, { json: b, binary: true });
  let msg = "";
  try { msg = JSON.parse(r.body.toString()).message; } catch { /* binaire */ }
  const r2 = await call(m, p, K, { json: b, binary: true });
  let msg2 = "";
  try { msg2 = JSON.parse(r2.body.toString()).message; } catch { /* binaire */ }
  permTable.push(`| ${m} ${p.replace(/[0-9a-f-]{36}/g, "{id}")} | ${r.status} ${msg ?? ""} | ${r2.status} ${r2.status >= 300 ? msg2 : ""} |`);
}
note("Permissions (clé `server.about` seule → clé minimale " + MIN_PERMS.join(",") + ") :\n| Endpoint | Clé faible | Clé minimale |\n|---|---|---|\n" + permTable.join("\n"));

// ---------------------------------------------------------------- recherche
const s1 = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 5, withExif: true } });
note(`search size=5 : ${s1.status}, count=${s1.body.count}, nextCursor=${String(s1.body.nextCursor).slice(0, 40)}…, total=${s1.body.total}, nextPage=${s1.body.nextPage}, facets=${JSON.stringify(s1.body.facets)} (${s1.ms} ms)`);
note(`Ordre par défaut (5 premiers fileCreatedAt) : ${s1.body.items.map((a: any) => a.fileCreatedAt).join(", ")}`);
fixture("search-page1", { method: "POST", path: "/search/metadata", body: { filter: {}, size: 5, withExif: true } }, s1);
const s2 = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 5, withExif: true, cursor: s1.body.nextCursor } });
fixture("search-page2", { method: "POST", path: "/search/metadata", body: { filter: {}, size: 5, withExif: true, cursor: "<nextCursor de page1>" } }, s2);
note(`page 2 : ${s2.status} count=${s2.body.count}, recouvrement avec page 1 : ${s2.body.items.filter((a: any) => s1.body.items.some((b: any) => b.id === a.id)).length}`);
const noexif = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1 } });
note(`sans withExif : exifInfo présent ? ${noexif.body.items[0].exifInfo !== undefined} ; clés de l'asset : ${Object.keys(noexif.body.items[0]).join(",")}`);

const legacy = await call("POST", "/search/metadata", K, { json: { size: 2 } });
note(`Sans filter (mode v1) : total=${legacy.body.total} nextPage=${legacy.body.nextPage} nextCursor=${legacy.body.nextCursor} ; corps = ${Object.keys(legacy.raw ?? {}).join(",")}`);
fixture("search-legacy-no-filter", { method: "POST", path: "/search/metadata", body: { size: 2 } }, legacy);
const mix = await call("POST", "/search/metadata", K, { json: { size: 2, filter: {}, page: 2 } });
note(`filter + page : ${mix.status} ${JSON.stringify(mix.body)}`);
const badCursor = await call("POST", "/search/metadata", K, { json: { size: 2, filter: {}, cursor: "x" } });
note(`cursor invalide : ${badCursor.status} ${JSON.stringify(badCursor.body)}`);
note(`Contenu du cursor décodé : ${Buffer.from(String(s1.body.nextCursor), "base64").toString()}`);
// Pagination complète (temps), taille max
const tAll = performance.now();
let cursor: string | undefined; let pages = 0; let total = 0; const seen = new Set<string>();
do {
  const r = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1000, withExif: true, cursor } });
  must(r, "page");
  pages++; total += r.body.count; r.body.items.forEach((a: any) => seen.add(a.id));
  cursor = r.body.nextCursor ?? undefined;
} while (cursor);
note(`Inventaire complet (size=1000, withExif) : ${total} assets / ${seen.size} uniques en ${pages} page(s), ${Math.round(performance.now() - tAll)} ms`);
const big = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1001 } });
note(`size=1001 : ${big.status} ${JSON.stringify(big.body?.message ?? "")}`);
const smallPages = [];
cursor = undefined;
do {
  const r = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 50, cursor } });
  smallPages.push(r.body.count);
  cursor = r.body.nextCursor ?? undefined;
} while (cursor);
note(`Pagination size=50 : pages de ${smallPages.join("+")}`);
const lastPageCursor = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1000 } });
note(`Dernière page : nextCursor = ${JSON.stringify(lastPageCursor.body.nextCursor)}`);

// Filtres
const fTaken = await call("POST", "/search/metadata", K, { json: { withExif: true, filter: { takenAt: { gte: "2026-06-01T00:00:00.000Z", lt: "2026-07-01T00:00:00.000Z" } } } });
note(`filter.takenAt juin 2026 : ${fTaken.status} → ${fTaken.body.items?.map((a: any) => a.originalFileName).join(", ") ?? JSON.stringify(fTaken.body)}`);
fixture("search-filter-takenAt", { method: "POST", path: "/search/metadata", body: { withExif: true, filter: { takenAt: { gte: "2026-06-01T00:00:00.000Z", lt: "2026-07-01T00:00:00.000Z" } } } }, fTaken);
const vis = await call("POST", "/search/metadata", K, { json: { size: 1000, filter: { visibility: { eq: "hidden" } } } });
note(`filter.visibility=hidden : ${vis.status} ${vis.body.count ?? JSON.stringify(vis.body)}`);
const order = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 3, orderBy: { field: "fileCreatedAt", direction: "asc" } } });
note(`orderBy fileCreatedAt asc : ${order.status} ${order.body.items?.map((a: any) => a.fileCreatedAt).join(", ") ?? JSON.stringify(order.body)}`);
const orderOld = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 3, order: "asc" } });
note(`order (déprécié) asc : ${orderOld.status} ${orderOld.body.items?.map((a: any) => a.fileCreatedAt).join(", ")}`);

// Champs exif réels
for (const l of ["lisbonne", "tokyo", "new-york", "sans-gps", "sans-exif", "heic", "video"]) {
  const a = (await getAsset(ids[l], K)).body;
  note(`${l} : type=${a.type} mime=${a.originalMimeType} fileCreatedAt=${a.fileCreatedAt} localDateTime=${a.localDateTime} w×h=${a.width}×${a.height} duration=${a.duration} checksum=${a.checksum} (sha1 local ${sha1[l]}) visibility=${a.visibility} exif={lat:${a.exifInfo?.latitude}, lon:${a.exifInfo?.longitude}, city:${a.exifInfo?.city}, state:${a.exifInfo?.state}, country:${a.exifInfo?.country}, tz:${a.exifInfo?.timeZone}, dto:${a.exifInfo?.dateTimeOriginal}, size:${a.exifInfo?.fileSizeInByte}, make:${a.exifInfo?.make}, model:${a.exifInfo?.model}, w:${a.exifInfo?.exifImageWidth}}`);
}
fixture("asset-photo-gps", { method: "GET", path: "/assets/{id}" }, await getAsset(ids.tokyo, K));
fixture("asset-photo-sans-gps", { method: "GET", path: "/assets/{id}" }, await getAsset(ids["sans-exif"], K));
fixture("asset-video", { method: "GET", path: "/assets/{id}" }, await getAsset(ids.video, K));
fixture("asset-heic", { method: "GET", path: "/assets/{id}" }, await getAsset(ids.heic, K));

// ---------------------------------------------------------------- updatedAt et modifications
async function watchUpdate(label: string, change: () => Promise<Res>) {
  const before = (await getAsset(ids[label], K)).body;
  const t = new Date().toISOString();
  await sleep(1100);
  const r = await change();
  const now = (await getAsset(ids[label], K)).body;
  await sleep(6000);
  const later = (await getAsset(ids[label], K)).body;
  const found = await call("POST", "/search/metadata", K, { json: { size: 1000, withExif: true, filter: { updatedAt: { gt: t } } } });
  return { r, before, now, later, inSearch: found.body.items?.some((a: any) => a.id === ids[label]), foundCount: found.body.count };
}
const loc = await watchUpdate("paris", () => call("PUT", `/assets/${ids.paris}`, { token: mToken }, { json: { latitude: 43.2965, longitude: 5.3698 } }));
note(`PUT /assets/{id} lat/lon (Paris→Marseille) : ${loc.r.status}. updatedAt ${loc.before.updatedAt} → ${loc.now.updatedAt} (immédiat) → ${loc.later.updatedAt} (+6 s). exif ${loc.before.exifInfo.latitude},${loc.before.exifInfo.city} → ${loc.now.exifInfo.latitude},${loc.now.exifInfo.city} → ${loc.later.exifInfo.latitude},${loc.later.exifInfo.city}. Vu par filter.updatedAt.gt : ${loc.inSearch} (${loc.foundCount} résultats)`);
fixture("asset-after-location-edit", { method: "GET", path: "/assets/{id}" }, { status: 200, headers: {}, body: loc.later, ms: 0 });
const date = await watchUpdate("porto", () => call("PUT", "/assets", { token: mToken }, { json: { ids: [ids.porto], dateTimeOriginal: "2026-06-15T09:00:00.000+01:00" } }));
note(`PUT /assets dateTimeOriginal (Porto) : ${date.r.status}. updatedAt ${date.before.updatedAt} → ${date.now.updatedAt} → ${date.later.updatedAt}. fileCreatedAt ${date.before.fileCreatedAt} → ${date.later.fileCreatedAt}, localDateTime ${date.before.localDateTime} → ${date.later.localDateTime}, dto ${date.later.exifInfo.dateTimeOriginal}, tz ${date.later.exifInfo.timeZone}. Vu par updatedAt.gt : ${date.inSearch}`);
const fav = await watchUpdate("tokyo", () => call("PUT", `/assets/${ids.tokyo}`, { token: mToken }, { json: { isFavorite: true } }));
note(`Favori : updatedAt ${fav.before.updatedAt} → ${fav.later.updatedAt}, vu par updatedAt.gt : ${fav.inSearch}`);
const desc = await watchUpdate("lisbonne", () => call("PUT", `/assets/${ids.lisbonne}`, { token: mToken }, { json: { description: "Tram 28" } }));
note(`Description : updatedAt ${desc.before.updatedAt} → ${desc.later.updatedAt}, vu par updatedAt.gt : ${desc.inSearch}`);

// ---------------------------------------------------------------- miniatures, aperçus, original
for (const size of ["thumbnail", "preview", "fullsize"]) {
  for (const l of ["tokyo", "heic"]) {
    const r = await call("GET", `/assets/${ids[l]}/thumbnail?size=${size}`, K, { binary: true });
    let dims = "";
    if (r.status === 200) { const m = await sharp(r.body).metadata(); dims = `${m.format} ${m.width}×${m.height}`; }
    note(`thumbnail?size=${size} (${l}) : ${r.status} ${dims} ${JSON.stringify(r.headers)} ${r.ms} ms`);
    if (l === "tokyo") fixture(`thumbnail-${size}-headers`, { method: "GET", path: `/assets/{id}/thumbnail?size=${size}` }, r);
    if (r.headers.etag) {
      const c = await call("GET", `/assets/${ids[l]}/thumbnail?size=${size}`, K, { binary: true, headers: { "if-none-match": r.headers.etag } });
      note(`  If-None-Match → ${c.status}`);
    }
    if (r.headers["last-modified"]) {
      const c = await call("GET", `/assets/${ids[l]}/thumbnail?size=${size}`, K, { binary: true, headers: { "if-modified-since": r.headers["last-modified"] } });
      note(`  If-Modified-Since → ${c.status}`);
    }
  }
}
const vthumb = await call("GET", `/assets/${ids.video}/thumbnail?size=preview`, K, { binary: true });
note(`aperçu de la vidéo : ${vthumb.status} ${vthumb.headers["content-type"]}`);
const orig = await call("GET", `/assets/${ids.heic}/original`, K, { binary: true });
note(`original HEIC : ${orig.status} ${JSON.stringify(orig.headers)} sha1 identique ? ${createHash("sha1").update(orig.body).digest("base64") === sha1.heic}`);
fixture("original-headers", { method: "GET", path: "/assets/{id}/original" }, orig);
const origRange = await call("GET", `/assets/${ids.heic}/original`, K, { binary: true, headers: { range: "bytes=0-99" } });
note(`original avec Range : ${origRange.status} ${JSON.stringify(origRange.headers)}`);

// ---------------------------------------------------------------- vidéo
for (let i = 0; i < 2; i++) {
  const full = await call("GET", `/assets/${ids.video}/video/playback`, K, { binary: true });
  const part = await call("GET", `/assets/${ids.video}/video/playback`, K, { binary: true, headers: { range: "bytes=0-1023" } });
  note(`video/playback (passe ${i + 1}) : ${full.status} ${JSON.stringify(full.headers)} ; Range 0-1023 → ${part.status} ${JSON.stringify(part.headers)} (${part.body.length} o)`);
  if (i === 1) fixture("video-playback-range", { method: "GET", path: "/assets/{id}/video/playback", headers: { range: "bytes=0-1023" } }, part);
  if (i === 0) await sleep(15000);
}

// ---------------------------------------------------------------- albums (clé d'écriture)
const albumKey = await makeKey(mToken, "atlas-albums", [...MIN_PERMS, "album.create", "albumAsset.create"]);
const KA: Auth = { key: albumKey.secret! };
const album = await call("POST", "/albums", KA, { json: { albumName: "Road trip Portugal 2026", description: "Créé par Atlas", assetIds: [ids.lisbonne] } });
note(`POST /albums (album.create) : ${album.status} id=${album.body.id} assetCount=${album.body.assetCount} clés=${Object.keys(album.body).join(",")}`);
fixture("album-create", { method: "POST", path: "/albums", body: { albumName: "Road trip Portugal 2026", description: "Créé par Atlas", assetIds: ["{id}"] } }, album);
const add = await call("PUT", `/albums/${album.body.id}/assets`, KA, { json: { ids: [ids.porto, ids.lisbonne, ids["yas-rome"], "00000000-0000-4000-8000-000000000000"] } });
note(`PUT /albums/{id}/assets (porto, lisbonne déjà là, photo de Sam non partagée, id inconnu) : ${add.status} ${JSON.stringify(add.body)}`);
fixture("album-add-assets", { method: "PUT", path: "/albums/{id}/assets", body: { ids: ["porto", "lisbonne (déjà présent)", "photo de Sam (non partagée)", "id inconnu"] } }, add);
const shareTry = await call("PUT", `/albums/${album.body.id}/users`, KA, { json: { albumUsers: [{ userId: sam.id, role: "editor" }] } });
note(`PUT /albums/{id}/users avec la clé album : ${shareTry.status} ${JSON.stringify(shareTry.body?.message ?? shareTry.body).slice(0, 200)}`);
const albumGet = await call("GET", `/albums/${album.body.id}`, KA);
note(`GET /albums/{id} avec la clé album (sans album.read) : ${albumGet.status} ${albumGet.body?.message ?? ""}`);

// ---------------------------------------------------------------- partenaires
const beforePartner = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1000 } });
const yasAssetVisibleBefore = beforePartner.body.items.some((a: any) => a.ownerId === sam.id);
// Sam archive une de ses photos avant de partager
must(await call("PUT", "/assets", { token: yToken }, { json: { ids: [ids["yas-archive"]], visibility: "archive" } }), "archive y");
const p = await call("POST", "/partners", { token: yToken }, { json: { sharedWithId: alex.id } });
note(`Sam partage avec Alex (POST /partners) : ${p.status}`);
const sharedWith = await call("GET", "/partners?direction=shared-with", K);
note(`GET /partners?direction=shared-with (clé Alex) : ${sharedWith.status} ${JSON.stringify(sharedWith.body).slice(0, 300)}`);
fixture("partners-shared-with", { method: "GET", path: "/partners?direction=shared-with" }, sharedWith);
const afterShare = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1000 } });
const partnerOnlyShare = afterShare.body.items.filter((a: any) => a.ownerId === sam.id).length;
must(await call("PUT", `/partners/${sam.id}`, { token: mToken }, { json: { inTimeline: true } }), "inTimeline");
const afterTimeline = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1000, withExif: true } });
const partnerItems = afterTimeline.body.items.filter((a: any) => a.ownerId === sam.id);
note(`Photos de Sam dans la recherche de Alex : avant partage=${yasAssetVisibleBefore}, partage sans timeline=${partnerOnlyShare}, partage + inTimeline=${partnerItems.length} (${partnerItems.map((a: any) => a.originalFileName + "/" + a.visibility).join(",")}) — l'archivée est ${partnerItems.some((a: any) => a.id === ids["yas-archive"]) ? "VISIBLE" : "exclue"}`);
const pThumb = await call("GET", `/assets/${ids["yas-rome"]}/thumbnail?size=preview`, K, { binary: true });
const pOrig = await call("GET", `/assets/${ids["yas-rome"]}/original`, K, { binary: true });
const pArch = await call("GET", `/assets/${ids["yas-archive"]}`, K);
note(`Asset partenaire via la clé de Alex : aperçu ${pThumb.status}, original ${pOrig.status}, GET de l'archivée ${pArch.status}`);
const partnerFilter = await call("POST", "/search/metadata", K, { json: { size: 1000, filter: { or: [{ id: { eq: ids["yas-rome"] } }] } } });
note(`filtre id du partenaire : ${partnerFilter.status} count=${partnerFilter.body.count}`);
const markers = await call("GET", "/map/markers?withPartners=true", { token: mToken });
note(`map/markers withPartners (session) : ${markers.status} ${markers.body.length} marqueurs ; exemple ${JSON.stringify(markers.body[0])}`);

// ---------------------------------------------------------------- archive, corbeille, suppression
const tDel = new Date().toISOString();
await sleep(1100);
must(await call("PUT", "/assets", { token: mToken }, { json: { ids: [ids.reykjavik], visibility: "archive" } }), "archive");
must(await call("DELETE", "/assets", { token: mToken }, { json: { ids: [ids["new-york"]] } }), "trash");
must(await call("DELETE", "/assets", { token: mToken }, { json: { ids: [ids["sans-gps"]], force: true } }), "force delete");
await sleep(5000);
const def = await call("POST", "/search/metadata", K, { json: { filter: {}, size: 1000 } });
const has = (l: string, r: Res) => r.body.items?.some((a: any) => a.id === ids[l]);
note(`Recherche par défaut après : archivée ${has("reykjavik", def)}, corbeille ${has("new-york", def)}, supprimée ${has("sans-gps", def)}`);
const upd = await call("POST", "/search/metadata", K, { json: { size: 1000, filter: { updatedAt: { gt: tDel } } } });
note(`filter.updatedAt.gt après archive/corbeille/suppr. : ${upd.status} → ${upd.body.items?.map((a: any) => `${a.originalFileName}(vis=${a.visibility},trash=${a.isTrashed})`).join(", ")}`);
const trashF = await call("POST", "/search/metadata", K, { json: { size: 1000, filter: { trashedAt: { gt: "2000-01-01T00:00:00.000Z" } } } });
note(`filter.trashedAt.gt : ${trashF.status} → ${trashF.body.items?.map((a: any) => `${a.originalFileName}(trash=${a.isTrashed})`).join(", ") ?? JSON.stringify(trashF.body)}`);
fixture("search-trashed", { method: "POST", path: "/search/metadata", body: { size: 1000, filter: { trashedAt: { gt: "2000-01-01T00:00:00.000Z" } } } }, trashF);
const archF = await call("POST", "/search/metadata", K, { json: { size: 1000, filter: { visibility: { eq: "archive" } } } });
note(`filter.visibility=archive : ${archF.status} → ${archF.body.items?.map((a: any) => a.originalFileName).join(", ")}`);
const allVis = await call("POST", "/search/metadata", K, { json: { size: 1000, filter: { visibility: { in: ["timeline", "archive"] } } } });
note(`filter.visibility in [timeline, archive] : ${allVis.status} count=${allVis.body.count}`);
const gTrash = await getAsset(ids["new-york"], K);
const gGone = await getAsset(ids["sans-gps"], K);
const gArch = await getAsset(ids.reykjavik, K);
note(`GET /assets/{id} : corbeille → ${gTrash.status} isTrashed=${gTrash.body.isTrashed} ; supprimée → ${gGone.status} ${JSON.stringify(gGone.body?.message ?? "")} ; archivée → ${gArch.status} visibility=${gArch.body.visibility} isArchived=${gArch.body.isArchived}`);
fixture("asset-gone", { method: "GET", path: "/assets/{id}" }, gGone);
const thumbGone = await call("GET", `/assets/${ids["sans-gps"]}/thumbnail?size=thumbnail`, K, { binary: true });
note(`miniature d'un asset supprimé : ${thumbGone.status}`);
const idProbe = await call("POST", "/search/metadata", K, { json: { size: 1000, filter: { or: [{ id: { eq: ids["new-york"] } }, { id: { eq: ids["sans-gps"] } }, { id: { eq: ids.lisbonne } }] } } });
note(`filtre or[id…] (corbeille, supprimée, normale) : ${idProbe.status} → ${idProbe.body.items?.map((a: any) => a.originalFileName).join(", ") ?? JSON.stringify(idProbe.body).slice(0, 200)}`);

// ---------------------------------------------------------------- sync/stream
const syncKey = await makeKey(mToken, "atlas-sync", ["sync.stream", "sync.read"]).catch(() => ({ secret: undefined, status: 0, body: null }));
const sync = await call("POST", "/sync/stream", { key: syncKey.secret ?? minKey.secret! }, { json: { types: ["AssetsV1"] } });
note(`POST /sync/stream avec clé sync.stream : ${syncKey.status} ${sync.status} ${JSON.stringify(sync.body).slice(0, 200)}`);

// ---------------------------------------------------------------- workflow → webhook
const hits: any[] = [];
const srv = createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    hits.push({ method: req.method, url: req.url, headers: req.headers, body: b });
    res.end("ok");
  });
}).listen(HOOK_PORT, "0.0.0.0");
const triggers = await call("GET", "/workflows/triggers", { token: mToken });
note(`GET /workflows/triggers : ${triggers.status} ${JSON.stringify(triggers.body).slice(0, 400)}`);
const methods = await call("GET", "/plugins/methods", { token: mToken });
const hookMethod = Array.isArray(methods.body) ? methods.body.find((m: any) => /webhook/i.test(m.name ?? m.method ?? JSON.stringify(m))) : undefined;
note(`GET /plugins/methods : ${methods.status} ${Array.isArray(methods.body) ? methods.body.length : 0} méthodes ; webhook = ${JSON.stringify(hookMethod).slice(0, 800)}`);
if (process.env.NOTES_DIR) writeFileSync(join(process.env.NOTES_DIR, "plugin-methods.raw.json"), JSON.stringify(methods.body, null, 2));
if (hookMethod) {
  const methodName = hookMethod.key ?? hookMethod.name ?? hookMethod.method;
  const pluginName = hookMethod.pluginName;
  const qual = pluginName ? `${pluginName}#${methodName}` : methodName;
  const wf = await call("POST", "/workflows", { token: mToken }, { json: { name: "Atlas", trigger: "AssetMetadataExtraction", enabled: true, logging: true, steps: [{ method: qual, config: { url: `http://host.docker.internal:${HOOK_PORT}/api/immich/hook`, method: "POST" }, enabled: true }] } });
  note(`POST /workflows (${qual}) : ${wf.status} ${JSON.stringify(wf.body).slice(0, 500)}`);
  const extra = await makeJpeg({ takenAt: "2026:09:09 09:09:09", offset: "+02:00", lat: 46.2044, lon: 6.1432, width: 320, height: 240, color: "#123456" });
  const up = await upload({ label: "hook", data: extra, name: "geneve.jpg", created: "2026-09-09T07:09:09.000Z", owner: "m", mime: "image/jpeg" });
  for (let i = 0; i < 30 && hits.length === 0; i++) await sleep(1000);
  note(`Webhook reçu : ${hits.length} appel(s) ; ${JSON.stringify(hits[0] ?? null).slice(0, 1500)} (asset ${up.body.id})`);
  if (hits[0]) writeFileSync(join(OUT, "workflow-webhook.json"), JSON.stringify({ request: { method: hits[0].method, url: hits[0].url, headers: hits[0].headers, body: (() => { try { return JSON.parse(hits[0].body); } catch { return hits[0].body; } })() } }, null, 2) + "\n");
  if (wf.body?.id) {
    const logs = await call("GET", `/workflows/${wf.body.id}/logs`, { token: mToken });
    note(`Logs du workflow : ${logs.status} ${JSON.stringify(logs.body).slice(0, 600)}`);
  }
}
srv.close();

writeFileSync(join(process.env.NOTES_DIR ?? OUT, "spike-notes.md"), notes.map((n) => `- ${n}`).join("\n") + "\n");
console.log("\nFIN —", notes.length, "notes");
