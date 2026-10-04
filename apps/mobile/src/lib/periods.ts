import { intlTag, locale, translatorFor, type Locale } from "../i18n";

/** Les périodes proposées à l'import. Pur : testé sans téléphone. */
export type Preset = { key: "since-last" | "last-30" | "this-month" | "custom"; title: string; subtitle: string; from?: number; to?: number };

const DAY = 86_400_000;
const fmt = (l: Locale, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlTag(l), opts);
const longDate = (l: Locale) => fmt(l, { day: "numeric", month: "long", year: "numeric" });
const dayMonth = (l: Locale) => fmt(l, { day: "numeric", month: "long" });
const monthName = (l: Locale) => fmt(l, { month: "long" });

export function presets(now: number, lastImport: number | null, l: Locale = locale()): Preset[] {
  const tr = translatorFor(l);
  const start = new Date(now);
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1).getTime();
  const list: Preset[] = [];
  if (lastImport !== null)
    list.push({ key: "since-last", title: tr("period.sinceLast"), subtitle: tr("period.sinceLast.sub", { date: longDate(l).format(lastImport) }), from: lastImport + 1, to: now });
  list.push({ key: "last-30", title: tr("period.last30"), subtitle: tr("period.last30.sub", { date: dayMonth(l).format(now - 30 * DAY) }), from: now - 30 * DAY, to: now });
  list.push({ key: "this-month", title: tr("period.thisMonth"), subtitle: tr("period.thisMonth.sub", { month: monthName(l).format(now) }), from: monthStart, to: now });
  list.push({ key: "custom", title: tr("period.custom"), subtitle: tr("period.custom.sub") });
  return list;
}

/** Journées entières : du début du premier jour à la fin du dernier, dans l'ordre. */
export function customRange(a: Date, b: Date): { from: number; to: number } {
  const [x, y] = a <= b ? [a, b] : [b, a];
  return {
    from: new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0).getTime(),
    to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999).getTime(),
  };
}

/** « du 25 août au 15 septembre 2026 » / « from August 25 to September 15, 2026 ». */
export function describeRange(from: number, to: number, l: Locale = locale()) {
  const a = new Date(from);
  const b = new Date(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  return translatorFor(l)("period.range", { from: (sameYear ? dayMonth(l) : longDate(l)).format(a), to: longDate(l).format(b) });
}
