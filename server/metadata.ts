import exifr from "exifr";

export type Metadata = {
  takenAt: number | null;
  takenAtLocal: string | null;
  lat: number | null;
  lon: number | null;
  camera: string | null;
};

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function readMetadata(buf: Buffer): Promise<Metadata> {
  let raw: any = null;
  try {
    raw = await exifr.parse(buf, { tiff: true, exif: true, gps: true, reviveValues: false });
  } catch {
    raw = null;
  }

  let takenAt: number | null = null;
  let takenAtLocal: string | null = null;
  const dt = raw?.DateTimeOriginal ?? raw?.CreateDate ?? raw?.DateTime;
  const m = typeof dt === "string" ? dt.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/) : null;
  if (m && m[1] !== "0000") {
    takenAtLocal = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    takenAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const off = raw?.OffsetTimeOriginal ?? raw?.OffsetTime;
    const om = typeof off === "string" ? off.match(/^([+-])(\d{2}):(\d{2})$/) : null;
    if (om) takenAt -= (om[1] === "-" ? -1 : 1) * (+om[2] * 60 + +om[3]) * 60_000;
  }

  const lat = finite(raw?.latitude);
  const lon = finite(raw?.longitude);
  const camera = [raw?.Make, raw?.Model].filter((s) => typeof s === "string" && s.trim()).join(" ").trim() || null;
  return { takenAt, takenAtLocal, lat, lon, camera };
}
