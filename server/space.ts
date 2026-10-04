import { readdirSync, statSync, statfsSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db.js";

/**
 * Place sur la tour : disque, ce qu'occupe Waysake, rythme de croissance, débit d'envoi mesuré par le téléphone,
 * et reconnaissance des fichiers déjà envoyés (nom + date) pour l'écran « mois par mois » de l'app.
 */

const DAY = 86_400_000;
const MONTH = 30.44 * DAY;

export function diskSpace(dataDir: string) {
  const s = statfsSync(dataDir);
  return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
}

/** Taille d'un dossier (miniatures) : parcours mis en cache 10 minutes, il peut contenir des dizaines de milliers de fichiers. */
const dirCache = new Map<string, { at: number; bytes: number }>();
function dirSize(path: string, now = Date.now()): number {
  const hit = dirCache.get(path);
  if (hit && now - hit.at < 10 * 60_000) return hit.bytes;
  let bytes = 0;
  const walk = (p: string) => {
    let entries;
    try {
      entries = readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) bytes += statSync(full, { throwIfNoEntry: false })?.size ?? 0;
    }
  };
  walk(path);
  dirCache.set(path, { at: now, bytes });
  return bytes;
}

export function usedSpace(db: Db, dataDir: string) {
  const originals = (db.prepare("SELECT coalesce(sum(bytes), 0) AS b FROM media").get() as { b: number }).b;
  const derived = dirSize(join(dataDir, "derived"));
  const database = ["atlas.sqlite", "atlas.sqlite-wal"].reduce((n, f) => n + (statSync(join(dataDir, f), { throwIfNoEntry: false })?.size ?? 0), 0);
  return { originals, derived, database, total: originals + derived + database };
}

/** Taille moyenne d'une photo et d'une vidéo : sert d'estimation quand le téléphone ne donne pas la taille. */
export function averageSizes(db: Db) {
  const rows = db.prepare("SELECT kind, avg(bytes) AS b FROM media GROUP BY kind").all() as { kind: "photo" | "video"; b: number }[];
  const of = (k: string) => Math.round(rows.find((r) => r.kind === k)?.b ?? 0);
  return { photo: of("photo"), video: of("video") };
}

/**
 * Rythme de croissance : octets des photos et vidéos prises ces 12 derniers mois, divisés par 12 (mois vides compris).
 * On se fie à la date de prise de vue, pas à celle d'envoi : rattraper quatre ans de photos d'un coup n'est pas un
 * rythme. Une bibliothèque plus jeune qu'un an se mesure sur sa propre durée (au moins un mois).
 */
export function monthlyGrowth(db: Db, now = Date.now()) {
  const since = now - 12 * MONTH;
  const r = db
    .prepare("SELECT coalesce(sum(bytes), 0) AS b, count(*) AS n, min(taken_at) AS first FROM media WHERE taken_at >= ? AND taken_at <= ?")
    .get(since, now + DAY) as { b: number; n: number; first: number | null };
  if (!r.n) return { bytes: 0, items: 0 };
  const older = db.prepare("SELECT 1 FROM media WHERE taken_at < ? LIMIT 1").get(since);
  const months = older ? 12 : Math.max(1, (now - r.first!) / MONTH);
  return { bytes: Math.round(r.b / months), items: Math.round((r.n / months) * 10) / 10 };
}

/** « Au rythme actuel » : nombre de mois avant que le disque soit plein, et la date correspondante. */
export function forecast(free: number, monthlyBytes: number, now = Date.now()): { months: number | null; fullAt: number | null } {
  if (!(monthlyBytes > 0)) return { months: null, fullAt: null };
  const months = Math.max(0, Math.floor(free / monthlyBytes));
  return { months, fullAt: now + (free / monthlyBytes) * MONTH };
}

/** Débit d'envoi par défaut, prudent (≈ 8 Mbit/s), tant qu'aucun envoi n'a été mesuré. */
export const DEFAULT_UPLOAD_RATE = 1_000_000;
const RATE_KEY = "upload.rate";
const ALPHA = 0.3;

export function uploadRate(db: Db): { bytesPerSecond: number; measured: boolean } {
  const row = db.prepare("SELECT value FROM setting WHERE key = ?").get(RATE_KEY) as { value: string } | undefined;
  const v = row ? Number(JSON.parse(row.value).bytesPerSecond) : NaN;
  return Number.isFinite(v) && v > 0 ? { bytesPerSecond: Math.round(v), measured: true } : { bytesPerSecond: DEFAULT_UPLOAD_RATE, measured: false };
}

/** Moyenne glissante (exponentielle) : une mesure récente compte pour 30 %. */
export function recordUploadRate(db: Db, bytes: number, ms: number) {
  const sample = (bytes / ms) * 1000;
  const prev = uploadRate(db);
  const next = prev.measured ? prev.bytesPerSecond * (1 - ALPHA) + sample * ALPHA : sample;
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    RATE_KEY,
    JSON.stringify({ bytesPerSecond: Math.round(next), at: Date.now() }),
  );
  return uploadRate(db);
}

/**
 * Le téléphone ne connaît pas l'empreinte de ses fichiers sans les lire en entier : on reconnaît donc un
 * fichier déjà envoyé à son nom (sans tenir compte de la casse) et à sa date de prise de vue, à 15 h près.
 * La marge couvre l'EXIF sans fuseau horaire (heure locale lue comme UTC) ; deux fichiers du même nom pris
 * à moins de 15 h d'écart sont, en pratique, le même (les noms Android contiennent l'heure, ceux d'iPhone
 * ne reviennent qu'après 10 000 photos).
 */
const SLACK = 15 * 3600_000;
export type PhoneItem = { name: string; takenAt: number };

export function knownItems(db: Db, items: PhoneItem[]): boolean[] {
  if (!items.length) return [];
  const times = items.map((i) => i.takenAt);
  const rows = db
    .prepare("SELECT lower(original_name) AS name, taken_at AS t FROM media WHERE taken_at BETWEEN ? AND ?")
    .all(Math.min(...times) - SLACK, Math.max(...times) + SLACK) as { name: string; t: number }[];
  const byName = new Map<string, number[]>();
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r.t]);
  return items.map((i) => (byName.get(i.name.toLowerCase()) ?? []).some((t) => Math.abs(t - i.takenAt) <= SLACK));
}
