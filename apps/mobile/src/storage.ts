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

/**
 * Ce que ce téléphone a déjà remis à cette tour (identifiants de la photothèque). La tour reconnaît ses fichiers
 * par nom et date, mais elle ne garde pas ceux écartés à la validation (captures, photos de la maison) : sans ce
 * carnet, ces mois resteraient « partiels » pour toujours et on les renverrait à chaque fois.
 */
const sentKey = (server: string) => `atlas.sent.v1:${server}`;
export async function loadSent(server: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(sentKey(server));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
export async function rememberSent(server: string, ids: string[]) {
  if (!ids.length) return;
  const all = await loadSent(server);
  ids.forEach((id) => all.add(id));
  await AsyncStorage.setItem(sentKey(server), JSON.stringify([...all]));
}

export { normalizeServer } from "./storage-url";
