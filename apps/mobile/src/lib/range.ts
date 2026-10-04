import { customRange } from "./periods";

/**
 * « Choisir les dates » : deux champs, Du et Au, chacun ouvrant son propre sélecteur. On n'enchaîne jamais deux
 * sélecteurs natifs : ouvert depuis le rappel du premier, le second était ignoré par Android (voir range.test.ts).
 */
export type Draft = { from: Date; to: Date };

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function initialDraft(now: number): Draft {
  const n = new Date(now);
  return { from: new Date(n.getFullYear(), n.getMonth() - 1, 1), to: day(n) };
}

export const setDraftFrom = (d: Draft, from: Date): Draft => ({ from: day(from), to: from > d.to ? day(from) : d.to });
export const setDraftTo = (d: Draft, to: Date): Draft => ({ from: to < d.from ? day(to) : d.from, to: day(to) });
export const draftRange = (d: Draft) => customRange(d.from, d.to);
