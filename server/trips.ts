import type { Db } from "./db.js";
import { clusterTrips, detectHome, type ChapterDraft, type ClusterInput, type LatLon, type TripDraft } from "./clustering.js";
import { reverseGeocode, type GeoPlace } from "./geo.js";

/**
 * Persistance des voyages. Le regroupement est recalculé de zéro, puis chaque nouveau voyage (et chaque
 * étape) reprend l'identité de l'ancien avec lequel il partage le plus de photos : liens NFC, titres
 * personnalisés, couvertures et fusions survivent aux recalculs.
 */

export type MediaRow = { id: number; taken_at: number | null; lat: number | null; lon: number | null; geo: string | null; width: number | null; height: number | null; has_thumbs: number };

const json = (v: unknown) => JSON.stringify(v);
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "voyage";

function homeFor(db: Db, items: ClusterInput[]): LatLon | null {
  const set = db.prepare("SELECT value FROM setting WHERE key = 'home'").get() as { value: string } | undefined;
  if (set) return JSON.parse(set.value);
  return detectHome(items);
}

/** Associe chaque brouillon à l'ancien identifiant qui partage le plus de photos (glouton, plus gros recouvrement d'abord). */
function matchByOverlap<T extends { mediaIds: number[]; identityIds?: number[] }>(drafts: T[], oldOf: Map<number, number>): Map<T, number> {
  const pairs: { d: T; old: number; n: number }[] = [];
  for (const d of drafts) {
    const counts = new Map<number, number>();
    for (const id of d.identityIds ?? d.mediaIds) {
      const old = oldOf.get(id);
      if (old !== undefined) counts.set(old, (counts.get(old) ?? 0) + 1);
    }
    for (const [old, n] of counts) pairs.push({ d, old, n });
  }
  pairs.sort((a, b) => b.n - a.n);
  const result = new Map<T, number>();
  const taken = new Set<number>();
  for (const { d, old } of pairs) {
    if (result.has(d) || taken.has(old)) continue;
    result.set(d, old);
    taken.add(old);
  }
  return result;
}

/** Une étape fusionnée garde l'identité (et donc le titre personnalisé) de l'étape qui absorbe l'autre. */
function applyMerges(chapters: ChapterDraft[], anchors: Set<number>): (ChapterDraft & { identityIds?: number[] })[] {
  const out: (ChapterDraft & { identityIds?: number[] })[] = [];
  for (const c of chapters) {
    const prev = out.at(-1);
    if (prev && c.mediaIds.some((id) => anchors.has(id))) {
      prev.identityIds ??= [...prev.mediaIds];
      prev.mediaIds.push(...c.mediaIds);
      prev.places = [...new Set([...prev.places, ...c.places])];
      prev.countryCodes = [...new Set([...prev.countryCodes, ...c.countryCodes])];
      prev.endAt = c.endAt;
    } else out.push({ ...c, mediaIds: [...c.mediaIds] });
  }
  return out;
}

export function autoCover(trip: TripDraft, media: Map<number, MediaRow>): number | null {
  // Une photo en paysage proche du milieu du voyage : le cœur du voyage, pas le trajet aller.
  const mid = (trip.startAt + trip.endAt) / 2;
  const candidates = trip.mediaIds
    .map((id) => media.get(id)!)
    .filter((m) => m.has_thumbs && m.width && m.height && m.width > m.height);
  const pool = candidates.length ? candidates : trip.mediaIds.map((id) => media.get(id)!).filter((m) => m.has_thumbs);
  pool.sort((a, b) => Math.abs((a.taken_at ?? 0) - mid) - Math.abs((b.taken_at ?? 0) - mid));
  return pool[0]?.id ?? null;
}

/** Médias prêts pour le regroupement ; le lieu de chaque photo est calculé une fois puis conservé. */
export function clusterInputs(db: Db, where: string, ...params: unknown[]): { rows: MediaRow[]; items: ClusterInput[] } {
  const rows = db.prepare(`SELECT id, taken_at, lat, lon, geo, width, height, has_thumbs FROM media WHERE ${where}`).all(...params) as MediaRow[];
  const saveGeo = db.prepare("UPDATE media SET geo = ? WHERE id = ?");
  const items: ClusterInput[] = rows.map((r) => {
    let geo: GeoPlace | null = r.geo ? JSON.parse(r.geo) : null;
    if (!geo && r.lat !== null && r.lon !== null) {
      geo = reverseGeocode(r.lat, r.lon);
      if (geo) saveGeo.run(json(geo), r.id);
    }
    return { id: r.id, takenAt: r.taken_at, lat: r.lat, lon: r.lon, geo };
  });
  return { rows, items };
}

export function homeOf(db: Db, items: ClusterInput[]) {
  return homeFor(db, items);
}

export function rebuildTrips(db: Db): { trips: number; home: LatLon | null } {
  const { rows, items } = clusterInputs(db, "status = 'ready'");
  const media = new Map(rows.map((r) => [r.id, r]));

  const home = homeFor(db, items);
  const { trips } = clusterTrips(items, { home });

  return db.transaction(() => {
    db.prepare("INSERT INTO setting (key, value) VALUES ('home.detected', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(json(home));

    const oldTripOf = new Map<number, number>();
    const oldChapterOf = new Map<number, number>();
    for (const r of db.prepare("SELECT mc.media_id, c.id AS chapter_id, c.trip_id FROM media_chapter mc JOIN chapter c ON c.id = mc.chapter_id").all() as { media_id: number; chapter_id: number; trip_id: number }[]) {
      oldTripOf.set(r.media_id, r.trip_id);
      oldChapterOf.set(r.media_id, r.chapter_id);
    }
    const tripMatch = matchByOverlap(trips, oldTripOf);
    const keptTrips = new Set(tripMatch.values());
    const keptChapters = new Set<number>();

    db.prepare("DELETE FROM media_chapter").run();
    const usedSlugs = new Set((db.prepare("SELECT slug FROM trip").all() as { slug: string }[]).map((r) => r.slug));
    const insertTrip = db.prepare(
      `INSERT INTO trip (slug, title, auto_cover_media_id, start_at, end_at, center_lat, center_lon, country_codes, route, media_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    const updateTrip = db.prepare(
      `UPDATE trip SET title = ?, auto_cover_media_id = ?, start_at = ?, end_at = ?, center_lat = ?, center_lon = ?,
         country_codes = ?, route = ?, media_count = ?,
         cover_media_id = CASE WHEN cover_media_id IN (SELECT value FROM json_each(?)) THEN cover_media_id END
       WHERE id = ?`,
    );
    const insertChapter = db.prepare(
      `INSERT INTO chapter (trip_id, sort, key, title, places, country_codes, start_at, end_at, center_lat, center_lon, media_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    const updateChapter = db.prepare(
      `UPDATE chapter SET trip_id = ?, sort = ?, key = ?, title = ?, places = ?, country_codes = ?, start_at = ?, end_at = ?,
         center_lat = ?, center_lon = ?, media_count = ? WHERE id = ?`,
    );
    const link = db.prepare("INSERT INTO media_chapter (media_id, chapter_id) VALUES (?, ?)");

    for (const t of trips) {
      const cover = autoCover(t, media);
      let tripId = tripMatch.get(t);
      const values = [t.title, cover, t.startAt, t.endAt, t.centerLat, t.centerLon, json(t.countryCodes), json(t.route), t.mediaIds.length] as const;
      if (tripId === undefined) {
        const base = `${slugify(t.title)}-${new Date(t.startAt).getUTCFullYear()}`;
        let slug = base;
        for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
        usedSlugs.add(slug);
        tripId = (insertTrip.get(slug, ...values) as { id: number }).id;
      } else {
        updateTrip.run(...values, json(t.mediaIds), tripId);
      }

      const merges = new Set((db.prepare("SELECT anchor_media_id FROM chapter_merge WHERE trip_id = ?").all(tripId) as { anchor_media_id: number }[]).map((r) => r.anchor_media_id));
      const chapters = applyMerges(t.chapters, merges);
      const chapterMatch = matchByOverlap(chapters, oldChapterOf);
      chapters.forEach((c, sort) => {
        const cv = [c.key, c.title, json(c.places), json(c.countryCodes), c.startAt, c.endAt, c.centerLat, c.centerLon, c.mediaIds.length] as const;
        let chapterId = chapterMatch.get(c);
        if (chapterId === undefined) chapterId = (insertChapter.get(tripId, sort, ...cv) as { id: number }).id;
        else updateChapter.run(tripId, sort, ...cv, chapterId);
        keptChapters.add(chapterId);
        for (const id of c.mediaIds) link.run(id, chapterId);
      });
      keptTrips.add(tripId);
    }

    const tripIds = json([...keptTrips]);
    const chapterIds = json([...keptChapters]);
    db.prepare("DELETE FROM chapter WHERE id NOT IN (SELECT value FROM json_each(?))").run(chapterIds);
    db.prepare("DELETE FROM trip WHERE id NOT IN (SELECT value FROM json_each(?))").run(tripIds);
    return { trips: trips.length, home };
  })();
}

// ---------- lecture ----------

type TripRow = {
  id: number; slug: string; title: string; custom_title: string | null; cover_media_id: number | null;
  auto_cover_media_id: number | null; start_at: number; end_at: number; center_lat: number; center_lon: number;
  country_codes: string; route: string; media_count: number;
};

function tripSummary(r: TripRow) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.custom_title ?? r.title,
    autoTitle: r.title,
    startAt: r.start_at,
    endAt: r.end_at,
    centerLat: r.center_lat,
    centerLon: r.center_lon,
    countryCodes: JSON.parse(r.country_codes) as string[],
    mediaCount: r.media_count,
    coverMediaId: r.cover_media_id ?? r.auto_cover_media_id,
  };
}
export type TripSummary = ReturnType<typeof tripSummary>;

export function listTrips(db: Db): TripSummary[] {
  return (db.prepare("SELECT * FROM trip ORDER BY start_at DESC").all() as TripRow[]).map(tripSummary);
}

export function getTrip(db: Db, slug: string) {
  const r = db.prepare("SELECT * FROM trip WHERE slug = ?").get(slug) as TripRow | undefined;
  if (!r) return null;
  const chapters = db.prepare("SELECT * FROM chapter WHERE trip_id = ? ORDER BY sort").all(r.id) as any[];
  const mediaStmt = db.prepare(
    `SELECT m.id, m.kind, m.width, m.height, m.taken_at, m.taken_at_local, m.lat, m.lon, m.uploaded_by, m.has_thumbs, m.geo
     FROM media_chapter mc JOIN media m ON m.id = mc.media_id WHERE mc.chapter_id = ? ORDER BY m.taken_at, m.id`,
  );
  return {
    ...tripSummary(r),
    route: JSON.parse(r.route) as [number, number][],
    chapters: chapters.map((c) => ({
      id: c.id as number,
      title: (c.custom_title ?? c.title) as string,
      autoTitle: c.title as string,
      places: JSON.parse(c.places) as string[],
      countryCodes: JSON.parse(c.country_codes) as string[],
      startAt: c.start_at as number,
      endAt: c.end_at as number,
      centerLat: c.center_lat as number,
      centerLon: c.center_lon as number,
      media: (mediaStmt.all(c.id) as any[]).map((m) => ({
        id: m.id as number,
        kind: m.kind as "photo" | "video",
        width: m.width as number | null,
        height: m.height as number | null,
        takenAt: m.taken_at as number | null,
        takenAtLocal: m.taken_at_local as string | null,
        lat: m.lat as number | null,
        lon: m.lon as number | null,
        uploadedBy: m.uploaded_by as string,
        hasThumbs: m.has_thumbs === 1,
        place: m.geo ? ((JSON.parse(m.geo) as GeoPlace).place ?? null) : null,
      })),
    })),
  };
}
export type TripDetail = NonNullable<ReturnType<typeof getTrip>>;

// ---------- modifications manuelles ----------

const clean = (t: string | null) => (t && t.trim() ? t.trim().slice(0, 120) : null);

export function renameTrip(db: Db, slug: string, title: string | null) {
  return db.prepare("UPDATE trip SET custom_title = ? WHERE slug = ?").run(clean(title), slug).changes > 0;
}

export function renameChapter(db: Db, chapterId: number, title: string | null) {
  return db.prepare("UPDATE chapter SET custom_title = ? WHERE id = ?").run(clean(title), chapterId).changes > 0;
}

export function setCover(db: Db, slug: string, mediaId: number | null) {
  return db
    .prepare(
      `UPDATE trip SET cover_media_id = ? WHERE slug = ? AND (? IS NULL OR ? IN (
         SELECT mc.media_id FROM media_chapter mc JOIN chapter c ON c.id = mc.chapter_id WHERE c.trip_id = trip.id))`,
    )
    .run(mediaId, slug, mediaId, mediaId).changes > 0;
}

/** Fusionne l'étape avec la précédente, et s'en souvient pour les recalculs suivants. */
export function mergeChapterWithPrevious(db: Db, chapterId: number) {
  const c = db.prepare("SELECT id, trip_id, sort FROM chapter WHERE id = ?").get(chapterId) as { id: number; trip_id: number; sort: number } | undefined;
  if (!c || c.sort === 0) return false;
  const anchor = db
    .prepare("SELECT m.id FROM media_chapter mc JOIN media m ON m.id = mc.media_id WHERE mc.chapter_id = ? ORDER BY m.taken_at, m.id LIMIT 1")
    .get(chapterId) as { id: number } | undefined;
  if (!anchor) return false;
  db.prepare("INSERT OR IGNORE INTO chapter_merge (trip_id, anchor_media_id) VALUES (?, ?)").run(c.trip_id, anchor.id);
  rebuildTrips(db);
  return true;
}
