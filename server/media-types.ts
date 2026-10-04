export type MediaType = { kind: "photo" | "video"; mime: string; ext: string };

const TYPES: Record<string, Omit<MediaType, "ext">> = {
  jpg: { kind: "photo", mime: "image/jpeg" },
  jpeg: { kind: "photo", mime: "image/jpeg" },
  heic: { kind: "photo", mime: "image/heic" },
  heif: { kind: "photo", mime: "image/heif" },
  png: { kind: "photo", mime: "image/png" },
  webp: { kind: "photo", mime: "image/webp" },
  mp4: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
};

export function detectType(name: string): MediaType | null {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const t = TYPES[ext];
  return t ? { ...t, ext: ext === "jpeg" ? "jpg" : ext } : null;
}
