import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { derivedPath } from "./ingest.js";

/**
 * Carte postale d'un voyage (1080 × 1350, le format portrait des réseaux) : la couverture, le titre en panneau
 * d'autoroute, les dates, les pays, les chiffres et le tracé de l'itinéraire.
 *
 * Le texte est converti en tracés (opentype.js + Barlow Condensed, licence OFL, dans server/assets/fonts) :
 * le rendu ne dépend d'aucune police installée sur la tour.
 */

const W = 1080;
const H = 1350;
const C = { paper: "#fafaf8", ink: "#16191b", muted: "#6a7074", green: "#0b7a4b", white: "#ffffff" };

const fontDir = join(dirname(fileURLToPath(import.meta.url)), "assets", "fonts");
const load = (file: string) => {
  const b = readFileSync(join(fontDir, file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
// Pour chaque graisse : l'alphabet latin, puis les lettres d'Europe centrale (Š, ž, č…) en secours.
const FONTS = {
  600: [load("barlow-condensed-latin-600-normal.woff"), load("barlow-condensed-latin-ext-600-normal.woff")],
  500: [load("barlow-condensed-latin-500-normal.woff"), load("barlow-condensed-latin-ext-500-normal.woff")],
};
type Weight = keyof typeof FONTS;

const n = (v: number | undefined, fallback: number) => (Number.isFinite(v) ? (v as number) : fallback).toFixed(1);
/**
 * Tracé SVG d'un glyphe. opentype.js 2 laisse parfois un point de contrôle à NaN (vu sur le « e » de Barlow) :
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

/** Un texte en tracé SVG, lettre par lettre, avec la police de secours si besoin. */
export function textPath(text: string, size: number, { x = 0, y = 0, weight = 600 as Weight } = {}) {
  const fonts = FONTS[weight];
  let cursor = x;
  let missing = 0;
  const parts: string[] = [];
  // Intl sépare milliers et dates par des espaces fines ou insécables, absentes de la police : une espace simple.
  for (const ch of text.replace(/[\u00A0\u2007\u2009\u202F]/g, " ")) {
    const font = fonts.find((f) => f.charToGlyph(ch).index !== 0) ?? fonts[0];
    const glyph = font.charToGlyph(ch);
    if (glyph.index === 0) missing++;
    parts.push(pathData(glyph.getPath(cursor, y, size).commands));
    cursor += ((glyph.advanceWidth ?? 0) / font.unitsPerEm) * size;
  }
  return { d: parts.join(""), width: cursor - x, missing };
}

/** Coupe un titre en deux lignes au plus, chacune moins large que `max` à cette taille. */
export function wrapLines(text: string, size: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textPath(next, size).width > max) {
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

const WORDS = {
  fr: { km: "km", days: (n: number) => (n > 1 ? "jours" : "jour"), photos: (n: number) => (n > 1 ? "photos" : "photo") },
  en: { km: "km", days: (n: number) => (n > 1 ? "days" : "day"), photos: (n: number) => (n > 1 ? "photos" : "photo") },
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
};

export async function renderPostcard(dataDir: string, trip: PostcardTrip, lang: "fr" | "en" = "fr"): Promise<Buffer> {
  const tag = lang === "en" ? "en-GB" : "fr-FR";
  const words = WORDS[lang];
  const nf = new Intl.NumberFormat(tag);
  const PHOTO_H = 820;
  const M = 60; // marges

  // Titre en panneau vert, à cheval sur le bas de la photo.
  let size = 96;
  let lines = wrapLines(trip.title, size, W - 2 * M - 80);
  while (size > 56 && lines.some((l) => textPath(l, size).width > W - 2 * M - 80)) lines = wrapLines(trip.title, (size -= 8), W - 2 * M - 80);
  const lineH = size * 1.02;
  const panelH = 44 + lines.length * lineH + 18;
  const panelW = Math.min(W - 2 * M, Math.max(...lines.map((l) => textPath(l, size).width)) + 80);
  const panelY = PHOTO_H - panelH * 0.55;
  const title = lines.map((l, i) => textPath(l, size, { x: M + 40, y: panelY + 30 + size * 0.78 + i * lineH }).d).join("");

  const date = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatRange(trip.startAt, trip.endAt);
  const regions = new Intl.DisplayNames([tag], { type: "region" });
  const countries = trip.countryCodes.map((c) => regions.of(c) ?? c).join(", ");
  const y1 = panelY + panelH + 82;
  const dateP = textPath(date, 50, { x: M, y: y1, weight: 500 });
  const countryP = textPath(countries, 40, { x: M, y: y1 + 56, weight: 500 });

  const statsY = H - 120;
  const kmP = trip.km > 0 ? textPath(`${nf.format(trip.km)} ${words.km}`, 84, { x: M, y: statsY }) : null;
  const restP = textPath(`${nf.format(trip.days)} ${words.days(trip.days)}, ${nf.format(trip.photos)} ${words.photos(trip.photos)}`, 40, { x: M, y: statsY + 58, weight: 500 });

  const box = { x: 620, y: y1 + 100, width: W - 620 - M, height: H - (y1 + 100) - 70 };
  const route = routePath(trip.route, box);
  const ends = route ? route.match(/-?\d+(\.\d+)?/g)!.map(Number) : [];
  const [sx, sy, ex, ey] = ends.length ? [ends[0], ends[1], ends[ends.length - 2], ends[ends.length - 1]] : [0, 0, 0, 0];

  const brandW = textPath("Waysake", 34).width + 28;
  const brand = textPath("Waysake", 34, { x: W - M - brandW + 14, y: 70 + 34 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs>
    <rect x="0" y="0" width="${W}" height="${PHOTO_H}" fill="url(#shade)"/>
    <rect x="${W - M - brandW}" y="70" width="${brandW}" height="46" rx="10" fill="${C.green}"/>
    <rect x="${W - M - brandW + 4}" y="74" width="${brandW - 8}" height="38" rx="7" fill="none" stroke="${C.white}" stroke-width="2.5"/>
    <path d="${brand.d}" fill="${C.white}"/>
    <rect x="${M}" y="${panelY}" width="${panelW}" height="${panelH}" rx="22" fill="${C.green}"/>
    <rect x="${M + 9}" y="${panelY + 9}" width="${panelW - 18}" height="${panelH - 18}" rx="15" fill="none" stroke="${C.white}" stroke-width="5"/>
    <path d="${title}" fill="${C.white}"/>
    <path d="${dateP.d}" fill="${C.ink}"/>
    <path d="${countryP.d}" fill="${C.muted}"/>
    ${kmP ? `<path d="${kmP.d}" fill="${C.green}"/>` : ""}
    <path d="${restP.d}" fill="${C.muted}"/>
    ${
      route
        ? `<path d="${route}" fill="none" stroke="${C.green}" stroke-opacity="0.18" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${route}" fill="none" stroke="${C.green}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${sx}" cy="${sy}" r="11" fill="${C.green}"/>
    <circle cx="${ex}" cy="${ey}" r="15" fill="${C.white}" stroke="${C.green}" stroke-width="8"/>`
        : ""
    }
  </svg>`;

  const coverFile = trip.coverSha256 ? derivedPath(dataDir, trip.coverSha256, 1600) : null;
  const photo =
    coverFile && existsSync(coverFile)
      ? await sharp(coverFile).resize(W, PHOTO_H, { fit: "cover", position: sharp.strategy.attention }).toBuffer()
      : await sharp({ create: { width: W, height: PHOTO_H, channels: 3, background: "#d9e4dd" } }).png().toBuffer();

  return sharp({ create: { width: W, height: H, channels: 3, background: C.paper } })
    .composite([
      { input: photo, top: 0, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
