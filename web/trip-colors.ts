import type { CSSProperties } from "react";
import { NEUTRAL_TRIP_COLOR, TRIP_COLORS, isTripColorId, tripColor, type TripColorId } from "../server/trip-palette.js";

/**
 * Couleurs de voyage côté site. La palette vient du serveur (server/trip-palette.ts, source unique) ;
 * les jetons CSS correspondants sont dans web/styles/tokens.css (--trip-<id>, --trip-<id>-text).
 */
export { TRIP_COLORS, isTripColorId, type TripColorId };
export const TRIP_COLOR_IDS = TRIP_COLORS.map((c) => c.id) as TripColorId[];

/** Valeur reçue de l'API (ou absente chez un vieux serveur) → identifiant sûr. */
export const safeTripColor = (c: unknown): TripColorId => (isTripColorId(c) ? c : NEUTRAL_TRIP_COLOR);

/**
 * Variables CSS d'un voyage, à poser sur l'élément qui lui appartient (ligne, carte, page) :
 * `<li {...tripColorProps(trip.color)}>` ou `style={tripStyle(trip.color)}` + `data-trip-color`.
 * Les descendants utilisent ensuite --trip, --trip-text, --trip-page, --trip-soft (voir tokens.css).
 */
export function tripStyle(color: unknown): CSSProperties {
  const id = safeTripColor(color);
  return { "--trip": `var(--trip-${id})`, "--trip-text": `var(--trip-${id}-text)` } as CSSProperties;
}
export function tripColorProps(color: unknown, style?: CSSProperties) {
  const id = safeTripColor(color);
  return { "data-trip-color": id, style: { ...tripStyle(id), ...style } };
}

const prefersDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
/** Thème effectif (attribut data-theme d'abord, sinon le système). */
export function isDarkTheme() {
  const forced = typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;
  return forced ? forced === "dark" : prefersDark();
}

/**
 * Hexadécimal d'une couleur de voyage, pour ce qui ne lit pas le CSS (MapLibre, canvas, SVG exporté).
 * `variant: "text"` donne la version lisible comme texte.
 */
export function tripColorHex(color: unknown, dark = isDarkTheme(), variant: "fill" | "text" = "fill"): string {
  const c = tripColor(safeTripColor(color));
  if (variant === "text") return dark ? c.textDark : c.textLight;
  return dark ? c.dark : c.light;
}
