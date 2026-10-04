import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db.js";

/** Nombre d'instantanés quotidiens gardés dans DATA_DIR/backups. */
export const SNAPSHOT_KEEP = 7;
const SNAPSHOT = /^atlas-\d{4}-\d{2}-\d{2}\.db$/;

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Copie cohérente de la base (API de sauvegarde de SQLite, sans arrêter Atlas) dans
 * DATA_DIR/backups/atlas-AAAA-MM-JJ.db, puis supprime les instantanés au-delà des 7 derniers.
 * Protège notes, lieux posés à la main et voyages renommés d'une erreur ou d'une base abîmée ;
 * les originaux, eux, se sauvegardent en copiant le dossier de données sur un autre disque.
 */
export async function snapshotDb(db: Db, dataDir: string, now = new Date()): Promise<string> {
  const dir = join(dataDir, "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `atlas-${day(now)}.db`);
  rmSync(file, { force: true });
  await db.backup(file);
  const old = readdirSync(dir).filter((f) => SNAPSHOT.test(f)).sort().slice(0, -SNAPSHOT_KEEP);
  for (const f of old) rmSync(join(dir, f), { force: true });
  return file;
}

/** Un instantané au démarrage puis toutes les 24 h. Renvoie la fonction d'arrêt. */
export function scheduleSnapshots(db: Db, dataDir: string, onError: (err: unknown) => void): () => void {
  const run = () => void snapshotDb(db, dataDir).catch(onError);
  run();
  const timer = setInterval(run, 24 * 3600_000);
  timer.unref();
  return () => clearInterval(timer);
}
