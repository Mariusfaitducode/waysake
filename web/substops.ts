import type { Media } from "./api.js";

/** Une ville d'une étape : les photos prises d'affilée dans cette ville (une « sous-étape »). */
export type SubStop = {
  key: string;
  /** Nom de la ville donné par la tour (géocodeur hors ligne) ; null si aucune photo n'est localisée. */
  place: string | null;
  startLocal: string | null;
  endLocal: string | null;
  media: Media[];
  /** Au moins une photo peut changer de lieu (pas de GPS d'origine). */
  editable: boolean;
};

/** Même règle que POST /api/media/locate : un GPS d'origine (fichier ou téléphone) n'est jamais remplacé. */
export const canRelocate = (m: Media) => m.lat === null || m.locationSource === "manual" || m.locationSource === "game";

/**
 * Les villes d'une étape, dans l'ordre du récit. Les photos (déjà triées par date) sont regroupées par passages
 * successifs dans une même ville : revenir plus tard dans une ville en fait une nouvelle sous-étape. Une photo
 * sans lieu rejoint le passage précédent (le suivant si elle ouvre l'étape). Contre le scintillement, une photo
 * seule prise entre deux passages dans une même autre ville, et à moins de NOISE_KM d'eux, y est rattachée
 * (A, A, B, A → un seul passage à A ; une vraie visite plus loin reste visible), sauf si son lieu a été choisi à la main (lieu posé ou partie de jeu) : on doit voir la photo qu'on vient de déplacer.
 */
/** Au-delà, une photo seule n'est plus un GPS qui hésite à la limite de deux communes : c'est une vraie visite. */
export const NOISE_KM = 3;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
};
const located = (m: Media | undefined): m is Media & { lat: number; lon: number } => !!m && m.lat !== null && m.lon !== null;
/** La photo est à moins de NOISE_KM de la dernière photo d'avant ou de la première d'après (ou sans position). */
function closeToNeighbours(m: Media, before: Media | undefined, after: Media | undefined) {
  if (!located(m)) return true;
  const near = [before, after].filter(located);
  return near.length === 0 || near.some((n) => km(m, n) < NOISE_KM);
}

export function subStops(media: Media[]): SubStop[] {
  const runs: { place: string | null; media: Media[] }[] = [];
  let waiting: Media[] = []; // photos sans lieu en tête d'étape, en attente de la première ville
  for (const m of media) {
    const place = m.place || null;
    const last = runs.at(-1);
    if (!place) {
      if (last) last.media.push(m);
      else waiting.push(m);
    } else if (last?.place === place) last.media.push(m);
    else {
      runs.push({ place, media: [...waiting, m] });
      waiting = [];
    }
  }
  if (waiting.length) runs.push({ place: null, media: waiting });

  const merged: typeof runs = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const before = merged.at(-1);
    const after = runs[i + 1];
    const chosen = run.media[0].locationSource === "manual" || run.media[0].locationSource === "game";
    const noise = before && after && closeToNeighbours(run.media[0], before.media.at(-1), after.media[0]);
    if (run.media.length === 1 && !chosen && before && after && before.place === after.place && noise) {
      before.media.push(...run.media, ...after.media);
      i++;
    } else merged.push({ place: run.place, media: [...run.media] });
  }

  return merged.map((r) => ({
    key: `${r.media[0].id}-${r.place ?? ""}`,
    place: r.place,
    startLocal: r.media[0].takenAtLocal,
    endLocal: r.media.at(-1)!.takenAtLocal,
    media: r.media,
    editable: r.media.some(canRelocate),
  }));
}
