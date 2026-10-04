export type Point = { id: string; lat: number; lon: number };

function km(a: Point, b: Point) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance au sol couverte par `px` pixels au zoom donné (tuiles de 512 px, à l'équateur). */
export const kmForPixels = (px: number, zoom: number) => (px * 40_075) / (512 * 2 ** zoom);

/**
 * Regroupe les points plus proches que `radiusKm`, dans l'ordre donné (le premier d'un groupe
 * le représente : on passe les voyages du plus récent au plus ancien).
 */
export function cluster<T extends Point>(points: T[], radiusKm: number): T[][] {
  const groups: T[][] = [];
  for (const p of points) {
    const g = groups.find((members) => km(members[0], p) <= radiusKm);
    if (g) g.push(p);
    else groups.push([p]);
  }
  return groups;
}
