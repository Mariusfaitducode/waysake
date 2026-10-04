/** Diaporama d'un voyage : l'enchaînement des panneaux d'étape et des photos, et sa mini-carte. */

export const SHORT_PER_CHAPTER = 8;
export const SIGN_MS = 3000;
export const PHOTO_MS = 5000;

type M = { id: number };
type C<T extends M> = { id: number; title: string; media: T[] };
export type Slide<T extends M> = { kind: "sign"; chapter: number } | { kind: "photo"; chapter: number; media: T };

/** Version courte d'une étape : ses coups de cœur, complétés par des photos prises à intervalles réguliers. */
function pick<T extends M>(media: T[], favorites: Set<number>): T[] {
  if (media.length <= SHORT_PER_CHAPTER) return media;
  const chosen = new Set(media.filter((m) => favorites.has(m.id)).slice(0, SHORT_PER_CHAPTER).map((m) => m.id));
  const step = media.length / SHORT_PER_CHAPTER;
  for (let i = 0; chosen.size < SHORT_PER_CHAPTER && i < media.length * 2; i++) {
    const at = Math.floor((i % SHORT_PER_CHAPTER) * step + Math.floor(i / SHORT_PER_CHAPTER)) % media.length;
    chosen.add(media[at].id);
  }
  return media.filter((m) => chosen.has(m.id)); // ordre du voyage
}

export function slideshowPlan<T extends M>(trip: { chapters: C<T>[]; favorites: number[] }, { short }: { short: boolean }): Slide<T>[] {
  const favorites = new Set(trip.favorites);
  const slides: Slide<T>[] = [];
  trip.chapters.forEach((c, chapter) => {
    const media = short ? pick(c.media, favorites) : c.media;
    if (!media.length) return;
    slides.push({ kind: "sign", chapter });
    for (const m of media) slides.push({ kind: "photo", chapter, media: m });
  });
  return slides;
}

/** Itinéraire ([lon, lat]) et étapes projetés dans un cadre largeur × hauteur (marge comprise), proportions gardées. */
export function routeSvg(route: [number, number][], stops: [number, number][], width: number, height: number, pad = 8) {
  const all = [...route, ...stops];
  if (!all.length) return { path: "", points: [] as [number, number][] };
  const meanLat = all.reduce((s, [, lat]) => s + lat, 0) / all.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xs = all.map(([lon]) => lon * k);
  const ys = all.map(([, lat]) => -lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = width - 2 * pad;
  const h = height - 2 * pad;
  const scale = Math.min(w / Math.max(maxX - minX, 1e-6), h / Math.max(maxY - minY, 1e-6));
  const ox = pad + (w - (maxX - minX) * scale) / 2;
  const oy = pad + (h - (maxY - minY) * scale) / 2;
  const project = ([lon, lat]: [number, number]): [number, number] => [ox + (lon * k - minX) * scale, oy + (-lat - minY) * scale];
  const path = route.map(project).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { path, points: stops.map(project) };
}
