/**
 * Construit et signe le raccourci iPhone : `pnpm tsx scripts/build-shortcut.ts [adresse-de-la-tour] [profil]`.
 * Sortie : web/public/waysake.shortcut (hors git), servi par la tour sur /waysake.shortcut.
 * La signature (`shortcuts sign --mode anyone`) passe par iCloud : il faut un Mac connecté à un compte Apple.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildShortcut } from "./shortcut.js";

const [url = "https://", profile = ""] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), "waysake.shortcut-"));
const unsigned = join(dir, "Importer dans Waysake.shortcut");
const output = join(process.cwd(), "web/public/waysake.shortcut");
try {
  writeFileSync(unsigned, JSON.stringify(buildShortcut({ url: url.replace(/\/+$/, ""), profile })));
  execFileSync("plutil", ["-convert", "binary1", unsigned]);
  execFileSync("shortcuts", ["sign", "--mode", "anyone", "--input", unsigned, "--output", output], { stdio: "inherit" });
  console.log(`Raccourci signé : ${output}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
