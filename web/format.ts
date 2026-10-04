import { locale, type Locale } from "./i18n/index.js";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tags: Record<Locale, string> = { fr: "fr-FR", en: "en-US" };

// Un formateur par langue et par forme, créé à la première utilisation.
const cache = new Map<string, Intl.DateTimeFormat>();
const fmt = (loc: Locale, name: string, opts: Intl.DateTimeFormatOptions) => {
  const key = `${loc}:${name}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(tags[loc], { timeZone: "UTC", ...opts })));
  return f;
};
const month = (l: Locale) => fmt(l, "month", { month: "long", year: "numeric" });
const full = (l: Locale) => fmt(l, "full", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayMonth = (l: Locale) => fmt(l, "dayMonth", { day: "numeric", month: "long" });
const dayMonthYear = (l: Locale) => fmt(l, "dayMonthYear", { day: "numeric", month: "long", year: "numeric" });
const monthOnly = (l: Locale) => fmt(l, "monthOnly", { month: "long" });
const longDay = (l: Locale) => fmt(l, "longDay", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "2026-09-03T10:00:00" → "Septembre 2026". L'heure locale de prise de vue est lue telle quelle. */
export const monthLabel = (local: string, l = locale()) => capitalize(month(l).format(new Date(`${local.slice(0, 7)}-01T00:00:00Z`)));
export const fullDate = (local: string, l = locale()) => capitalize(full(l).format(new Date(`${local}Z`)));
/** "2026-09-03" → « Jeudi 3 septembre 2026 » / « Thursday, September 3, 2026 ». */
export const dayLabel = (day: string, l = locale()) => capitalize(longDay(l).format(new Date(`${day}T00:00:00Z`)));
/** "2026-09-03T14:30:00" → « 14h30 » / « 2:30 PM ». */
export const timeLabel = (local: string, l = locale()) =>
  l === "fr" ? local.slice(11, 16).replace(":", "h") : fmt(l, "time", { hour: "numeric", minute: "2-digit" }).format(new Date(`${local.slice(0, 16)}:00Z`));
export const monthYear =(ts: number, l = locale()) => capitalize(month(l).format(ts));
export const year = (ts: number) => String(new Date(ts).getUTCFullYear());
export const wishMonth = (m: string, l = locale()) => capitalize(month(l).format(new Date(`${m}-01T00:00:00Z`)));
export const number = (n: number, l = locale()) => n.toLocaleString(tags[l]);

/**
 * « 25 août – 15 septembre 2026 », « 12 – 15 avril 2024 », « 3 mai 2025 ».
 * En anglais, Intl sait déjà regrouper : « August 25 – September 15, 2026 », « April 12 – 15, 2024 ».
 */
export function dateRange(start: number, end: number, l = locale()) {
  const a = new Date(start);
  const b = new Date(end);
  if (l === "en") return dayMonthYear(l).formatRange(a, b);
  if (a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) return dayMonthYear(l).format(a);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dayMonthYear(l).format(a)} – ${dayMonthYear(l).format(b)}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${b.getUTCDate()} ${monthOnly(l).format(b)} ${b.getUTCFullYear()}`;
  return `${dayMonth(l).format(a)} – ${dayMonthYear(l).format(b)}`;
}

export const days = (start: number, end: number) =>
  Math.round((Date.parse(new Date(end).toISOString().slice(0, 10)) - Date.parse(new Date(start).toISOString().slice(0, 10))) / 86_400_000) + 1;

export const flags = (codes: string[]) =>
  codes.map((c) => String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))).join(" ");

/** Résultat de recherche de lieu : un pays est traduit depuis son code, une ville ou une région garde le nom de la tour. */
export const hitName = (h: { kind: string; name: string; countryCode: string }) => (h.kind === "country" ? countryName(h.countryCode, h.name) : h.name);

/** Nom d'un pays dans la langue de l'interface, à partir de son code ISO (le serveur l'écrit en français). */
const regionNames = new Map<Locale, Intl.DisplayNames>();
export function countryName(code: string, fallback = code, l = locale()) {
  let names = regionNames.get(l);
  if (!names) regionNames.set(l, (names = new Intl.DisplayNames([tags[l]], { type: "region" })));
  try {
    return names.of(code.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}
