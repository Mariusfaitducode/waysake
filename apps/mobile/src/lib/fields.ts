/** Ce que l'app envoie avec chaque fichier (le serveur ne s'en sert que si l'EXIF n'a pas l'info). Pur. */
type AssetLike = {
  creationTime: number | null;
  location?: { latitude: number; longitude: number } | null;
  filename: string;
  mediaSubtypes?: string[];
  albumName?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Heure murale du téléphone (« 2026-09-03T10:05:09 »), comme l'EXIF d'un appareil photo. */
export function localIso(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function isScreenshotAsset(a: Pick<AssetLike, "filename" | "mediaSubtypes" | "albumName">) {
  return !!a.mediaSubtypes?.includes("screenshot") || /^screenshots?$/i.test(a.albumName ?? "") || /^screenshot|capture d.?[ée]cran/i.test(a.filename);
}

export function uploadFields(a: AssetLike): Record<string, string> {
  const f: Record<string, string> = {};
  if (a.creationTime && a.creationTime > 0) {
    f.takenAt = String(Math.round(a.creationTime));
    f.takenAtLocal = localIso(a.creationTime);
  }
  const loc = a.location;
  if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
    f.lat = String(loc.latitude);
    f.lon = String(loc.longitude);
  }
  if (isScreenshotAsset(a)) f.screenshot = "1";
  return f;
}
