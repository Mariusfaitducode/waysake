/**
 * Glyphe de Waysake pour l'app (composant <Logo> de src/components.tsx), tiré de web/brand.ts (source unique) :
 * l'app n'embarque pas de moteur SVG, elle affiche ces deux PNG (trait Encre clair / sombre, épingle corail évidée).
 *
 * Usage, à la racine du dépôt : pnpm tsx apps/mobile/scripts/build-logo.mts   (après toute retouche du logo).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BRAND, GLYPH_CENTER, glyphSvg } from "../../../web/brand.js";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
/** 64 dp au plus à l'écran, densité xxxhdpi (4×) : 256 px. */
const SIZE = 256;

for (const [file, stroke] of [
  ["logo-glyph.png", BRAND.ink],
  ["logo-glyph-dark.png", BRAND.inkDark],
] as const) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100"><g transform="${GLYPH_CENTER}">${glyphSvg(stroke, BRAND.pin)}</g></svg>`;
  writeFileSync(join(ASSETS, file), await sharp(Buffer.from(svg), { density: (72 * SIZE) / 100 }).resize(SIZE, SIZE).png({ compressionLevel: 9 }).toBuffer());
}
console.log("Logo de l'app régénéré.");
