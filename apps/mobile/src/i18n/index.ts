import { createTranslator, type Translate } from "./core";
import { fr } from "./fr";
import { en } from "./en";

export type Locale = "fr" | "en";
export type Messages = typeof fr;

const dicts = { fr, en } as const;

/** Français pour fr-*, anglais pour tout le reste. */
export const fromTag = (tag: string | null | undefined): Locale => (tag?.toLowerCase().startsWith("fr") ? "fr" : "en");

/** Langue du téléphone : Hermes expose la langue du système via Intl (pas besoin d'expo-localization). */
export function deviceLocale(): Locale {
  try {
    return fromTag(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return "fr";
  }
}

let current: Locale = deviceLocale();
let translate = createTranslator(current, dicts[current]);

/** Langue courante, pour Intl et pour la transmettre à Waysake dans la WebView. */
export const locale = (): Locale => current;

/** `null` : suivre la langue du téléphone. L'app remonte ses écrans après un changement. */
export function setLocale(next: Locale | null) {
  current = next ?? deviceLocale();
  translate = createTranslator(current, dicts[current]);
}

/**
 * Traduit une clé. Nommée `tr` ici : dans l'app, `t` désigne déjà le thème (couleurs).
 */
export const tr: Translate<Messages> = (key, ...args) => translate(key, ...args);

export const intlTag = (l: Locale = current) => (l === "fr" ? "fr-FR" : "en-US");
export const formatNumber = (n: number, l: Locale = current) => n.toLocaleString(intlTag(l));
/** « 42 % » / « 42% ». */
export const formatPercent = (ratio: number, l: Locale = current) => new Intl.NumberFormat(intlTag(l), { style: "percent", maximumFractionDigits: 0 }).format(ratio);

/** Pour les tests : traduire dans une langue donnée sans toucher à l'état global. */
export const translatorFor = (l: Locale) => createTranslator(l, dicts[l]);
