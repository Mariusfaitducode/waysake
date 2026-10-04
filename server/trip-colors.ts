import sharp, { type OutputInfo } from "sharp";
import { existsSync } from "node:fs";
import type { Db } from "./db.js";
import { derivedPath } from "./ingest.js";
import { hueDistance, oklabToOklch, rgbToOklab, type Oklab } from "./color.js";
import { isTripColorId, NEUTRAL_TRIP_COLOR, TRIP_COLORS, type TripColorId } from "./trip-palette.js";
import { effectiveCovers } from "./trips.js";

/**
 * Couleur automatique des voyages (direction Horizon) : la teinte « vibrante » de la couverture,
 * arrondie à la palette fermée de server/trip-palette.ts, en évitant que deux voyages aient la même.
 *
 * 1. analyzeCover : la miniature est réduite à 96 px, chaque pixel passe en OKLCH ; on écarte les pixels
 *    trop sombres, trop clairs ou gris, puis on construit un histogramme de teintes (24 cases de 15°)
 *    pondéré par la vibrance (chroma élevée, luminosité moyenne). Le pic donne la teinte ; la couleur
 *    retenue est la moyenne OKLab des pixels vibrants à ±22° du pic.
 * 2. snapToPalette : la teinte de palette la plus proche ; une photo presque grise donne Ardoise.
 * 3. assignAutoColors : règle anti-doublon, voyages pris du plus ancien au plus récent (ordre stable).
 */

export type CoverAnalysis = { hue: number; chroma: number; lightness: number; chromaticShare: number };

const BINS = 24;
const vibrance = (L: number, C: number) => Math.min(C, 0.25) ** 1.6 * Math.exp(-(((L - 0.62) / 0.24) ** 2));
const isVibrant = (L: number, C: number) => L >= 0.22 && L <= 0.95 && C >= 0.035;

/** Analyse une image (chemin ou contenu). null si elle est illisible. */
export async function analyzeCover(input: string | Buffer): Promise<CoverAnalysis | null> {
  let raw: { data: Buffer; info: OutputInfo };
  try {
    raw = await sharp(input).rotate().resize(96, 96, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }
  const { data, info } = raw;
  const step = info.channels;
  const px: { lab: Oklab; L: number; C: number; h: number }[] = [];
  for (let i = 0; i + 2 < data.length; i += step) {
    const lab = rgbToOklab(data[i], data[i + 1], data[i + 2]);
    const [L, C, h] = oklabToOklch(lab);
    px.push({ lab, L, C, h });
  }
  if (!px.length) return null;

  const bins = new Array<number>(BINS).fill(0);
  let chromatic = 0;
  for (const p of px) {
    if (!isVibrant(p.L, p.C)) continue;
    chromatic++;
    bins[Math.floor(p.h / (360 / BINS)) % BINS] += vibrance(p.L, p.C);
  }
  // Lissage circulaire : une teinte à cheval sur deux cases ne perd pas.
  const smooth = bins.map((v, i) => 0.25 * bins[(i + BINS - 1) % BINS] + 0.5 * v + 0.25 * bins[(i + 1) % BINS]);
  const centre = (smooth.indexOf(Math.max(...smooth)) + 0.5) * (360 / BINS);

  const acc: Oklab = [0, 0, 0];
  let wsum = 0;
  for (const p of px) {
    if (!isVibrant(p.L, p.C) || hueDistance(p.h, centre) > 22) continue;
    const w = vibrance(p.L, p.C);
    for (let k = 0; k < 3; k++) acc[k] += p.lab[k] * w;
    wsum += w;
  }
  const [L, C, h] = wsum ? oklabToOklch(acc.map((a) => a / wsum) as Oklab) : [0.6, 0, 0];
  return { hue: h, chroma: C, lightness: L, chromaticShare: chromatic / px.length };
}

const HUED = TRIP_COLORS.filter((c) => c.id !== NEUTRAL_TRIP_COLOR);
/** Une couverture assez colorée pour imposer sa teinte (sinon : photo presque grise, ou pas de photo). */
const hasPreference = (a: CoverAnalysis | null): a is CoverAnalysis => !!a && a.chromaticShare >= 0.08 && a.chroma >= 0.04;

/**
 * Arrondit une analyse à la palette. `used` compte les voyages qui portent déjà chaque teinte :
 * 1. la plus proche des teintes libres à 45° au plus ; 2. sinon une teinte libre à 80° au plus ;
 * 3. sinon la moins employée à 45° au plus (doublon inévitable), la plus proche en cas d'égalité.
 * Une photo presque grise (ou pas de photo) n'a pas de préférence : Ardoise si elle est libre, sinon la teinte
 * la moins employée (dans l'ordre de la palette).
 */
export function snapToPalette(a: CoverAnalysis | null, used: ReadonlyMap<string, number> = new Map()): TripColorId {
  const n = (id: string) => used.get(id) ?? 0;
  if (!hasPreference(a)) {
    if (!n(NEUTRAL_TRIP_COLOR)) return NEUTRAL_TRIP_COLOR;
    return [...HUED].sort((x, y) => n(x.id) - n(y.id))[0].id; // tri stable : ordre de la palette à égalité
  }
  const ranked = HUED.map((c) => ({ id: c.id, d: hueDistance(a.hue, c.hue) })).sort((x, y) => x.d - y.d);
  const free = (max: number) => ranked.find((r) => r.d <= max && !n(r.id));
  const near = ranked.filter((r) => r.d <= 45);
  return (free(45) ?? free(80) ?? [...(near.length ? near : ranked)].sort((x, y) => n(x.id) - n(y.id) || x.d - y.d)[0]).id;
}

export type ColorCandidate = { id: number; startAt: number; manual: TripColorId | null; analysis: CoverAnalysis | null };

/**
 * Couleur automatique de chaque voyage. Les couleurs choisies à la main sont prises d'office ; les autres
 * voyages, du plus ancien au plus récent, prennent la teinte de leur couverture si elle est libre ; les voyages
 * sans préférence (couverture grise ou absente) passent en dernier, pour ne pas prendre la teinte d'un autre.
 * Un voyage à couleur manuelle reçoit aussi une couleur automatique (proposée par « Automatique »).
 */
export function assignAutoColors(trips: ColorCandidate[]): Map<number, TripColorId> {
  const used = new Map<string, number>();
  const bump = (id: string, by: number) => used.set(id, (used.get(id) ?? 0) + by);
  for (const t of trips) if (t.manual) bump(t.manual, 1);
  const out = new Map<number, TripColorId>();
  const order = (a: ColorCandidate, b: ColorCandidate) =>
    Number(hasPreference(b.analysis)) - Number(hasPreference(a.analysis)) || a.startAt - b.startAt || a.id - b.id;
  for (const t of [...trips].sort(order)) {
    if (t.manual) {
      bump(t.manual, -1);
      out.set(t.id, snapToPalette(t.analysis, used));
      bump(t.manual, 1);
    } else {
      const c = snapToPalette(t.analysis, used);
      out.set(t.id, c);
      bump(c, 1);
    }
  }
  return out;
}

// ---------- service : recalcul en arrière-plan ----------

/**
 * Recalcule `trip.auto_color` pour tous les voyages. Les analyses sont gardées en mémoire par média :
 * seule une nouvelle couverture coûte une lecture d'image.
 */
export function tripColorService(db: Db, dataDir: string, onError: (err: unknown) => void = () => {}) {
  const cache = new Map<number, CoverAnalysis | null>();
  let running: Promise<void> | null = null;
  let again = false;

  async function analysisOf(mediaId: number | null) {
    if (mediaId === null) return null;
    if (cache.has(mediaId)) return cache.get(mediaId)!;
    const m = db.prepare("SELECT sha256, has_thumbs FROM media WHERE id = ?").get(mediaId) as { sha256: string; has_thumbs: number } | undefined;
    const path = m?.has_thumbs ? derivedPath(dataDir, m.sha256, 400) : null;
    // Miniature pas encore écrite : on ne garde rien en mémoire, elle sera lue au prochain recalcul.
    if (!path || !existsSync(path)) return null;
    const a = await analyzeCover(path);
    cache.set(mediaId, a);
    return a;
  }

  async function refresh() {
    const covers = effectiveCovers(db);
    const rows = db.prepare("SELECT id, start_at, color, auto_color FROM trip").all() as { id: number; start_at: number; color: string | null; auto_color: string | null }[];
    const candidates: ColorCandidate[] = [];
    for (const r of rows)
      candidates.push({ id: r.id, startAt: r.start_at, manual: isTripColorId(r.color) ? r.color : null, analysis: await analysisOf(covers.get(r.id) ?? null) });
    const colors = assignAutoColors(candidates);
    const update = db.prepare("UPDATE trip SET auto_color = ? WHERE id = ? AND auto_color IS NOT ?");
    db.transaction(() => {
      for (const [id, c] of colors) update.run(c, id, c);
    })();
  }

  /** Lance un recalcul (ou en programme un autre si un calcul est déjà en cours). Ne bloque jamais. */
  function schedule() {
    if (running) {
      again = true;
      return;
    }
    running = (async () => {
      do {
        again = false;
        try {
          if (db.open) await refresh();
        } catch (err) {
          onError(err);
        }
      } while (again && db.open);
    })().finally(() => {
      running = null;
    });
  }

  /** Attend la fin des recalculs en cours (tests, arrêt propre). */
  async function idle() {
    while (running) await running;
  }

  return { schedule, idle };
}
export type TripColorService = ReturnType<typeof tripColorService>;
