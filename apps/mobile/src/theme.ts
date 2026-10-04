import { useColorScheme, type TextStyle } from "react-native";

/**
 * Jetons de Waysake, direction Horizon, marque Encre : mêmes valeurs que web/styles/tokens.css (voir
 * docs/design/README.md §2). L'interface est en noir et blanc (Encre = quasi-noir en clair, blanc cassé en
 * sombre), sur des gris neutres ; aucune couleur en dur dans un écran, seulement ces jetons.
 */
export const ink = "#1B1B1E";
/** Fond de l'écran de démarrage et de l'icône (aussi dans app.json). */
export const splash = "#1B1B1E";

const light = {
  dark: false,
  bg: "#F6F6F4",
  surface: "#FFFFFF",
  sunken: "#EFEFEC",
  text: "#141416",
  muted: "#606369",
  faint: "#8B8E93",
  line: "rgba(20,20,22,0.09)",
  lineStrong: "rgba(20,20,22,0.15)",
  /** Encre : bouton principal, sélection, focus. */
  accent: ink,
  onAccent: "#FFFFFF",
  /** L'épingle du logo, rien d'autre. */
  pin: "#E87162",
  danger: "#B4321F",
  success: "#1F7A4A",
  warning: "#9A6400",
};
const dark: typeof light = {
  dark: true,
  bg: "#0C0C0E",
  surface: "#17171A",
  sunken: "#111113",
  text: "#EDEDEB",
  muted: "#9C9EA3",
  faint: "#6E7075",
  line: "rgba(237,237,235,0.09)",
  lineStrong: "rgba(237,237,235,0.16)",
  accent: "#EDEDEA",
  onAccent: "#141416",
  pin: "#E87162",
  danger: "#FF8A78",
  success: "#6FD39B",
  warning: "#F2B85B",
};

export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}
export type Theme = typeof light;

/** Geist, embarquée dans l'APK par le greffon expo-font (app.json) : famille « Geist », graisses 400 à 700. */
export const font = "Geist";

/** Tailles (--fs-*), rayons (--r-*) et espacements (base 4) de tokens.css. */
export const fs = { xs: 12, sm: 13.5, md: 15, base: 16, lg: 19, xl: 24, xxl: 30, xxxl: 40, display: 56 };
export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 22, full: 999 };
export const gutter = 16;

/**
 * Style de texte Geist : taille, graisse et approche (-0,02 em courant, -0,045 em pour les grands titres).
 * Toujours passer par ici : sur Android, `fontWeight` sans `fontFamily` retomberait sur Roboto.
 */
export function type(size: number, weight: 400 | 500 | 600 | 700 = 400, tracking: "normal" | "tight" | "tighter" = "normal"): TextStyle {
  const em = tracking === "tighter" ? -0.045 : tracking === "tight" ? -0.02 : 0;
  return {
    fontFamily: font,
    fontSize: size,
    fontWeight: String(weight) as TextStyle["fontWeight"],
    letterSpacing: em * size,
    // Titres serrés (--lh-tight ≈ 1,05 pour qu'aucun jambage ne soit coupé), corps à 1,45.
    lineHeight: Math.round(size * (tracking === "normal" ? 1.45 : 1.12)),
  };
}
/** Chiffres tabulaires (comptes, tailles, pourcentages). */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };
