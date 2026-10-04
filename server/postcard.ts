import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { derivedPath } from "./ingest.js";
import { NEUTRAL_TRIP_COLOR, isTripColorId, tripColor, type TripColorId } from "./trip-palette.js";
import { glyphSvg, BRAND } from "../web/brand.js";

/**
 * Carte postale d'un voyage (1080 × 1350, le format portrait des réseaux), dans le style Horizon du site :
 * la couverture plein cadre qui se fond par un flou progressif dans un fond teinté de la couleur du voyage,
 * le titre en Geist, les dates et les pays, les étapes en petite route, les chiffres et le tracé de l'itinéraire.
 *
 * Le texte est converti en tracés (opentype.js + Geist, licence OFL, dans server/assets/fonts) : le rendu ne
 * dépend d'aucune police installée sur la tour. opentype.js lit le WOFF, pas le WOFF2 : d'où les fichiers
 * statiques de @fontsource/geist (500 et 600, latin et latin étendu).
 */

const W = 1080;
const H = 1350;
/** Toujours en thème clair (une image partagée ne suit pas le thème de celui qui la regarde). */
const C = { bg: "#F6F6F4", ink: "#141416", muted: "#606369", blank: "#E3E3E0" };

const fontDir = join(dirname(fileURLToPath(import.meta.url)), "assets", "fonts");
const load = (file: string) => {
  const b = readFileSync(join(fontDir, file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
// Pour chaque graisse : l'alphabet latin, puis les lettres d'Europe centrale (Š, ž, č…) en secours.
const FONTS = {
  600: [load("geist-latin-600-normal.woff"), load("geist-latin-ext-600-normal.woff")],
  500: [load("geist-latin-500-normal.woff"), load("geist-latin-ext-500-normal.woff")],
};
type Weight = keyof typeof FONTS;

const n = (v: number | undefined, fallback: number) => (Number.isFinite(v) ? (v as number) : fallback).toFixed(1);
/**
 * Tracé SVG d'un glyphe. opentype.js 2 laisse parfois un point de contrôle à NaN (vu sur le « e » d'une ancienne police) :
 * on le remplace par le point d'arrivée, sinon le moteur SVG abandonne tout le reste du texte.
 */
function pathData(commands: opentype.PathCommand[]) {
  return commands
    .map((c) => {
      if (c.type === "Z") return "Z";
      if (c.type === "M" || c.type === "L") return `${c.type}${n(c.x, 0)} ${n(c.y, 0)}`;
      if (c.type === "Q") return `Q${n(c.x1, c.x)} ${n(c.y1, c.y)} ${n(c.x, 0)} ${n(c.y, 0)}`;
      return `C${n(c.x1, c.x)} ${n(c.y1, c.y)} ${n(c.x2, c.x)} ${n(c.y2, c.y)} ${n(c.x, 0)} ${n(c.y, 0)}`;
    })
    .join("");
}

/**
 * Un texte en tracé SVG, lettre par lettre, avec la police de secours si besoin.
 * `tracking` : approche en em (-0,045 pour les grands titres, comme --tracking-tighter).
 */
export function textPath(text: string, size: number, { x = 0, y = 0, weight = 600 as Weight, tracking = 0 } = {}) {
  const fonts = FONTS[weight];
  let cursor = x;
  let missing = 0;
  const parts: string[] = [];
  const chars = [...text.replace(/[    ]/g, " ")];
  // Intl sépare milliers et dates par des espaces fines ou insécables, absentes de la police : une espace simple.
  chars.forEach((ch, i) => {
    const font = fonts.find((f) => f.charToGlyph(ch).index !== 0) ?? fonts[0];
    const glyph = font.charToGlyph(ch);
    if (glyph.index === 0) missing++;
    parts.push(pathData(glyph.getPath(cursor, y, size).commands));
    cursor += ((glyph.advanceWidth ?? 0) / font.unitsPerEm) * size + (i < chars.length - 1 ? tracking * size : 0);
  });
  return { d: parts.join(""), width: cursor - x, missing };
}

/** Coupe un titre en deux lignes au plus, chacune moins large que `max` à cette taille. */
export function wrapLines(text: string, size: number, max: number, tracking = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textPath(next, size, { tracking }).width > max) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  return [lines[0], lines.slice(1).join(" ")];
}

/** Le tracé de l'itinéraire ([lon, lat]) ajusté dans un cadre, proportions gardées. */
export function routePath(route: [number, number][], box: { x: number; y: number; width: number; height: number }) {
  if (route.length < 2) return "";
  const meanLat = route.reduce((s, [, lat]) => s + lat, 0) / route.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const pts = route.map(([lon, lat]) => [lon * k, -lat] as const);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(box.width / Math.max(maxX - minX, 1e-6), box.height / Math.max(maxY - minY, 1e-6));
  const ox = box.x + (box.width - (maxX - minX) * scale) / 2;
  const oy = box.y + (box.height - (maxY - minY) * scale) / 2;
  return pts.map(([px, py], i) => `${i ? "L" : "M"}${(ox + (px - minX) * scale).toFixed(1)} ${(oy + (py - minY) * scale).toFixed(1)}`).join(" ");
}

// ---------- couleur de page (même recette que --trip-page : 11 % de la teinte dans --bg, en OKLab) ----------

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklab(hex: string) {
  const [r, g, b] = hexRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]: number[]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, fromLin(c))) * 255).toString(16).padStart(2, "0")).join("")}`;
}
/** `color-mix(in oklab, a p, b)` */
export function mixOklab(a: string, b: string, p: number) {
  const [x, y] = [oklab(a), oklab(b)];
  return fromOklab(x.map((v, i) => v * p + y[i] * (1 - p)));
}

// ---------- mise en page ----------

const WORDS = {
  fr: { km: "km", days: (n: number) => (n > 1 ? "jours" : "jour"), photos: (n: number) => (n > 1 ? "photos" : "photo"), stops: (n: number) => (n > 1 ? "étapes" : "étape") },
  en: { km: "km", days: (n: number) => (n > 1 ? "days" : "day"), photos: (n: number) => (n > 1 ? "photos" : "photo"), stops: (n: number) => (n > 1 ? "stops" : "stop") },
};

export type PostcardTrip = {
  title: string;
  startAt: number;
  endAt: number;
  countryCodes: string[];
  route: [number, number][];
  coverSha256: string | null;
  km: number;
  days: number;
  photos: number;
  /** Couleur du voyage (palette Horizon) ; Ardoise si absente. */
  color?: TripColorId | null;
  /** Noms des étapes, dans l'ordre (la petite route sous le titre). */
  stops?: string[];
};

/** Raccourcit un texte (avec « … ») pour qu'il tienne dans `max` px. */
function fit(text: string, size: number, max: number, opts: { weight?: Weight; tracking?: number } = {}) {
  if (textPath(text, size, opts).width <= max) return text;
  let s = text;
  while (s.length > 1 && textPath(`${s}…`, size, opts).width > max) s = s.slice(0, -1).trimEnd();
  return `${s}…`;
}

/**
 * La petite route des étapes : pastilles évidées reliées par un trait, la dernière pleine ; les noms de toutes
 * les étapes s'ils tiennent, sinon seulement du départ et de l'arrivée (comme sur un écran étroit du site).
 * Rien pour un voyage d'une seule étape.
 */
export function stopsRow(stops: string[], { x, y, width, color, page }: { x: number; y: number; width: number; color: string; page: string }) {
  if (stops.length < 2) return ""; // une seule étape : le titre suffit
  const size = 30;
  const r = 10;
  const gap = 14;
  const minSeg = 36;
  const maxSeg = 150;
  const layout = (named: (i: number) => boolean) => {
    const names = stops.map((s, i) => (named(i) ? fit(s, size, width * 0.42, { weight: 500 }) : ""));
    const widths = names.map((s) => (s ? textPath(s, size, { weight: 500 }).width + gap : 0));
    const fixed = stops.length * 2 * r + widths.reduce((a, b) => a + b, 0) + (stops.length - 1) * gap * 2;
    const seg = stops.length > 1 ? Math.min(maxSeg, (width - fixed) / (stops.length - 1)) : 0;
    return { names, widths, seg };
  };
  let l = layout(() => true);
  if (stops.length > 1 && l.seg < minSeg) l = layout((i) => i === 0 || i === stops.length - 1);
  const seg = Math.max(l.seg, 12);
  const parts: string[] = [];
  let cx = x + r;
  stops.forEach((_, i) => {
    const last = i === stops.length - 1;
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${y}" r="${r}" fill="${last ? color : page}" stroke="${color}" stroke-width="3.5"/>`);
    let next = cx + r + gap;
    if (l.names[i]) {
      parts.push(`<path d="${textPath(l.names[i], size, { x: next, y: y + size * 0.36, weight: 500 }).d}" fill="${C.ink}"/>`);
      next += l.widths[i];
    }
    if (!last) {
      parts.push(`<rect x="${next.toFixed(1)}" y="${y - 1.75}" width="${seg.toFixed(1)}" height="3.5" rx="1.75" fill="${color}"/>`);
      cx = next + seg + gap + r;
    }
  });
  return parts.join("");
}

export async function renderPostcard(dataDir: string, trip: PostcardTrip, lang: "fr" | "en" = "fr"): Promise<Buffer> {
  const tag = lang === "en" ? "en-GB" : "fr-FR";
  const words = WORDS[lang];
  const nf = new Intl.NumberFormat(tag);
  const id: TripColorId = isTripColorId(trip.color) ? trip.color : NEUTRAL_TRIP_COLOR;
  const tint = tripColor(id).light;
  const page = mixOklab(tint, C.bg, 0.11);
  const PHOTO_H = 940;
  const M = 72; // marges
  const inner = W - 2 * M;

  // Titre : Geist SemiBold serré, posé sur la partie floutée de la couverture.
  const TRACK = -0.045;
  let size = 128;
  let lines = wrapLines(trip.title, size, inner, TRACK);
  while (size > 72 && lines.some((l) => textPath(l, size, { tracking: TRACK }).width > inner)) lines = wrapLines(trip.title, (size -= 8), inner, TRACK);
  lines = lines.map((l) => fit(l, size, inner, { tracking: TRACK }));
  const lineH = size * 0.98;
  const lastBase = 880;
  const title = lines.map((l, i) => textPath(l, size, { x: M - size * 0.04, y: lastBase - (lines.length - 1 - i) * lineH, tracking: TRACK }).d).join("");

  // Dates · pays
  const date = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatRange(trip.startAt, trip.endAt);
  const regions = new Intl.DisplayNames([tag], { type: "region" });
  const countries = trip.countryCodes.map((c) => regions.of(c) ?? c).join(", ");
  const metaY = lastBase + 64;
  // Sur une ligne si tout tient (« 3 – 10 mai 2025 · Italie »), sinon les pays passent à la ligne.
  const oneLine = [date, countries].filter(Boolean).join(" · ");
  const metaLines = textPath(oneLine, 38, { weight: 500 }).width <= inner ? [oneLine] : [date, countries].filter(Boolean).map((s) => fit(s, 38, inner, { weight: 500 }));
  const meta = { d: metaLines.map((s, i) => textPath(s, 38, { x: M, y: metaY + i * 48, weight: 500 }).d).join("") };

  // Étapes en petite route
  const stops = (trip.stops ?? []).filter(Boolean);
  const rowY = metaY + (metaLines.length - 1) * 48 + 78;
  const row = stopsRow(stops, { x: M, y: rowY, width: inner, color: tint, page });

  // Chiffres : jours, photos, et les km (ou les étapes à défaut).
  const figures = [
    { value: nf.format(trip.days), label: words.days(trip.days) },
    { value: nf.format(trip.photos), label: words.photos(trip.photos) },
    trip.km > 0 ? { value: nf.format(trip.km), label: words.km } : stops.length > 1 ? { value: nf.format(stops.length), label: words.stops(stops.length) } : null,
  ].filter((f): f is { value: string; label: string } => !!f);
  const figY = H - 170;
  let fx = M;
  const figParts = figures.map((f) => {
    const v = textPath(f.value, 72, { x: fx, y: figY, tracking: -0.03 });
    const lb = textPath(f.label, 30, { x: fx, y: figY + 44, weight: 500 });
    fx += Math.max(v.width, lb.width) + 64;
    return `<path d="${v.d}" fill="${C.ink}"/><path d="${lb.d}" fill="${C.muted}"/>`;
  });

  // Tracé de l'itinéraire, à droite des chiffres, à la couleur du voyage.
  const boxX = Math.max(fx + 24, 640);
  const box = { x: boxX, y: rowY + 58, width: W - M - boxX, height: H - 70 - (rowY + 58) };
  const route = box.width > 120 ? routePath(trip.route, box) : "";
  const ends = route ? route.match(/-?\d+(\.\d+)?/g)!.map(Number) : [];
  const [sx, sy, ex, ey] = ends.length ? [ends[0], ends[1], ends[ends.length - 2], ends[ends.length - 1]] : [0, 0, 0, 0];

  // Marque discrète en bas : le glyphe Encre et « Waysake ».
  const brandY = H - 58;
  const brand = textPath("Waysake", 28, { x: M + 46, y: brandY, tracking: -0.045 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.34" stop-color="${page}" stop-opacity="0"/>
      <stop offset="0.62" stop-color="${page}" stop-opacity="0.55"/>
      <stop offset="0.97" stop-color="${page}" stop-opacity="1"/>
    </linearGradient></defs>
    <rect x="0" y="0" width="${W}" height="${PHOTO_H + 1}" fill="url(#fade)"/>
    <path d="${title}" fill="${C.ink}"/>
    <path d="${meta.d}" fill="${C.muted}"/>
    ${row}
    ${figParts.join("")}
    ${
      route
        ? `<path d="${route}" fill="none" stroke="${C.bg}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${route}" fill="none" stroke="${tint}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${sx}" cy="${sy}" r="10" fill="${page}" stroke="${tint}" stroke-width="4"/>
    <circle cx="${ex}" cy="${ey}" r="13" fill="${tint}" stroke="${C.bg}" stroke-width="4"/>`
        : ""
    }
    <g transform="translate(${M - 4} ${brandY - 30}) scale(0.4)">${glyphSvg(BRAND.ink, BRAND.pin, "postcard-pin")}</g>
    <path d="${brand.d}" fill="${C.ink}"/>
  </svg>`;

  // Couverture plein cadre, puis la même image floutée, masquée de 36 % à 72 % de sa hauteur : le flou progressif.
  const coverFile = trip.coverSha256 ? derivedPath(dataDir, trip.coverSha256, 1600) : null;
  const photo =
    coverFile && existsSync(coverFile)
      ? await sharp(coverFile).resize(W, PHOTO_H, { fit: "cover", position: sharp.strategy.attention }).toBuffer()
      : await sharp({ create: { width: W, height: PHOTO_H, channels: 3, background: mixOklab(tint, C.blank, 0.2) } }).png().toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PHOTO_H}"><defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0.36" stop-color="#fff" stop-opacity="0"/><stop offset="0.72" stop-color="#fff" stop-opacity="1"/></linearGradient></defs><rect width="${W}" height="${PHOTO_H}" fill="url(#m)"/></svg>`,
  );
  const blurred = await sharp(photo)
    .blur(26)
    .modulate({ saturation: 1.15 })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp({ create: { width: W, height: H, channels: 3, background: page } })
    .composite([
      { input: photo, top: 0, left: 0 },
      { input: blurred, top: 0, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
