import { intlTag, locale, translatorFor, type Locale } from "../i18n";
import { describeRange } from "./periods";

/** L'écran « mois par mois » : les mois proposés, leur état et la sélection. Pur : testé sans téléphone. */
export type Month = { key: string; year: number; month: number; from: number; to: number };
export type MonthStatus = "empty" | "none" | "partial" | "sent";

const pad = (n: number) => String(n).padStart(2, "0");

/** Les `years` dernières années, mois par mois (mois en cours compris), du plus récent au plus ancien. Heure du téléphone. */
export function lastMonths(now: number, years = 4): Month[] {
  const d = new Date(now);
  const out: Month[] = [];
  for (let i = 0; i < years * 12; i++) {
    const start = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    out.push({
      key: `${start.getFullYear()}-${pad(start.getMonth() + 1)}`,
      year: start.getFullYear(),
      month: start.getMonth(),
      from: start.getTime(),
      to: i === 0 ? now : next.getTime() - 1,
    });
  }
  return out;
}

export function byYear(months: Month[]): { year: number; months: Month[] }[] {
  const groups: { year: number; months: Month[] }[] = [];
  for (const m of months) {
    const last = groups[groups.length - 1];
    if (last?.year === m.year) last.months.push(m);
    else groups.push({ year: m.year, months: [m] });
  }
  return groups;
}

export function monthLabel(m: Month, l: Locale = locale()) {
  const s = new Intl.DateTimeFormat(intlTag(l), { month: "long" }).format(new Date(m.year, m.month, 15));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `total` éléments sur le téléphone ce mois-là, dont `done` déjà dans Waysake. */
export function monthStatus(total: number, done: number): MonthStatus {
  if (total === 0) return "empty";
  if (done >= total) return "sent";
  return done > 0 ? "partial" : "none";
}

export function toggleMonth(selected: Set<string>, m: Month, status?: MonthStatus | "unknown") {
  const next = new Set(selected);
  if (next.has(m.key)) next.delete(m.key);
  else if (status !== "empty") next.add(m.key);
  return next;
}

/** Toute l'année : coche les mois qui restent à envoyer (ni vides ni déjà envoyés) ; s'ils le sont tous déjà, les décoche. */
export function toggleYear(selected: Set<string>, months: Month[], status: (key: string) => string) {
  const wanted = months.filter((m) => status(m.key) !== "empty" && status(m.key) !== "sent").map((m) => m.key);
  const next = new Set(selected);
  const all = wanted.length > 0 && wanted.every((k) => next.has(k));
  for (const m of months) next.delete(m.key);
  if (!all) wanted.forEach((k) => next.add(k));
  return next;
}

/** « du 1 août au 30 septembre 2026 » pour des mois qui se suivent, sinon « en juillet 2026, septembre 2026 ». */
export function describeMonths(months: Month[], l: Locale = locale()) {
  const sorted = [...months].sort((a, b) => a.from - b.from);
  const contiguous = sorted.every((m, i) => i === 0 || m.from === sorted[i - 1].to + 1);
  if (contiguous) return describeRange(sorted[0].from, sorted[sorted.length - 1].to, l);
  const fmt = new Intl.DateTimeFormat(intlTag(l), { month: "long", year: "numeric" });
  return translatorFor(l)("period.inMonths", { months: sorted.map((m) => fmt.format(new Date(m.year, m.month, 15))).join(", ") });
}

/** Ce qui reste à envoyer : ni reconnu par la tour (nom + date), ni déjà remis par ce téléphone. */
export function splitKnown<T extends { id: string }>(items: T[], known: boolean[], sent: Set<string>) {
  const toSend = items.filter((it, i) => !known[i] && !sent.has(it.id));
  return { toSend, already: items.length - toSend.length };
}

/** Les mois choisis, dans l'ordre chronologique. */
export function rangesOf(selected: Set<string>, months: Month[]) {
  return months.filter((m) => selected.has(m.key)).sort((a, b) => a.from - b.from);
}
