import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTraffic, parseBackupLine, readBackups, uploadTotals, uploadsByMonth, uploadsByPerson, type UploadRow } from "./stats.js";

const at = (iso: string) => Date.parse(`${iso}Z`);
const row = (userId: string, iso: string, kind: "photo" | "video" = "photo", bytes = 1000): UploadRow => ({ userId, kind, bytes, uploadedAt: at(iso) });

describe("envois par mois", () => {
  it("un mois par barre, empilé par personne, mois vides compris jusqu'au mois en cours", () => {
    const rows = [row("alex", "2026-07-03T10:00:00"), row("sam", "2026-07-20T10:00:00"), row("alex", "2026-07-31T23:00:00"), row("sam", "2026-09-01T08:00:00", "video")];
    expect(uploadsByMonth(rows, at("2026-10-04T12:00:00"))).toEqual([
      { month: "2026-07", total: 3, byUser: { alex: 2, sam: 1 } },
      { month: "2026-08", total: 0, byUser: {} },
      { month: "2026-09", total: 1, byUser: { sam: 1 } },
      { month: "2026-10", total: 0, byUser: {} },
    ]);
  });

  it("change d'année sans trou, et rien quand personne n'a encore rien envoyé", () => {
    const months = uploadsByMonth([row("alex", "2025-11-30T10:00:00")], at("2026-02-01T00:00:00")).map((m) => m.month);
    expect(months).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(uploadsByMonth([], at("2026-02-01T00:00:00"))).toEqual([]);
  });

  it("totaux : photos, vidéos et octets", () => {
    const rows = [row("alex", "2026-07-03T10:00:00", "photo", 3000), row("sam", "2026-07-04T10:00:00", "video", 7000)];
    expect(uploadTotals(rows)).toEqual({ photos: 1, videos: 1, bytes: 10_000 });
  });
});

describe("par personne", () => {
  it("photos, vidéos, volume, dernier envoi, réactions données et part en %", () => {
    const rows = [
      row("alex", "2026-07-03T10:00:00", "photo", 100),
      row("alex", "2026-08-03T10:00:00", "video", 900),
      row("sam", "2026-07-20T10:00:00", "photo", 50),
    ];
    const people = uploadsByPerson(rows, ["alex", "sam", "lou"], { sam: 4 });
    expect(people).toEqual([
      { userId: "alex", photos: 1, videos: 1, bytes: 1000, lastUploadAt: at("2026-08-03T10:00:00"), reactions: 0, share: 67 },
      { userId: "sam", photos: 1, videos: 0, bytes: 50, lastUploadAt: at("2026-07-20T10:00:00"), reactions: 4, share: 33 },
      { userId: "lou", photos: 0, videos: 0, bytes: 0, lastUploadAt: null, reactions: 0, share: 0 },
    ]);
  });

  it("sans réactions (table absente) : null, pas zéro", () => {
    expect(uploadsByPerson([row("alex", "2026-07-03T10:00:00")], ["alex"], null)[0].reactions).toBeNull();
  });
});

describe("compteur de trafic", () => {
  const original = (contentType: string, bytes: number, userId: string | null = "alex") => ({
    method: "GET",
    route: "/api/media/:id/original",
    status: 200,
    contentType,
    bytes,
    userId,
  });

  it("compte les requêtes par jour sur les 7 derniers jours, les jours plus anciens tombent", () => {
    let now = at("2026-10-01T12:00:00");
    const traffic = createTraffic(() => now);
    for (let d = 0; d < 9; d++) {
      for (let i = 0; i <= d; i++) traffic.record({ method: "GET", route: "/api/trips", status: 200, userId: null });
      now += 86_400_000;
    }
    now -= 86_400_000; // dernier jour enregistré : 9 octobre
    const { days, since } = traffic.snapshot();
    expect(since).toBe(at("2026-10-01T12:00:00"));
    expect(days.map((d) => d.day)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(days.map((d) => d.requests)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("des jours calmes restent à zéro", () => {
    let now = at("2026-10-01T12:00:00");
    const traffic = createTraffic(() => now);
    traffic.record({ method: "GET", route: "/api/trips", status: 200, userId: null });
    now = at("2026-10-04T09:00:00");
    expect(traffic.snapshot().days.map((d) => d.requests)).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });

  it("volume servi : originaux photo et vidéo, aperçus ; envois reçus", () => {
    const traffic = createTraffic(() => at("2026-10-01T12:00:00"));
    traffic.record(original("image/jpeg", 4_000_000));
    traffic.record(original("video/mp4", 30_000_000));
    traffic.record({ method: "GET", route: "/api/media/:id/thumb", status: 200, contentType: "image/webp", bytes: 20_000, userId: "alex" });
    traffic.record({ method: "GET", route: "/api/media/:id/preview", status: 200, contentType: "image/webp", bytes: 200_000, userId: "alex" });
    traffic.record({ method: "POST", route: "/api/media", status: 201, requestBytes: 5_000_000, userId: "sam" });
    traffic.record({ method: "POST", route: "/api/media", status: 415, requestBytes: 1_000, userId: "sam" }); // refusé : pas un envoi
    const s = traffic.snapshot();
    expect(s.served).toEqual({ photos: 4_000_000, videos: 30_000_000, previews: 220_000 });
    expect(s.uploads).toEqual({ count: 1, bytes: 5_000_000 });
  });

  it("connexions par profil : une visite après 30 min de silence, rien d'autre que l'identifiant", () => {
    let now = at("2026-10-01T12:00:00");
    const traffic = createTraffic(() => now);
    const hit = (userId: string | null) => traffic.record({ method: "GET", route: "/api/trips", status: 200, userId });
    hit("alex");
    now += 60_000;
    hit("alex"); // même visite
    now += 45 * 60_000;
    hit("alex"); // nouvelle visite
    hit("sam");
    hit(null); // anonyme : compté dans les requêtes, pas dans les profils
    const s = traffic.snapshot();
    expect(s.people).toEqual([
      { userId: "alex", requests: 3, visits: 2, lastSeen: now },
      { userId: "sam", requests: 1, visits: 1, lastSeen: now },
    ]);
    expect(s.days.at(-1)!.requests).toBe(5);
    expect(Object.keys(s.people[0]).sort()).toEqual(["lastSeen", "requests", "userId", "visits"]);
  });
});

describe("sauvegarde", () => {
  const tmp = () => mkdtempSync(join(tmpdir(), "waysake-stats-"));

  it("lit la dernière ligne du journal de copie sur disque externe, sans le chemin", () => {
    expect(parseBackupLine("2026-10-04T03:30:12 OK (robocopy 1) → E:\\Atlas")).toEqual({ at: "2026-10-04T03:30:12", ok: true, reason: "ok" });
    expect(parseBackupLine("2026-10-03T03:30:05 ÉCHEC (robocopy 16) → E:\\Atlas")).toEqual({ at: "2026-10-03T03:30:05", ok: false, reason: "failed" });
    expect(parseBackupLine("\uFEFF2026-10-02T03:30:00 Disque de sauvegarde absent : E:/")).toEqual({ at: "2026-10-02T03:30:00", ok: false, reason: "disk_missing" });
    expect(parseBackupLine("n'importe quoi")).toBeNull();
    expect(parseBackupLine("")).toBeNull();
  });

  it("instantanés de la base : nombre gardé et date du plus récent ; journal externe absent", () => {
    const dir = tmp();
    mkdirSync(join(dir, "backups"));
    writeFileSync(join(dir, "backups", "atlas-2026-10-02.db"), "x");
    writeFileSync(join(dir, "backups", "atlas-2026-10-04.db"), "x");
    writeFileSync(join(dir, "backups", "notes.txt"), "pas un instantané");
    const recent = at("2026-10-04T03:00:00");
    utimesSync(join(dir, "backups", "atlas-2026-10-04.db"), recent / 1000, recent / 1000);
    utimesSync(join(dir, "backups", "atlas-2026-10-02.db"), recent / 1000 - 2 * 86_400, recent / 1000 - 2 * 86_400);
    const b = readBackups(dir);
    expect(b.snapshots).toBe(2);
    expect(b.lastSnapshotAt).toBe(recent);
    expect(b.external).toBeNull();
    expect(JSON.stringify(b)).not.toContain(dir);
  });

  it("dossier vide : zéro instantané ; journal présent : sa dernière ligne lisible", () => {
    const dir = tmp();
    writeFileSync(join(dir, "backup.log"), "2026-10-03T03:30:05 ÉCHEC (robocopy 16) → E:\\Atlas\r\n2026-10-04T03:30:12 OK (robocopy 1) → E:\\Atlas\r\n\r\n");
    const b = readBackups(dir);
    expect(b).toEqual({ snapshots: 0, lastSnapshotAt: null, external: { at: "2026-10-04T03:30:12", ok: true, reason: "ok" } });
  });
});
