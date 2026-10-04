import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Page « Statistiques » : ce que le foyer a envoyé, qui, la sauvegarde, le trafic depuis le démarrage et la
 * version qui tourne. Ici, uniquement des calculs sans base ni réseau ; la route les assemble (routes/stats.ts).
 */

const DAY = 86_400_000;
/** Mois et jours en UTC, comme les dates de l'interface (web/format.ts) : la tour tourne en UTC dans Docker. */
const monthOf = (ts: number) => new Date(ts).toISOString().slice(0, 7);
const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export type UploadRow = { userId: string; kind: "photo" | "video"; bytes: number; uploadedAt: number };

/**
 * Histogramme des envois, à la date d'envoi (pas de prise de vue) : un mois par barre, du premier envoi au
 * mois en cours, mois vides compris (un trou dans le temps doit se voir).
 */
export function uploadsByMonth(rows: UploadRow[], now = Date.now()) {
  if (!rows.length) return [];
  const counts = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const byUser = counts.get(monthOf(r.uploadedAt)) ?? counts.set(monthOf(r.uploadedAt), {}).get(monthOf(r.uploadedAt))!;
    byUser[r.userId] = (byUser[r.userId] ?? 0) + 1;
  }
  const first = monthOf(Math.min(...rows.map((r) => r.uploadedAt)));
  const last = [monthOf(now), monthOf(Math.max(...rows.map((r) => r.uploadedAt)))].sort().at(-1)!;
  const months: { month: string; total: number; byUser: Record<string, number> }[] = [];
  for (let [y, m] = first.split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= last; m === 12 ? ((m = 1), y++) : m++) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const byUser = counts.get(month) ?? {};
    months.push({ month, total: Object.values(byUser).reduce((a, b) => a + b, 0), byUser });
  }
  return months;
}

export function uploadTotals(rows: UploadRow[]) {
  return {
    photos: rows.filter((r) => r.kind === "photo").length,
    videos: rows.filter((r) => r.kind === "video").length,
    bytes: rows.reduce((n, r) => n + r.bytes, 0),
  };
}

/**
 * Une ligne par profil (dans l'ordre donné), même sans envoi. `reactions` : réactions données par profil,
 * `null` si la base n'en a pas (la page masque alors la colonne). La part est en % des éléments envoyés.
 */
export function uploadsByPerson(rows: UploadRow[], userIds: string[], reactions: Record<string, number> | null) {
  return userIds.map((userId) => {
    const mine = rows.filter((r) => r.userId === userId);
    return {
      userId,
      ...uploadTotals(mine),
      lastUploadAt: mine.length ? Math.max(...mine.map((r) => r.uploadedAt)) : null,
      reactions: reactions ? (reactions[userId] ?? 0) : null,
      share: rows.length ? Math.round((mine.length / rows.length) * 100) : 0,
    };
  });
}

export type TrafficEvent = {
  method: string;
  /** Route reconnue par le routeur (« /api/media/:id/original »), jamais l'adresse brute. */
  route: string | undefined;
  status: number;
  contentType?: string;
  /** Octets envoyés (Content-Length de la réponse). */
  bytes?: number;
  /** Octets reçus (Content-Length de la requête). */
  requestBytes?: number;
  /** Profil identifié (identify), sinon null. Rien d'autre sur la personne : ni adresse IP, ni appareil. */
  userId: string | null;
};

const VISIT_GAP = 30 * 60_000;
const KEEP_DAYS = 7;

/**
 * Trafic de l'API, en mémoire seulement : remis à zéro à chaque démarrage, et la page le dit.
 * Requêtes par jour (7 derniers jours), volume servi, envois reçus et passages par profil.
 */
export function createTraffic(now = () => Date.now()) {
  const since = now();
  const perDay = new Map<string, number>();
  const served = { photos: 0, videos: 0, previews: 0 };
  const uploads = { count: 0, bytes: 0 };
  const people = new Map<string, { requests: number; visits: number; lastSeen: number }>();

  return {
    record(e: TrafficEvent) {
      const t = now();
      const day = dayOf(t);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      // Ménage : on ne garde que la dernière semaine.
      if (perDay.size > KEEP_DAYS) for (const d of perDay.keys()) if (d <= dayOf(t - KEEP_DAYS * DAY)) perDay.delete(d);

      const ok = e.status < 400;
      if (ok && e.route === "/api/media/:id/original") served[e.contentType?.startsWith("video/") ? "videos" : "photos"] += e.bytes ?? 0;
      if (ok && (e.route === "/api/media/:id/thumb" || e.route === "/api/media/:id/preview")) served.previews += e.bytes ?? 0;
      if (e.method === "POST" && e.route === "/api/media" && e.status === 201) {
        uploads.count++;
        uploads.bytes += e.requestBytes ?? 0;
      }

      if (e.userId) {
        const p = people.get(e.userId) ?? { requests: 0, visits: 0, lastSeen: -Infinity };
        p.requests++;
        if (t - p.lastSeen >= VISIT_GAP) p.visits++;
        p.lastSeen = t;
        people.set(e.userId, p);
      }
    },
    snapshot() {
      const today = now();
      return {
        since,
        days: Array.from({ length: KEEP_DAYS }, (_, i) => {
          const day = dayOf(today - (KEEP_DAYS - 1 - i) * DAY);
          return { day, requests: perDay.get(day) ?? 0 };
        }),
        served: { ...served },
        uploads: { ...uploads },
        people: [...people].map(([userId, p]) => ({ userId, ...p })),
      };
    },
  };
}
export type Traffic = ReturnType<typeof createTraffic>;

/**
 * Journal de scripts/backup-tower.ps1 (copie nocturne sur un autre disque), une ligne par nuit :
 * « 2026-10-04T03:30:12 OK (robocopy 1) → E:\Atlas », « … ÉCHEC (robocopy 16) → … » ou
 * « … Disque de sauvegarde absent : E:/ ». On garde l'heure et l'état, jamais le chemin de la machine.
 */
export type ExternalBackup = { at: string | null; ok: boolean; reason: "ok" | "failed" | "disk_missing" | "unknown" };
export function parseBackupLine(line: string): ExternalBackup | null {
  const m = /^\uFEFF?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\s+(.*)$/.exec(line.trim());
  if (!m) return null;
  const [, at, rest] = m;
  if (/^OK\b/.test(rest)) return { at, ok: true, reason: "ok" };
  if (/^(ÉCHEC|ECHEC)\b/.test(rest)) return { at, ok: false, reason: "failed" };
  if (/^Disque de sauvegarde absent/.test(rest)) return { at, ok: false, reason: "disk_missing" };
  return { at, ok: false, reason: "unknown" };
}

const SNAPSHOT = /^atlas-\d{4}-\d{2}-\d{2}\.db$/;

/** Instantanés quotidiens de la base (backup.ts) et dernière copie sur un autre disque, s'il y en a une. */
export function readBackups(dataDir: string) {
  let files: string[] = [];
  try {
    files = readdirSync(join(dataDir, "backups")).filter((f) => SNAPSHOT.test(f));
  } catch {
    // Pas encore d'instantané (premier démarrage, ou instantanés désactivés).
  }
  const times = files.map((f) => statSync(join(dataDir, "backups", f), { throwIfNoEntry: false })?.mtimeMs ?? 0).filter(Boolean);
  let external: ExternalBackup | null = null;
  try {
    const lines = readFileSync(join(dataDir, "backup.log"), "utf8").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length) external = parseBackupLine(lines.at(-1)!) ?? { at: null, ok: false, reason: "unknown" };
  } catch {
    // Pas de journal : aucune copie sur un autre disque n'a jamais tourné.
  }
  return { snapshots: files.length, lastSnapshotAt: times.length ? Math.round(Math.max(...times)) : null, external };
}
