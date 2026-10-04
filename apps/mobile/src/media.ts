import * as ML from "expo-media-library/legacy";
import { uploadFields } from "./lib/fields";

/**
 * Accès à la photothèque. On utilise l'API « legacy » d'expo-media-library : sur Android, c'est elle qui
 * lit la position via MediaStore.setRequireOriginal (la nouvelle API la reçoit expurgée).
 */
export type Found = { id: string; filename: string; mediaType: "photo" | "video"; creationTime: number };

export async function ensurePermission(): Promise<"granted" | "limited" | "denied"> {
  const p = await ML.requestPermissionsAsync(false, ["photo", "video"]);
  if (!p.granted) return "denied";
  return p.accessPrivileges === "limited" ? "limited" : "granted";
}

/** Toutes les photos et vidéos prises entre deux dates (pagination par 300). */
export async function scan(from: number, to: number, onProgress?: (n: number) => void): Promise<Found[]> {
  const out: Found[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await ML.getAssetsAsync({
      first: 300,
      after,
      mediaType: [ML.MediaType.photo, ML.MediaType.video],
      createdAfter: from,
      createdBefore: to,
      sortBy: [[ML.SortBy.creationTime, true]],
    });
    for (const a of page.assets)
      out.push({ id: a.id, filename: a.filename, mediaType: a.mediaType === ML.MediaType.video ? "video" : "photo", creationTime: a.creationTime });
    onProgress?.(out.length);
    if (!page.hasNextPage) return out;
    after = page.endCursor;
  }
}

/** Fichier original + ce que le téléphone sait (date, lieu, capture d'écran). */
export async function prepare(found: Found): Promise<{ uri: string; fields: Record<string, string> }> {
  const info = await ML.getAssetInfoAsync(found.id, { shouldDownloadFromNetwork: true });
  const uri = info.localUri ?? info.uri;
  return {
    uri,
    fields: uploadFields({
      creationTime: info.creationTime ?? found.creationTime,
      location: info.location ?? null,
      filename: info.filename,
      mediaSubtypes: info.mediaSubtypes as string[] | undefined,
    }),
  };
}
