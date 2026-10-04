/**
 * Logo de Waysake : le « chemin en W » (direction Horizon, version Encre).
 * Un départ (point plein), deux vallées symétriques, une arrivée en épingle corail vue de dessus, évidée.
 * Géométrie dans un carré 100 × 100. Source unique : le composant <Logo> (web/components/Logo.tsx)
 * et le générateur d'icônes (scripts/build-brand-assets.ts) en dérivent.
 */
export const BRAND = {
  /** Trait de l'icône et du logo sur fond sombre. */
  glyphOnDark: "#FFFFFF",
  /** Encre : logo sur fond clair, bouton principal (voir --accent). */
  ink: "#1B1B1E",
  inkDark: "#EDEDEA",
  /** Épingle d'arrivée : le Corail sombre de la palette, seul point chaud de la marque. */
  pin: "#E87162",
  /** Dégradé du fond de l'icône d'app (graphite). */
  tileTop: "#3A3A40",
  tileBottom: "#121214",
  /** Fond d'écran de démarrage et fond plein de l'icône adaptative Android. */
  tileFlat: "#1B1B1E",
} as const;

export const W_PATH = "M22 33 C 26 52, 30 70, 37 70 C 44 70, 45 51, 50 51 C 55 51, 56 70, 63 70 C 70 70, 74 52, 78 33";
export const W_STROKE = 9;
export const START = { cx: 22, cy: 31, r: 7.2 };
export const PIN = { cx: 78, cy: 29, r: 11.6, hole: 4.6 };
/** Le glyphe occupe x 14.8 → 89.6, y 23.8 → 74.5 : ce décalage le centre dans son carré. */
export const GLYPH_CENTER = "translate(0 4)";
/** Placement du glyphe dans la tuile arrondie de l'icône d'app (zone sûre comprise). */
export const ICON_GLYPH = "translate(8.6 13.4) scale(.8)";

/** Le glyphe en SVG (contenu d'un <g>, sans <svg>) : trait `stroke`, épingle `pin`, trou de l'épingle transparent. */
export function glyphSvg(stroke: string, pin: string, maskId = "waysake-pin-hole") {
  return (
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
    `<rect width="100" height="100" fill="#fff"/><circle cx="${PIN.cx}" cy="${PIN.cy}" r="${PIN.hole}" fill="#000"/></mask>` +
    `<g mask="url(#${maskId})">` +
    `<path d="${W_PATH}" fill="none" stroke="${stroke}" stroke-width="${W_STROKE}" stroke-linecap="round"/>` +
    `<circle cx="${START.cx}" cy="${START.cy}" r="${START.r}" fill="${stroke}"/>` +
    `<circle cx="${PIN.cx}" cy="${PIN.cy}" r="${PIN.r}" fill="${pin}"/></g>`
  );
}

/** Icône d'app complète (tuile graphite arrondie + glyphe blanc + épingle corail), `size` px de côté. */
export function appIconSvg(size: number, { rounded = true } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRAND.tileTop}"/>` +
    `<stop offset="1" stop-color="${BRAND.tileBottom}"/></linearGradient></defs>` +
    `<rect width="100" height="100" ${rounded ? 'rx="22.5"' : ""} fill="url(#tile)"/>` +
    `<g transform="${ICON_GLYPH}">${glyphSvg(BRAND.glyphOnDark, BRAND.pin, "hole")}</g></svg>`
  );
}
