/**
 * Moments : des photos qui se suivent (moins de 45 min d'écart), dans une même journée. C'est l'unité
 * naturelle pour poser un lieu d'un coup. Pur, testé.
 */
export const MOMENT_GAP = 45 * 60_000;

type Item = { id: number; takenAt: number; takenAtLocal: string };
export type Moment = { start: string; end: string; ids: number[] };
export type Day = { day: string; ids: number[]; moments: Moment[] };

export function groupMoments(items: Item[]): Day[] {
  const sorted = [...items].sort((a, b) => a.takenAt - b.takenAt || a.id - b.id);
  const days = new Map<string, Day>();
  let prev: Item | null = null;
  for (const it of sorted) {
    const dayKey = it.takenAtLocal.slice(0, 10);
    const day = days.get(dayKey) ?? days.set(dayKey, { day: dayKey, ids: [], moments: [] }).get(dayKey)!;
    const last = day.moments.at(-1);
    if (last && prev && prev.takenAtLocal.slice(0, 10) === dayKey && it.takenAt - prev.takenAt <= MOMENT_GAP) {
      last.ids.push(it.id);
      last.end = it.takenAtLocal;
    } else {
      day.moments.push({ start: it.takenAtLocal, end: it.takenAtLocal, ids: [it.id] });
    }
    day.ids.push(it.id);
    prev = it;
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}
