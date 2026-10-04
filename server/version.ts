import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Version = { commit: string; date: string };

/** Version déployée : server/version.json, écrit par scripts/deploy-tower.sh dans l'archive envoyée à la tour. */
export function readVersion(dir = dirname(fileURLToPath(import.meta.url))): Version | null {
  try {
    const v = JSON.parse(readFileSync(join(dir, "version.json"), "utf8")) as Partial<Version>;
    return typeof v.commit === "string" && typeof v.date === "string" ? { commit: v.commit, date: v.date } : null;
  } catch {
    return null;
  }
}
