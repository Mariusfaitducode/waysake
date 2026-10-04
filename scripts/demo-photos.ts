/**
 * Photos libres du jeu de démo (Wikimedia Commons, Flickr) : manifeste versionné (scripts/demo-photos.json),
 * fichiers téléchargés à la demande et gardés en cache hors du dépôt.
 *
 * Cache : $WAYSAKE_DEMO_CACHE, sinon $XDG_CACHE_HOME/waysake-demo, sinon ~/.cache/waysake-demo.
 * WAYSAKE_DEMO_PHOTOS=off : aucun téléchargement, images unies à la place.
 * Crédits publics : docs/demo-photos.md (régénéré par `pnpm tsx scripts/demo-photos.ts --docs`).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export type DemoPhoto = {
  /** Nom du fichier en cache (sans extension), unique dans son lieu. */
  file: string;
  title: string;
  author: string;
  license: string;
  /** Absent pour le domaine public. */
  licenseUrl?: string;
  /** Page de la photo (Commons ou Flickr). */
  source: string;
  /** Téléchargement direct (miniature Commons ≤ 1920 px, ou fichier Flickr). */
  url: string;
  /** Présent quand la photo n'a pas été prise au lieu exact. */
  note?: string;
};
export type DemoPhotoManifest = { places: Record<string, DemoPhoto[]> };

const here = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(here, "demo-photos.json");
export const DOCS_PATH = join(here, "..", "docs", "demo-photos.md");

let manifest: DemoPhotoManifest | undefined;
export function demoPhotoManifest(): DemoPhotoManifest {
  return (manifest ??= JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as DemoPhotoManifest);
}

/** La photo du lieu pour la n-ième prise de vue à cet endroit (on parcourt la liste, puis on reboucle). */
export function demoPhotoFor(place: string, index: number): { place: string; photo: DemoPhoto } {
  const places = demoPhotoManifest().places;
  const key = place in places ? place : "undated";
  const pool = places[key];
  return { place: key, photo: pool[index % pool.length] };
}

export function demoCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WAYSAKE_DEMO_CACHE) return env.WAYSAKE_DEMO_CACHE;
  return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "waysake-demo");
}

// Wikimedia exige un User-Agent qui identifie le projet et un moyen de contact.
const USER_AGENT = "Waysake-demo-seed/1.0 (https://github.com/Mariusfaitducode/waysake) node-fetch";
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Pas plus de 3 téléchargements à la fois, et un seul par fichier.
const MAX_PARALLEL = 3;
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}
const inflight = new Map<string, Promise<Buffer | null>>();

type Fetch = typeof fetch;
export type DemoPhotoOptions = {
  cacheDir?: string;
  fetch?: Fetch;
  /** Ne rien télécharger (par défaut : WAYSAKE_DEMO_PHOTOS=off). */
  offline?: boolean;
  /** Attente avant le 1er nouvel essai, doublée ensuite (1 s par défaut). */
  retryDelayMs?: number;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string, fetchImpl: Fetch, retryDelayMs: number, attempts = 4): Promise<Buffer> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(retryDelayMs * 2 ** (i - 1));
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 1000) return buf;
        last = new Error(`réponse trop courte (${buf.length} o)`);
      } else {
        last = new Error(`HTTP ${res.status}`);
        if (res.status === 429 || res.status === 503) {
          const wait = Number(res.headers.get("retry-after"));
          if (wait > 0) await sleep(Math.min(wait * 1000, 30 * retryDelayMs));
        } else if (res.status >= 400 && res.status < 500) break; // 404, 403 : inutile d'insister
      }
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Le fichier source en cache, téléchargé au besoin ; null si indisponible (hors ligne, lien mort). */
export function cachedSource(
  place: string,
  photo: DemoPhoto,
  opts: DemoPhotoOptions = {},
): Promise<Buffer | null> {
  const file = join(opts.cacheDir ?? demoCacheDir(), slug(place), `${photo.file}.jpg`);
  if (existsSync(file)) return Promise.resolve(readFileSync(file));
  if (opts.offline ?? process.env.WAYSAKE_DEMO_PHOTOS === "off") return Promise.resolve(null);
  let p = inflight.get(file);
  if (!p) {
    p = limited(() => download(photo.url, opts.fetch ?? fetch, opts.retryDelayMs ?? 1000))
      .then((buf) => {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(`${file}.part`, buf);
        renameSync(`${file}.part`, file);
        return buf;
      })
      .catch((e) => {
        console.warn(`photo de démo indisponible (${photo.title}) : ${e instanceof Error ? e.message : e}`);
        return null;
      })
      .finally(() => inflight.delete(file));
    inflight.set(file, p);
  }
  return p;
}

/** Image unie de repli, couleur tirée de la graine (déterministe). */
export function plainImage(seed: string, width: number, height: number): Promise<Buffer> {
  const hue = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return sharp({ create: { width, height, channels: 3, background: `hsl(${hue},45%,55%)` } }).jpeg().toBuffer();
}

/**
 * La photo de démo recadrée en width×height (JPEG sans métadonnées : la date et le GPS sont ajoutés ensuite).
 * Ne lève jamais : sans réseau ou sur fichier illisible, renvoie une image unie.
 */
export async function demoPhotoJpeg(
  place: string,
  index: number,
  width: number,
  height: number,
  opts: DemoPhotoOptions & { seed?: string } = {},
): Promise<{ data: Buffer; photo: DemoPhoto | null }> {
  const { place: key, photo } = demoPhotoFor(place, index);
  const source = await cachedSource(key, photo, opts);
  if (source) {
    try {
      const data = await sharp(source)
        .rotate()
        .resize(width, height, { fit: "cover", position: "attention" })
        .jpeg({ quality: 88 })
        .toBuffer();
      return { data, photo };
    } catch (e) {
      console.warn(`photo de démo illisible (${photo.title}) : ${e instanceof Error ? e.message : e}`);
    }
  }
  return { data: await plainImage(opts.seed ?? `${place}-${index}`, width, height), photo: null };
}

/** docs/demo-photos.md, généré depuis le manifeste. */
export function creditsMarkdown(m: DemoPhotoManifest = demoPhotoManifest()): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  const host = (u: string) => (u.includes("flickr.com") ? "Flickr" : "Wikimedia Commons");
  const count = Object.values(m.places).flat().length;
  const lines = [
    "# Photos de démonstration",
    "",
    `Le jeu de démonstration (\`pnpm seed\`) utilise ${count} photos réelles publiées sous licence libre par leurs auteurs`,
    "sur Wikimedia Commons et Flickr. Elles ne sont pas dans le dépôt : `pnpm seed` les télécharge à la demande",
    "(liste dans `scripts/demo-photos.json`) et les garde en cache dans `~/.cache/waysake-demo/`.",
    "",
    "Modifications : redimensionnées et recadrées ; la date et la position GPS sont celles des voyages fictifs",
    "de la démo, pas celles de la prise de vue. Les licences CC BY et CC BY-SA imposent de citer l'auteur et la",
    "licence ; CC BY-SA impose en plus de partager toute œuvre dérivée sous la même licence.",
    "",
    "Les photos marquées ⚠︎ n'ont pas été prises au lieu indiqué (elles servent d'ambiance).",
  ];
  for (const [place, photos] of Object.entries(m.places)) {
    lines.push("", `## ${place === "undated" ? "Sans date" : place}`, "", "| Titre | Auteur | Licence | Source |", "|---|---|---|---|");
    for (const p of photos) {
      const title = p.note ? `${cell(p.title)} ⚠︎ ${cell(p.note)}` : cell(p.title);
      lines.push(`| ${title} | ${cell(p.author)} | ${p.licenseUrl ? `[${p.license}](${p.licenseUrl})` : p.license} | [${host(p.source)}](${p.source}) |`);
    }
  }
  return lines.join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--docs")) {
  writeFileSync(DOCS_PATH, creditsMarkdown());
  console.log(`écrit ${DOCS_PATH}`);
}
