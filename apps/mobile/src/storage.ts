import AsyncStorage from "@react-native-async-storage/async-storage";

/** Réglages du téléphone : l'adresse de la tour et qui l'utilise. */
export type Settings = { server: string; user: string };
const KEY = "atlas.settings.v1";

export async function loadSettings(): Promise<Settings | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Settings) : null;
}
export const saveSettings = (s: Settings) => AsyncStorage.setItem(KEY, JSON.stringify(s));
export const clearSettings = () => AsyncStorage.removeItem(KEY);

export { normalizeServer } from "./storage-url";
