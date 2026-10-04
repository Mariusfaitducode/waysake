import { distanceKm } from "./geo.js";

const DAY = 86_400_000;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export type Memory = { year: number; yearsAgo: number; ids: number[] };

/**
 * « Il y a un an… » : les photos prises le même jour (même mois, même jour) les années précédentes,
 * l'année la plus récente d'abord. Un 28 février d'année non bissextile reprend aussi les 29 février.
 */
export function onThisDay(rows: { id: number; takenAtLocal: string | null }[], today: string): Memory[] {
  const year = Number(today.slice(0, 4));
  const md = today.slice(5, 10);
  const days = new Set([md]);
  if (md === "02-28" && !isLeap(year)) days.add("02-29");
  const byYear = new Map<number, { at: string; id: number }[]>();
  for (const r of rows) {
    if (!r.takenAtLocal) continue;
    const y = Number(r.takenAtLocal.slice(0, 4));
    if (y >= year || !days.has(r.takenAtLocal.slice(5, 10))) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push({ at: r.takenAtLocal, id: r.id });
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([y, items]) => ({ year: y, yearsAgo: year - y, ids: items.sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id).map((i) => i.id) }));
}

type StatsInput = {
  startAt: number;
  endAt: number;
  countryCodes: string[];
  route: [number, number][]; // [lon, lat], un point par jour
  chapters: { id: number; title: string; media: { uploadedBy: string; takenAtLocal: string | null }[] }[];
};

/** Le voyage en chiffres, pour le bas de la page voyage. */
export function tripStats(t: StatsInput) {
  let km = 0;
  for (let i = 1; i < t.route.length; i++) km += distanceKm(t.route[i - 1][1], t.route[i - 1][0], t.route[i][1], t.route[i][0]);

  const media = t.chapters.flatMap((c) => c.media);
  const perDay = new Map<string, number>();
  const perUser = new Map<string, number>();
  for (const m of media) {
    if (m.takenAtLocal) perDay.set(m.takenAtLocal.slice(0, 10), (perDay.get(m.takenAtLocal.slice(0, 10)) ?? 0) + 1);
    perUser.set(m.uploadedBy, (perUser.get(m.uploadedBy) ?? 0) + 1);
  }
  const topDay = [...perDay.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0];
  const topChapter = t.chapters.length > 1 ? [...t.chapters].sort((a, b) => b.media.length - a.media.length)[0] : null;

  return {
    km: Math.round(km),
    days: Math.floor(t.endAt / DAY) - Math.floor(t.startAt / DAY) + 1,
    countries: t.countryCodes.length,
    photos: media.length,
    topChapter: topChapter ? { id: topChapter.id, title: topChapter.title, count: topChapter.media.length } : null,
    topDay: topDay ? { day: topDay[0], count: topDay[1] } : null,
    byUser: [...perUser.entries()]
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .map(([userId, count]) => ({ userId, count, share: Math.round((count / media.length) * 100) })),
  };
}
export type TripStats = ReturnType<typeof tripStats>;
