import type { Db } from "./db.js";
import { HOME_RADIUS_KM, type LatLon } from "./clustering.js";
import { distanceKm, type GeoPlace } from "./geo.js";
import { periodsOf, placeName, type LifePlaceDraft } from "./lifeplaces.js";
import { autoCover, rebuildTrips, slugify, type MediaRow } from "./trips.js";
import type { LocationSource } from "./routes/media.js";

/**
 * Persistance des lieux de vie. Comme pour les voyages, l'identité est stable : au recalcul, un lieu détecté à
 * moins de 30 km d'une ligne existante la reprend (lien, nom donné, couverture, statut). Un lieu `confirmed` reste
 * actif même s'il n'est plus détecté ; un lieu `rejected` n'est plus actif mais sa ligne garde le refus.
 */

export type LifePlaceStatus = "auto" | "confirmed" | "rejected";

type Row = {
  id: number; slug: string; title: string; custom_title: string | null; lat: number; lon: number; status: LifePlaceStatus;
  cover_media_id: number | null; auto_cover_media_id: number | null; media_ids: string; media_count: number;
  start_at: number | null; end_at: number | null;
};

export type ActivePlace = { id: number; lat: number; lon: number };

const json = (v: unknown) => JSON.stringify(v);

function uniqueSlug(db: Db, title: string) {
  const used = new Set((db.prepare("SELECT slug FROM life_place").all() as { slug: string }[]).map((r) => r.slug));
  const base = slugify(title) || "lieu";
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Fusionne les lieux détectés avec la table (à appeler dans la transaction du recalcul) et rend les lieux actifs.
 * `home` : le domicile réglé ou détecté (au moins 3 mois) ; il reste un lieu de vie, comme avant les lieux de vie.
 */
export function mergeLifePlaces(db: Db, drafts: LifePlaceDraft[], home: LatLon | null): ActivePlace[] {
  const candidates = [...drafts];
  if (home && !candidates.some((d) => distanceKm(d.lat, d.lon, home.lat, home.lon) <= HOME_RADIUS_KM))
    candidates.push({ lat: home.lat, lon: home.lon, title: placeName(home.lat, home.lon), months: 0, mediaIds: [] });

  const rows = db.prepare("SELECT * FROM life_place").all() as Row[];
  // Appariement glouton, plus proches d'abord : une ligne ne sert qu'à un candidat.
  const pairs: { d: LifePlaceDraft; r: Row; km: number }[] = [];
  for (const d of candidates)
    for (const r of rows) {
      const km = distanceKm(d.lat, d.lon, r.lat, r.lon);
      if (km <= HOME_RADIUS_KM) pairs.push({ d, r, km });
    }
  pairs.sort((a, b) => a.km - b.km);
  const match = new Map<LifePlaceDraft, Row>();
  const taken = new Set<number>();
  for (const { d, r } of pairs) {
    if (match.has(d) || taken.has(r.id)) continue;
    match.set(d, r);
    taken.add(r.id);
  }

  const insert = db.prepare("INSERT INTO life_place (slug, title, lat, lon) VALUES (?, ?, ?, ?) RETURNING id");
  const update = db.prepare("UPDATE life_place SET lat = ?, lon = ?, title = CASE WHEN status = 'auto' THEN ? ELSE title END WHERE id = ?");
  const active = new Map<number, ActivePlace>();
  for (const d of candidates) {
    const r = match.get(d);
    if (!r) {
      const { id } = insert.get(uniqueSlug(db, d.title), d.title, d.lat, d.lon) as { id: number };
      active.set(id, { id, lat: d.lat, lon: d.lon });
    } else if (r.status !== "rejected") {
      update.run(d.lat, d.lon, d.title, r.id);
      active.set(r.id, { id: r.id, lat: d.lat, lon: d.lon });
    }
  }
  for (const r of rows) if (r.status === "confirmed" && !active.has(r.id)) active.set(r.id, { id: r.id, lat: r.lat, lon: r.lon });
  return [...active.values()];
}

/** Écrit les photos de chaque lieu actif (triées par date), ses dates et sa couverture automatique ; vide les autres. */
export function writeLifePlaceMedia(db: Db, active: ActivePlace[], places: number[][], media: Map<number, MediaRow>) {
  const write = db.prepare(
    `UPDATE life_place SET media_ids = ?, media_count = ?, start_at = ?, end_at = ?, auto_cover_media_id = ?,
       cover_media_id = CASE WHEN cover_media_id IN (SELECT value FROM json_each(?)) THEN cover_media_id END
     WHERE id = ?`,
  );
  const done = new Set<number>();
  active.forEach((p, i) => {
    const ids = places[i] ?? [];
    const times = ids.map((id) => media.get(id)?.taken_at ?? 0);
    const startAt = ids.length ? times[0] : null;
    const endAt = ids.length ? times.at(-1)! : null;
    const cover = ids.length ? autoCover({ startAt: startAt!, endAt: endAt!, mediaIds: ids }, media) : null;
    write.run(json(ids), ids.length, startAt, endAt, cover, json(ids), p.id);
    done.add(p.id);
  });
  db.prepare(
    `UPDATE life_place SET media_ids = '[]', media_count = 0, start_at = NULL, end_at = NULL, auto_cover_media_id = NULL, cover_media_id = NULL
     WHERE id NOT IN (SELECT value FROM json_each(?))`,
  ).run(json([...done]));
}

/** Coordonnées des lieux de vie actifs, tels que le dernier recalcul les a laissés (tri d'un import). */
export function activeLifePlaceCenters(db: Db): LatLon[] {
  return db.prepare(`SELECT lat, lon FROM life_place WHERE status = 'confirmed' OR (status = 'auto' AND media_count > 0)`).all() as LatLon[];
}

/** Lignes rejetées : un domicile détecté à moins de 30 km de l'une d'elles n'est pas un lieu de vie. */
export function rejectedLifePlaces(db: Db): LatLon[] {
  return db.prepare("SELECT lat, lon FROM life_place WHERE status = 'rejected'").all() as LatLon[];
}

// ---------- lecture ----------

const ACTIVE = "(status = 'confirmed' OR (status = 'auto' AND media_count > 0))";

function summary(db: Db, r: Row) {
  const times = db
    .prepare("SELECT m.id, m.taken_at AS takenAt FROM json_each(?) j JOIN media m ON m.id = j.value WHERE m.taken_at IS NOT NULL ORDER BY m.taken_at, m.id")
    .all(r.media_ids) as { id: number; takenAt: number }[];
  return {
    id: r.id,
    slug: r.slug,
    title: r.custom_title ?? r.title,
    autoTitle: r.title,
    lat: r.lat,
    lon: r.lon,
    status: r.status,
    mediaCount: r.media_count,
    startAt: r.start_at,
    endAt: r.end_at,
    coverMediaId: r.cover_media_id ?? r.auto_cover_media_id,
    periodCount: periodsOf(times).length,
    times,
  };
}

/** Lieux de vie actifs, le plus récemment fréquenté d'abord. */
export function listLifePlaces(db: Db) {
  const rows = db.prepare(`SELECT * FROM life_place WHERE ${ACTIVE} ORDER BY end_at DESC, id`).all() as Row[];
  return rows.map((r) => {
    const { times: _times, ...s } = summary(db, r);
    return s;
  });
}
export type LifePlaceSummary = ReturnType<typeof listLifePlaces>[number];

type MediaDetailRow = {
  id: number; kind: "photo" | "video"; width: number | null; height: number | null; taken_at: number | null; taken_at_local: string | null;
  lat: number | null; lon: number | null; location_source: LocationSource | null; uploaded_by: string; has_thumbs: number; geo: string | null;
};

/** Un lieu (actif ou rejeté) avec ses périodes, la plus récente d'abord ; les photos d'une période vont dans l'ordre. */
export function getLifePlace(db: Db, slug: string) {
  const r = db.prepare("SELECT * FROM life_place WHERE slug = ?").get(slug) as Row | undefined;
  if (!r) return null;
  const { times, ...s } = summary(db, r);
  const rows = db
    .prepare(
      `SELECT m.id, m.kind, m.width, m.height, m.taken_at, m.taken_at_local, m.lat, m.lon, m.location_source, m.uploaded_by, m.has_thumbs, m.geo
       FROM json_each(?) j JOIN media m ON m.id = j.value`,
    )
    .all(r.media_ids) as MediaDetailRow[];
  const byId = new Map(rows.map((m) => [m.id, m]));
  const periods = periodsOf(times)
    .reverse()
    .map((p) => ({
      startAt: p.startAt,
      endAt: p.endAt,
      count: p.count,
      media: p.mediaIds.map((id) => {
        const m = byId.get(id)!;
        return {
          id: m.id,
          kind: m.kind,
          width: m.width,
          height: m.height,
          takenAt: m.taken_at,
          takenAtLocal: m.taken_at_local,
          lat: m.lat,
          lon: m.lon,
          locationSource: m.location_source,
          uploadedBy: m.uploaded_by,
          hasThumbs: m.has_thumbs === 1,
          place: m.geo ? ((JSON.parse(m.geo) as GeoPlace).place ?? null) : null,
        };
      }),
    }));
  return { ...s, periods };
}
export type LifePlaceDetail = NonNullable<ReturnType<typeof getLifePlace>>;

// ---------- modifications ----------

const clean = (t: string | null) => (t && t.trim() ? t.trim().slice(0, 120) : null);

export function renameLifePlace(db: Db, slug: string, title: string | null) {
  return db.prepare("UPDATE life_place SET custom_title = ? WHERE slug = ?").run(clean(title), slug).changes > 0;
}

/** Couverture choisie : une photo du lieu, ou null pour revenir à l'automatique. */
export function setLifePlaceCover(db: Db, slug: string, mediaId: number | null) {
  return (
    db
      .prepare("UPDATE life_place SET cover_media_id = ? WHERE slug = ? AND (? IS NULL OR ? IN (SELECT value FROM json_each(media_ids)))")
      .run(mediaId, slug, mediaId, mediaId).changes > 0
  );
}

/** Confirme ou rejette un lieu, puis recalcule (les photos d'un lieu rejeté retournent aux voyages). */
export function setLifePlaceStatus(db: Db, slug: string, status: "confirmed" | "rejected") {
  const r = db.prepare("SELECT status FROM life_place WHERE slug = ?").get(slug) as { status: LifePlaceStatus } | undefined;
  if (!r) return false;
  if (r.status !== status) {
    db.prepare("UPDATE life_place SET status = ? WHERE slug = ?").run(status, slug);
    rebuildTrips(db);
  }
  return true;
}

/**
 * « En fait, c'est un lieu de vie » : crée (ou réactive) un lieu confirmé au centre du voyage, avec son nom, puis
 * recalcule. Rend le lien du lieu, ou null si le voyage n'existe pas.
 */
export function tripToLifePlace(db: Db, tripSlug: string): string | null {
  const t = db.prepare("SELECT title, custom_title, center_lat, center_lon FROM trip WHERE slug = ?").get(tripSlug) as
    | { title: string; custom_title: string | null; center_lat: number; center_lon: number }
    | undefined;
  if (!t) return null;
  const rows = db.prepare("SELECT id, slug, lat, lon FROM life_place").all() as { id: number; slug: string; lat: number; lon: number }[];
  const near = rows
    .map((r) => ({ ...r, km: distanceKm(r.lat, r.lon, t.center_lat, t.center_lon) }))
    .filter((r) => r.km <= HOME_RADIUS_KM)
    .sort((a, b) => a.km - b.km)[0];
  let slug: string;
  if (near) {
    db.prepare("UPDATE life_place SET status = 'confirmed' WHERE id = ?").run(near.id);
    slug = near.slug;
  } else {
    const title = t.custom_title ?? t.title;
    slug = uniqueSlug(db, title);
    db.prepare("INSERT INTO life_place (slug, title, lat, lon, status) VALUES (?, ?, ?, ?, 'confirmed')").run(slug, title, t.center_lat, t.center_lon);
  }
  rebuildTrips(db);
  return slug;
}
