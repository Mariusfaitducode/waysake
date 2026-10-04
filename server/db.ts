import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type Db = Database.Database;

const MIGRATIONS = [
  `
  CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL);
  CREATE TABLE media (
    id INTEGER PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('photo','video')),
    original_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    width INTEGER, height INTEGER,
    taken_at INTEGER, taken_at_local TEXT,
    lat REAL, lon REAL,
    camera TEXT,
    uploaded_by TEXT NOT NULL REFERENCES user(id),
    uploaded_at INTEGER NOT NULL,
    has_thumbs INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX media_taken_at ON media(taken_at);
  `,
  `
  ALTER TABLE media ADD COLUMN geo TEXT;
  CREATE TABLE trip (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    custom_title TEXT,
    cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    auto_cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    center_lat REAL NOT NULL,
    center_lon REAL NOT NULL,
    country_codes TEXT NOT NULL,
    route TEXT NOT NULL,
    media_count INTEGER NOT NULL
  );
  CREATE TABLE chapter (
    id INTEGER PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL,
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    custom_title TEXT,
    places TEXT NOT NULL,
    country_codes TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    center_lat REAL NOT NULL,
    center_lon REAL NOT NULL,
    media_count INTEGER NOT NULL
  );
  CREATE INDEX chapter_trip ON chapter(trip_id, sort);
  CREATE TABLE media_chapter (
    media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
    chapter_id INTEGER NOT NULL REFERENCES chapter(id) ON DELETE CASCADE
  );
  CREATE INDEX media_chapter_chapter ON media_chapter(chapter_id);
  -- « Fusionner avec l'étape précédente » : on retient la première photo de l'étape absorbée.
  CREATE TABLE chapter_merge (
    trip_id INTEGER NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    anchor_media_id INTEGER NOT NULL,
    PRIMARY KEY (trip_id, anchor_media_id)
  );
  CREATE TABLE note (
    id INTEGER PRIMARY KEY,
    trip_id INTEGER REFERENCES trip(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapter(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    author TEXT NOT NULL REFERENCES user(id),
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE wish (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    country_code TEXT,
    lat REAL,
    lon REAL,
    month TEXT,
    note TEXT NOT NULL DEFAULT '',
    done_trip_id INTEGER REFERENCES trip(id) ON DELETE SET NULL,
    done_at INTEGER,
    author TEXT NOT NULL REFERENCES user(id),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  `
  -- Sas d'import : une session regroupe les envois d'un téléphone avant validation.
  CREATE TABLE import (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    created_at INTEGER NOT NULL,
    keep_home INTEGER NOT NULL DEFAULT 0,
    duplicates INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled'))
  );
  ALTER TABLE media ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready'));
  ALTER TABLE media ADD COLUMN import_id INTEGER REFERENCES import(id);
  ALTER TABLE media ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE media ADD COLUMN people INTEGER;
  ALTER TABLE media ADD COLUMN screenshot INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX media_import ON media(import_id);
  `,
  `
  -- D'où vient le lieu d'une photo : GPS du fichier, téléphone, saisie manuelle ou jeu.
  ALTER TABLE media ADD COLUMN location_source TEXT CHECK (location_source IN ('exif', 'phone', 'manual', 'game'));
  UPDATE media SET location_source = 'exif' WHERE lat IS NOT NULL;
  `,
  `
  -- Sessions du mot de passe du foyer (ATLAS_PASSWORD) : seule l'empreinte SHA-256 du jeton est gardée.
  CREATE TABLE session (token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
  `,
];

export type Profile = { id: string; name: string; color: string };

const COLORS = ["#0B7A4B", "#1F6FB2", "#C2410C", "#7C3AED", "#BE185D", "#0E7490"];
export const DEFAULT_PROFILES = "Alex,Sam";

const slug = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** « Alex:#0B7A4B, Sam » → profils ; la couleur est facultative. */
export function parseProfiles(spec: string): Profile[] {
  return spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, i) => {
      const [name, color] = part.split(":").map((x) => x.trim());
      return { id: slug(name), name, color: color || COLORS[i % COLORS.length] };
    })
    .filter((p) => p.id);
}

/**
 * Profils du foyer. `ATLAS_PROFILES` crée ou renomme les profils listés (jamais de suppression :
 * les photos y sont rattachées). Sans réglage, une base vide reçoit deux profils d'exemple.
 */
export function syncProfiles(db: Db, spec: string | undefined) {
  const empty = (db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }).n === 0;
  if (!spec && !empty) return;
  const upsert = db.prepare(
    "INSERT INTO user (id, name, color) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color",
  );
  db.transaction(() => {
    for (const p of parseProfiles(spec || DEFAULT_PROFILES)) upsert.run(p.id, p.name, p.color);
  })();
}

export function openDb(dataDir: string, profiles = process.env.ATLAS_PROFILES): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "atlas.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  syncProfiles(db, profiles);
  return db;
}
