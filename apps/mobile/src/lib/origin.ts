/** Une adresse appartient-elle à la tour ? Comparaison stricte schéma + hôte + port (pas de « commence par »). */
export function sameOrigin(tower: string, url: string): boolean {
  try {
    const a = new URL(tower);
    const b = new URL(url);
    return (b.protocol === "http:" || b.protocol === "https:") && a.protocol === b.protocol && a.host === b.host;
  } catch {
    return false;
  }
}
