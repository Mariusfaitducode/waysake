import AsyncStorage from "@react-native-async-storage/async-storage";

/** Réglages du téléphone : l'adresse de la tour, qui l'utilise, et le mot de passe du foyer s'il y en a un. */
export type Settings = { server: string; user: string; password?: string };
const KEY = "atlas.settings.v1";

export async function loadSettings(): Promise<Settings | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Settings) : null;
}
export const saveSettings = (s: Settings) => AsyncStorage.setItem(KEY, JSON.stringify(s));
export const clearSettings = () => AsyncStorage.removeItem(KEY);

/** Langue forcée dans l'app (à part des réglages : changer de tour ne la remet pas à zéro). Absente : celle du téléphone. */
const LANG_KEY = "atlas.lang";
export async function loadLang(): Promise<"fr" | "en" | null> {
  const v = await AsyncStorage.getItem(LANG_KEY);
  return v === "fr" || v === "en" ? v : null;
}
export const saveLang = (l: "fr" | "en") => AsyncStorage.setItem(LANG_KEY, l);

export { normalizeServer } from "./storage-url";
