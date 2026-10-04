import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db.js";
import { clusterTrips, HOME_RADIUS_KM } from "./clustering.js";
import { distanceKm } from "./geo.js";
import { autoCover, clusterInputs, homeOf, rebuildTrips } from "./trips.js";
import { derivedPath } from "./ingest.js";
import { THUMB_SIZES } from "./thumbs.js";
import { analyzeCover, snapToPalette } from "./trip-colors.js";
import { isTripColorId, NEUTRAL_TRIP_COLOR, type TripColorId } from "./trip-palette.js";

/**
 * Le sas d'import : ce qui arrive du téléphone reste en attente. Waysake propose un tri (nouveaux voyages,
 * voyages complétés, mis de côté), l'humain valide ou annule.
 */

const EXPIRY_MS = 7 * 86_400_000;

type ImportRow = { id: number; user_id: string; created_at: number; keep_home: number; duplicates: number; status: "pending" | "confirmed" | "cancelled" };
type PendingRow = {
  id: number; kind: string; width: number | null; height: number | null; taken_at: number | null; taken_at_local: string | null;
  lat: number | null; lon: number | null; people: number | null; screenshot: number; excluded: number; has_thumbs: number;
};

const thumb = (id: number) => `/api/media/${id}/thumb`;
const card = (m: PendingRow) => ({
  id: m.id,
  kind: m.kind,
  width: m.width,
  height: m.height,
  takenAtLocal: m.taken_at_local,
  people: m.people,
  excluded: m.excluded === 1,
  hasThumbs: m.has_thumbs === 1,
  thumb: thumb(m.id),
  preview: `/api/media/${m.id}/preview`,
});

/** Classe chaque média en attente : dans un voyage (nouveau ou existant), à la maison, capture, ou simple photo. */
function classify(db: Db, importId: number) {
  const imp = db.prepare("SELECT * FROM import WHERE id = ?").get(importId) as ImportRow | undefined;
  if (!imp) return null;
  const pending = db.prepare("SELECT * FROM media WHERE import_id = ? AND status = 'pending' ORDER BY taken_at IS NULL, taken_at, id").all(importId) as PendingRow[];
  const byId = new Map(pending.map((m) => [m.id, m]));

  // Le regroupement voit tout ce qui est déjà dans Waysake, plus ce qui arrive (sauf captures et photos décochées).
  const { rows, items } = clusterInputs(db, "status = 'ready' OR (import_id = ? AND status = 'pending' AND screenshot = 0)", importId);
  const home = homeOf(db, items.filter((i) => !byId.has(i.id) || byId.get(i.id)!.excluded === 0));
  const { trips } = clusterTrips(items, { home });

  const tripOfReady = new Map<number, { slug: string; title: string }>();
  for (const r of db
    .prepare("SELECT mc.media_id, t.slug, coalesce(t.custom_title, t.title) AS title FROM media_chapter mc JOIN chapter c ON c.id = mc.chapter_id JOIN trip t ON t.id = c.trip_id")
    .all() as { media_id: number; slug: string; title: string }[])
    tripOfReady.set(r.media_id, { slug: r.slug, title: r.title });

  const media = new Map(rows.map((r) => [r.id, r]));
  const inTrip = new Set<number>();
  const newTrips = [];
  const extended = new Map<string, { slug: string; title: string; added: number }>();
  for (const t of trips) {
    const arriving = t.mediaIds.filter((id) => byId.has(id));
    if (!arriving.length) continue;
    arriving.forEach((id) => inTrip.add(id));
    const existing = t.mediaIds.map((id) => tripOfReady.get(id)).find(Boolean);
    const kept = arriving.filter((id) => byId.get(id)!.excluded === 0);
    if (existing) {
      const e = extended.get(existing.slug) ?? { ...existing, added: 0 };
      e.added += kept.length;
      extended.set(existing.slug, e);
      continue;
    }
    const cover = autoCover({ ...t, mediaIds: kept.length ? kept : t.mediaIds }, media);
    newTrips.push({
      title: t.title,
      countryCodes: t.countryCodes,
      startAt: t.startAt,
      endAt: t.endAt,
      route: t.route,
      coverMediaId: cover,
      /** Couleur que prendra le voyage une fois importé (voir proposalWithColors) ; Ardoise en attendant. */
      color: NEUTRAL_TRIP_COLOR as TripColorId,
      cover: cover ? thumb(cover) : null,
      coverLarge: cover ? `/api/media/${cover}/preview` : null,
      count: kept.length,
      withPeople: kept.filter((id) => (byId.get(id)!.people ?? 0) > 0).length,
      chapters: t.chapters.map((c) => ({ title: c.title, places: c.places, startAt: c.startAt, endAt: c.endAt, centerLat: c.centerLat, centerLon: c.centerLon, count: c.mediaIds.filter((id) => byId.has(id)).length })),
      media: arriving.map((id) => card(byId.get(id)!)),
    });
  }

  const screenshots: PendingRow[] = [];
  const atHome: PendingRow[] = [];
  const loose: PendingRow[] = [];
  for (const m of pending) {
    if (inTrip.has(m.id)) continue;
    if (m.screenshot) screenshots.push(m);
    else if (home && m.lat !== null && m.lon !== null && distanceKm(home.lat, home.lon, m.lat, m.lon) <= HOME_RADIUS_KM) atHome.push(m);
    else loose.push(m);
  }
  return { imp, pending, newTrips, extended: [...extended.values()], screenshots, atHome, loose };
}

export function proposal(db: Db, importId: number) {
  const c = classify(db, importId);
  if (!c) return null;
  const keepHome = c.imp.keep_home === 1;
  const kept = (m: PendingRow) => m.excluded === 0 && !(c.atHome.includes(m) && !keepHome);
  return {
    id: c.imp.id,
    status: c.imp.status,
    createdAt: c.imp.created_at,
    keepHome,
    counts: {
      received: c.pending.length,
      duplicates: c.imp.duplicates,
      toImport: c.pending.filter(kept).length,
      withPeople: c.pending.filter((m) => kept(m) && (m.people ?? 0) > 0).length,
    },
    newTrips: c.newTrips,
    extendedTrips: c.extended,
    setAside: { screenshots: c.screenshots.map(card), home: c.atHome.map(card) },
    otherPhotos: c.loose.map(card),
  };
}
export type Proposal = NonNullable<ReturnType<typeof proposal>>;

/**
 * La proposition, avec la couleur de chaque nouveau voyage : la même analyse de couverture que pour les voyages
 * importés (server/trip-colors.ts), arrondie à la palette en évitant les teintes déjà prises par les voyages
 * existants puis par les nouveaux voyages plus anciens. Une estimation : l'import peut changer la couverture.
 */
export async function proposalWithColors(db: Db, dataDir: string, importId: number) {
  const p = proposal(db, importId);
  if (!p) return null;
  const used = new Map<string, number>();
  for (const r of db.prepare("SELECT coalesce(color, auto_color) AS c FROM trip").all() as { c: string | null }[])
    if (isTripColorId(r.c)) used.set(r.c, (used.get(r.c) ?? 0) + 1);
  const sha = db.prepare("SELECT sha256 FROM media WHERE id = ? AND has_thumbs = 1");
  for (const trip of [...p.newTrips].sort((a, b) => a.startAt - b.startAt)) {
    const m = trip.coverMediaId === null ? undefined : (sha.get(trip.coverMediaId) as { sha256: string } | undefined);
    const path = m ? derivedPath(dataDir, m.sha256, 400) : null;
    trip.color = snapToPalette(path && existsSync(path) ? await analyzeCover(path) : null, used);
    used.set(trip.color, (used.get(trip.color) ?? 0) + 1);
  }
  return p;
}

export function setExclusions(db: Db, importId: number, change: { exclude?: number[]; include?: number[]; keepHome?: boolean }) {
  const set = db.prepare("UPDATE media SET excluded = ? WHERE id = ? AND import_id = ? AND status = 'pending'");
  db.transaction(() => {
    for (const id of change.exclude ?? []) set.run(1, id, importId);
    for (const id of change.include ?? []) set.run(0, id, importId);
    if (change.keepHome !== undefined) db.prepare("UPDATE import SET keep_home = ? WHERE id = ? AND status = 'pending'").run(change.keepHome ? 1 : 0, importId);
  })();
}

function removeFiles(dataDir: string, rows: { sha256: string; original_path: string }[]) {
  for (const r of rows) {
    rmSync(join(dataDir, r.original_path), { force: true });
    for (const size of THUMB_SIZES) rmSync(derivedPath(dataDir, r.sha256, size), { force: true });
  }
}

/** Valide : supprime ce qui est mis de côté, rend le reste visible, recalcule les voyages. Idempotent. */
export function confirmImport(db: Db, dataDir: string, importId: number): { trips: string[] } {
  const c = classify(db, importId);
  if (!c) return { trips: [] };
  if (c.imp.status === "pending") {
    const keepHome = c.imp.keep_home === 1;
    const drop = c.pending.filter((m) => m.excluded === 1 || (!keepHome && c.atHome.includes(m))).map((m) => m.id);
    const doomed = drop.length
      ? (db.prepare(`SELECT sha256, original_path FROM media WHERE id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(drop)) as { sha256: string; original_path: string }[])
      : [];
    db.transaction(() => {
      db.prepare("DELETE FROM media WHERE id IN (SELECT value FROM json_each(?))").run(JSON.stringify(drop));
      db.prepare("UPDATE media SET status = 'ready', excluded = 0 WHERE import_id = ? AND status = 'pending'").run(importId);
      db.prepare("UPDATE import SET status = 'confirmed' WHERE id = ?").run(importId);
    })();
    removeFiles(dataDir, doomed);
    rebuildTrips(db);
  }
  if (c.imp.status === "cancelled") return { trips: [] };
  const trips = db
    .prepare(
      `SELECT DISTINCT t.slug FROM media m JOIN media_chapter mc ON mc.media_id = m.id JOIN chapter c ON c.id = mc.chapter_id
       JOIN trip t ON t.id = c.trip_id WHERE m.import_id = ? ORDER BY t.start_at DESC`,
    )
    .all(importId) as { slug: string }[];
  return { trips: trips.map((t) => t.slug) };
}

/** Annule : tout ce qui est en attente dans cette session disparaît (fichiers compris). Les photos déjà dans Waysake ne bougent pas. */
export function cancelImport(db: Db, dataDir: string, importId: number) {
  const rows = db.prepare("SELECT sha256, original_path FROM media WHERE import_id = ? AND status = 'pending'").all(importId) as { sha256: string; original_path: string }[];
  db.transaction(() => {
    db.prepare("DELETE FROM media WHERE import_id = ? AND status = 'pending'").run(importId);
    db.prepare("UPDATE import SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(importId);
  })();
  removeFiles(dataDir, rows);
}

export function expireImports(db: Db, dataDir: string): number {
  const stale = db.prepare("SELECT id FROM import WHERE status = 'pending' AND created_at < ?").all(Date.now() - EXPIRY_MS) as { id: number }[];
  for (const s of stale) cancelImport(db, dataDir, s.id);
  return stale.length;
}

/** Pour « Depuis le dernier import » : la photo la plus récente déjà dans Waysake. */
export function lastImportedAt(db: Db): number | null {
  return (db.prepare("SELECT max(taken_at) AS t FROM media WHERE status = 'ready'").get() as { t: number | null }).t;
}
