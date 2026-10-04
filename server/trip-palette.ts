/**
 * Palette fermée des couleurs de voyage (direction Horizon). Définie une seule fois ici :
 * le serveur s'en sert pour l'extraction automatique, le site l'importe tel quel (web/trip-colors.ts)
 * et web/styles/tokens.css en recopie les valeurs (un test vérifie qu'elles concordent).
 *
 * Fichier pur : ni Node ni DOM, il est empaqueté par Vite.
 *
 * - `light` / `dark` : la teinte pleine (pastilles, ligne d'itinéraire, points du globe), au moins 3:1 sur la page.
 * - `textLight` / `textDark` : la même teinte assombrie (clair) ou éclaircie (sombre) pour atteindre 4,5:1
 *   sur la page et sur les cartes : à utiliser quand la couleur sert de texte.
 * - `hue` : teinte OKLCH de la version claire, en degrés ; sert à arrondir une couleur extraite à la palette.
 * Les identifiants sont stables (stockés en base) : ne jamais les renommer.
 */
export const TRIP_COLORS = [
  { id: "coral", hue: 27, light: "#CD443D", dark: "#E87162", textLight: "#C94039", textDark: "#E87162" },
  { id: "amber", hue: 67, light: "#C97B00", dark: "#E49E38", textLight: "#A26202", textDark: "#E49E38" },
  { id: "moss", hue: 128, light: "#4F7205", dark: "#B6E27B", textLight: "#4F7205", textDark: "#B6E27B" },
  { id: "pine", hue: 161, light: "#2D8D64", dark: "#66C58F", textLight: "#1A8058", textDark: "#66C58F" },
  { id: "lagoon", hue: 197, light: "#1E999C", dark: "#68E3DE", textLight: "#067D7F", textDark: "#68E3DE" },
  { id: "azure", hue: 250, light: "#2F8ADC", dark: "#7DCBFE", textLight: "#0D74C4", textDark: "#7DCBFE" },
  { id: "indigo", hue: 281, light: "#3E309F", dark: "#796CD1", textLight: "#3E309F", textDark: "#7F72D8" },
  { id: "lilac", hue: 326, light: "#A04AA3", dark: "#C781CB", textLight: "#A04AA3", textDark: "#C781CB" },
  { id: "raspberry", hue: 359.5, light: "#A11056", dark: "#D85584", textLight: "#A11056", textDark: "#D85584" },
  { id: "slate", hue: 250, light: "#5B646F", dark: "#9BA6B1", textLight: "#5B646F", textDark: "#9BA6B1" },
] as const;

export type TripColor = (typeof TRIP_COLORS)[number];
export type TripColorId = TripColor["id"];

export const TRIP_COLOR_IDS = TRIP_COLORS.map((c) => c.id) as TripColorId[];
/** Couleur neutre : couvertures presque sans couleur, et voyages dont la couleur n'est pas encore calculée. */
export const NEUTRAL_TRIP_COLOR: TripColorId = "slate";

export const isTripColorId = (x: unknown): x is TripColorId => typeof x === "string" && (TRIP_COLOR_IDS as string[]).includes(x);
export const tripColor = (id: TripColorId): TripColor => TRIP_COLORS.find((c) => c.id === id)!;
