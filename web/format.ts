const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...opts });

const month = fmt({ month: "long", year: "numeric" });
const full = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayMonth = fmt({ day: "numeric", month: "long" });
const dayMonthYear = fmt({ day: "numeric", month: "long", year: "numeric" });
const monthOnly = fmt({ month: "long" });
const yearOnly = fmt({ year: "numeric" });

/** "2026-09-03T10:00:00" → "Septembre 2026". L'heure locale de prise de vue est lue telle quelle. */
export const monthLabel = (local: string) => capitalize(month.format(new Date(`${local.slice(0, 7)}-01T00:00:00Z`)));
export const fullDate = (local: string) => capitalize(full.format(new Date(`${local}Z`)));
/** « 72 photos » avec une espace insécable : le nombre ne se sépare jamais de son mot. */
export const count = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")}\u00a0${n > 1 ? many : one}`;
export const monthYear = (ts: number) => capitalize(month.format(ts));
export const year = (ts: number) => yearOnly.format(ts);
export const wishMonth = (m: string) => capitalize(month.format(new Date(`${m}-01T00:00:00Z`)));

/** « 25 août – 15 septembre 2026 », « 12 – 15 avril 2024 », « 3 mai 2025 ». */
export function dateRange(start: number, end: number) {
  const a = new Date(start);
  const b = new Date(end);
  if (a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) return dayMonthYear.format(a);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dayMonthYear.format(a)} – ${dayMonthYear.format(b)}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${b.getUTCDate()} ${monthOnly.format(b)} ${b.getUTCFullYear()}`;
  return `${dayMonth.format(a)} – ${dayMonthYear.format(b)}`;
}

export const days = (start: number, end: number) =>
  Math.round((Date.parse(new Date(end).toISOString().slice(0, 10)) - Date.parse(new Date(start).toISOString().slice(0, 10))) / 86_400_000) + 1;

export const flags = (codes: string[]) =>
  codes.map((c) => String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))).join(" ");
