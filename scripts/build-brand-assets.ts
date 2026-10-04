/**
 * Génère toutes les images de la marque à partir de la géométrie de web/brand.ts (source unique) :
 *   - site : web/public/favicon.svg, favicon.ico (16/32/48), apple-touch-icon.png (180) ;
 *   - app Android (Expo) : apps/mobile/assets/icon.png, android-icon-foreground/background/monochrome.png,
 *     splash-icon.png, favicon.png ;
 *   - documentation : docs/design/assets/*.svg (glyphe, mot-symbole « Waysake » vectorisé en Geist, icône).
 *
 * Usage : pnpm tsx scripts/build-brand-assets.ts   (à relancer après toute retouche du logo).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { appIconSvg, BRAND, GLYPH_CENTER, glyphSvg } from "../web/brand.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = (...p: string[]) => {
  const file = join(ROOT, ...p);
  mkdirSync(dirname(file), { recursive: true });
  return file;
};
const png = (svg: string, size: number) => sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 100) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** Glyphe seul dans un carré 100 × 100 (centré), trait `stroke`. */
const glyphFile = (stroke: string, size = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><g transform="${GLYPH_CENTER}">${glyphSvg(stroke, BRAND.pin)}</g></svg>`;

/** Glyphe dans un carré `canvas`, mis à l'échelle `scale` (px par unité) et centré : icônes adaptatives, splash. */
function glyphCentered(canvas: number, scale: number, stroke: string, pin: string = BRAND.pin, background = "") {
  // Boîte du glyphe (unités) : x 14.8 → 89.6, y 23.8 → 77.7 (trait compris).
  const [x0, x1, y0, y1] = [14.8, 89.6, 19.8, 77.7];
  const tx = canvas / 2 - ((x0 + x1) / 2) * scale;
  const ty = canvas / 2 - ((y0 + y1) / 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">${background}` +
    `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">${glyphSvg(stroke, pin)}</g></svg>`
  );
}
const tileBackground = (canvas: number) =>
  `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRAND.tileTop}"/><stop offset="1" stop-color="${BRAND.tileBottom}"/></linearGradient></defs><rect width="${canvas}" height="${canvas}" fill="url(#bg)"/>`;

/** ICO contenant des PNG (accepté par tous les navigateurs actuels). */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

/** « Waysake » en Geist SemiBold, vectorisé (approche -0,045 em comme le mot-symbole de l'interface). */
function wordmarkPath(size: number, x: number, baseline: number) {
  const req = createRequire(import.meta.url);
  const b = readFileSync(req.resolve("@fontsource/geist/files/geist-latin-600-normal.woff"));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const glyphs = font.stringToGlyphs("Waysake");
  const k = size / font.unitsPerEm;
  let cursor = x;
  const parts: string[] = [];
  glyphs.forEach((g, i) => {
    parts.push(g.getPath(cursor, baseline, size).toPathData(2));
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    cursor += ((g.advanceWidth ?? 0) + kern) * k - 0.045 * size;
  });
  return { d: parts.join(""), width: cursor - x };
}
function wordmarkFile(ink: string, text: string) {
  const size = 62;
  const { d, width } = wordmarkPath(size, 102, 74);
  const w = Math.ceil(102 + width + 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="100" viewBox="0 0 ${w} 100" role="img" aria-label="Waysake"><g transform="${GLYPH_CENTER}">${glyphSvg(ink, BRAND.pin)}</g><path d="${d}" fill="${text}"/></svg>`;
}

// ---------- site ----------
writeFileSync(out("web/public/favicon.svg"), appIconSvg(32));
writeFileSync(out("web/public/favicon.ico"), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(appIconSvg(size), size) })))));
// iOS arrondit lui-même : carré plein, sans coins.
writeFileSync(out("web/public/apple-touch-icon.png"), await png(appIconSvg(180, { rounded: false }), 180));

// ---------- app Android (Expo) ----------
const A = (f: string) => out("apps/mobile/assets", f);
writeFileSync(A("icon.png"), await sharp(await png(appIconSvg(1024, { rounded: false }), 1024)).flatten({ background: BRAND.tileBottom }).png().toBuffer());
// Icône adaptative : 108 dp, dont un cercle sûr de 66 dp au centre (61 %) : le glyphe y tient entièrement.
writeFileSync(A("android-icon-background.png"), await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${tileBackground(1024)}</svg>`)).png().toBuffer());
writeFileSync(A("android-icon-foreground.png"), await png(glyphCentered(1024, 6.4, BRAND.glyphOnDark), 1024));
writeFileSync(A("android-icon-monochrome.png"), await png(glyphCentered(1024, 6.4, "#FFFFFF", "#FFFFFF"), 1024));
writeFileSync(A("splash-icon.png"), await png(glyphCentered(1024, 9.5, BRAND.glyphOnDark), 1024));
writeFileSync(A("favicon.png"), await png(appIconSvg(48), 48));

// ---------- documentation ----------
const D = (f: string) => out("docs/design/assets", f);
writeFileSync(D("logo-glyph.svg"), glyphFile(BRAND.ink));
writeFileSync(D("logo-glyph-dark.svg"), glyphFile(BRAND.inkDark));
writeFileSync(D("logo-wordmark.svg"), wordmarkFile(BRAND.ink, "#141416"));
writeFileSync(D("logo-wordmark-dark.svg"), wordmarkFile(BRAND.inkDark, "#EDEDEB"));
writeFileSync(D("app-icon.svg"), appIconSvg(512));
writeFileSync(D("app-icon-512.png"), await png(appIconSvg(512), 512));

console.log("Images de la marque régénérées.");
