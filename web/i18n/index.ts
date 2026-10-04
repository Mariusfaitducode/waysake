import { useSyncExternalStore } from "react";
import { createTranslator, type Translate } from "./core.js";
import { fr } from "./fr.js";
import { en } from "./en.js";

export type Locale = "fr" | "en";
export type Messages = typeof fr;
export type MessageKey = keyof Messages & string;

const dicts = { fr, en } as const;
const STORAGE_KEY = "atlas.lang";

/** Français pour fr-*, anglais pour tout le reste. */
export const fromTag = (tag: string | null | undefined): Locale => (tag?.toLowerCase().startsWith("fr") ? "fr" : "en");
const isLocale = (v: unknown): v is Locale => v === "fr" || v === "en";

function stored(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Dans l'app Android, la langue vient du téléphone (ou du réglage de l'app).
 * Sinon : le choix mémorisé sur cet appareil, puis la langue du navigateur.
 */
function detect(): Locale {
  if (typeof window === "undefined") return "fr";
  const fromApp = window.__ATLAS_APP__?.lang;
  if (isLocale(fromApp)) return fromApp;
  return stored() ?? fromTag(navigator.languages?.[0] ?? navigator.language);
}

let current: Locale = detect();
let translate = createTranslator(current, dicts[current]);
const listeners = new Set<() => void>();

function apply() {
  translate = createTranslator(current, dicts[current]);
  if (typeof document !== "undefined") document.documentElement.lang = current;
}
apply();

/** Langue courante, pour Intl (dates, nombres, noms de pays). */
export const locale = (): Locale => current;

/** Traduit une clé. Les écrans sont remontés quand la langue change (voir `useLocale`). */
export const t: Translate<Messages> = (key, ...args) => translate(key, ...args);

/** Force une langue (mémorisée sur cet appareil) ; `null` revient à celle du navigateur. */
export function setLocale(next: Locale | null) {
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour cette visite.
  }
  current = next ?? detect();
  apply();
  listeners.forEach((l) => l());
}

/** Choix explicite mémorisé (null = langue du navigateur). */
export const forcedLocale = stored;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useLocale = () => useSyncExternalStore(subscribe, locale, locale);

/** Pour les tests : traduire dans une langue donnée sans toucher à l'état global. */
export const translatorFor = (l: Locale) => createTranslator(l, dicts[l]);
