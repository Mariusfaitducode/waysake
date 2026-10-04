import sharp from "sharp";
// @ts-expect-error piexifjs n'a pas de types
import piexif from "piexifjs";

// piexifjs ne connaît pas OffsetTimeOriginal (0x9011)
piexif.TAGS.Exif[36881] ??= { name: "OffsetTimeOriginal", type: "Ascii" };

export type JpegOpts = {
  takenAt?: string; // "2026:09:01 14:03:22"
  offset?: string; // "+02:00"
  lat?: number;
  lon?: number;
  color?: string;
  width?: number;
  height?: number;
  source?: Buffer; // JPEG existant à enrichir
};

export async function makeJpeg(o: JpegOpts = {}): Promise<Buffer> {
  const base =
    o.source ??
    (await sharp({
      create: { width: o.width ?? 64, height: o.height ?? 48, channels: 3, background: o.color ?? "#c86" },
    })
      .jpeg()
      .toBuffer());
  const zeroth: Record<number, unknown> = { [piexif.ImageIFD.Make]: "Apple", [piexif.ImageIFD.Model]: "iPhone 15" };
  const exif: Record<number, unknown> = {};
  const gps: Record<number, unknown> = {};
  if (o.takenAt) exif[piexif.ExifIFD.DateTimeOriginal] = o.takenAt;
  if (o.offset) exif[36881] = o.offset;
  if (o.lat !== undefined && o.lon !== undefined) {
    gps[piexif.GPSIFD.GPSLatitudeRef] = o.lat < 0 ? "S" : "N";
    gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(o.lat));
    gps[piexif.GPSIFD.GPSLongitudeRef] = o.lon < 0 ? "W" : "E";
    gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(o.lon));
  }
  const bytes = piexif.dump({ "0th": zeroth, Exif: exif, GPS: gps });
  return Buffer.from(piexif.insert(bytes, base.toString("binary")), "binary");
}
