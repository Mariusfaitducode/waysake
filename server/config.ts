/**
 * Réglage d'environnement `WAYSAKE_<nom>`, avec repli sur l'ancien nom `ATLAS_<nom>` (installations
 * d'avant le changement de nom, dont la tour). Une valeur vide compte comme absente.
 */
export function setting(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[`WAYSAKE_${name}`] || env[`ATLAS_${name}`] || undefined;
}

export const config = {
  dataDir: setting("DATA_DIR") ?? "./data",
  port: Number(setting("PORT") ?? 8420),
};
