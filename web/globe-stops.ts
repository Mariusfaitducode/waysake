/**
 * Vignettes des étapes sur le globe, vu de près : quelles étapes montrer et où poser leurs photos.
 * Fonctions pures (positions à l'écran en entrée), le dessin est fait par GlobeMap.
 */

/**
 * Zoom à partir duquel chaque étape montre ses photos. En dessous, les étapes d'un même voyage se confondent
 * (à 5, un pixel couvre ~5 km à l'équateur : deux étapes à 300 km sont à ~60 px l'une de l'autre).
 */
export const STOP_PHOTOS_MIN_ZOOM = 5;
/** Plafond de vignettes affichées en même temps (le globe reste léger). */
export const STOP_THUMBS_CAP = 60;
/** Distance du point d'étape au centre de ses vignettes (px). */
export const STOP_ORBIT_RADIUS = 38;

/**
 * Décalages (px, [x, y], y vers le bas) de `n` vignettes en éventail au-dessus du point d'étape :
 * une seule en haut à droite, deux de part et d'autre, trois de gauche à droite en passant par le haut.
 */
export function orbit(n: number, radius = STOP_ORBIT_RADIUS): [number, number][] {
  const angles = n <= 1 ? [-60] : n === 2 ? [-120, -60] : [-150, -90, -30];
  return angles.map((a) => {
    const r = (a * Math.PI) / 180;
    return [radius * Math.cos(r), radius * Math.sin(r)];
  });
}

type Placed<T> = { stop: T; x: number; y: number };

/**
 * Étapes à montrer : à l'écran (marge `margin`), de la plus centrale à la plus excentrée, en écartant celles
 * trop proches d'une étape déjà retenue (`minGap` px) et sans dépasser `cap` vignettes en tout.
 */
export function chooseStops<T extends { thumbs: string[] }>(
  candidates: Placed<T>[],
  view: { width: number; height: number },
  { cap = STOP_THUMBS_CAP, minGap = 88, margin = 40 }: { cap?: number; minGap?: number; margin?: number } = {},
): Placed<T>[] {
  const cx = view.width / 2;
  const cy = view.height / 2;
  const onScreen = candidates
    .filter((c) => c.x >= -margin && c.x <= view.width + margin && c.y >= -margin && c.y <= view.height + margin)
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  const out: Placed<T>[] = [];
  let total = 0;
  for (const c of onScreen) {
    const n = c.stop.thumbs.length;
    if (n === 0 || total + n > cap) continue;
    if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < minGap)) continue;
    out.push(c);
    total += n;
  }
  return out;
}
