/** Les périodes proposées à l'import. Pur : testé sans téléphone. */
export type Preset = { key: "since-last" | "last-30" | "this-month" | "custom"; title: string; subtitle: string; from?: number; to?: number };

const DAY = 86_400_000;
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", opts);
const longDate = fmt({ day: "numeric", month: "long", year: "numeric" });
const dayMonth = fmt({ day: "numeric", month: "long" });
const monthName = fmt({ month: "long" });

export function presets(now: number, lastImport: number | null): Preset[] {
  const start = new Date(now);
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1).getTime();
  const list: Preset[] = [];
  if (lastImport !== null)
    list.push({ key: "since-last", title: "Depuis le dernier import", subtitle: `Après le ${longDate.format(lastImport)}`, from: lastImport + 1, to: now });
  list.push({ key: "last-30", title: "Les 30 derniers jours", subtitle: `Depuis le ${dayMonth.format(now - 30 * DAY)}`, from: now - 30 * DAY, to: now });
  list.push({ key: "this-month", title: "Ce mois-ci", subtitle: `Depuis le 1er ${monthName.format(now)}`, from: monthStart, to: now });
  list.push({ key: "custom", title: "Choisir les dates", subtitle: "Un voyage précis, par exemple" });
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

export function describeRange(from: number, to: number) {
  const a = new Date(from);
  const b = new Date(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  return `du ${(sameYear ? dayMonth : longDate).format(a)} au ${longDate.format(b)}`;
}
