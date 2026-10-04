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

export { normalizeServer } from "./storage-url";
