import type { Db } from "./db.js";

/**
 * Abonnés aux changements qui peuvent modifier la couverture effective d'un voyage (recalcul des voyages,
 * couverture choisie, réactions) ou sa couleur : la couleur automatique est alors recalculée en arrière-plan
 * (server/trip-colors.ts). Une liste par base ; module sans dépendance pour éviter les imports circulaires.
 */
const listeners = new WeakMap<Db, Set<() => void>>();

export function onTripsChanged(db: Db, fn: () => void) {
  const set = listeners.get(db) ?? listeners.set(db, new Set()).get(db)!;
  set.add(fn);
  return () => void set.delete(fn);
}

export function notifyTripsChanged(db: Db) {
  for (const fn of listeners.get(db) ?? []) fn();
}
