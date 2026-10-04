import type { Db } from "../server/db.js";
import { demoInput } from "./demo-input.js";

/** Insère les photos de démo directement en base (sans fichiers) : id de média = id de demoInput. */
export function insertDemoMedia(db: Db, filter: (p: ReturnType<typeof demoInput>[number]) => boolean = () => true) {
  const insert = db.prepare(
    `INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height,
       taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs)
     VALUES (?, ?, 'photo', ?, ?, 'image/jpeg', 1, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
  );
  const rows = demoInput().filter(filter);
  db.transaction(() => {
    for (const p of rows) {
      const local = p.takenAt ? new Date(p.takenAt).toISOString().slice(0, 19) : null;
      insert.run(p.id, `sha-${p.id}`, `x/${p.id}.jpg`, `${p.id}.jpg`, p.id % 3 ? 1600 : 1067, p.id % 3 ? 1067 : 1600,
        p.takenAt, local, p.lat, p.lon, p.id % 2 ? "alex" : "sam");
    }
  })();
  return rows;
}
