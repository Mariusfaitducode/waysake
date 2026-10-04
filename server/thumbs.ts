import sharp, { type Sharp } from "sharp";
// @ts-expect-error heic-decode n'a pas de types
import decodeHeic from "heic-decode";

export const THUMB_SIZES = [400, 1600] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];

/** 100 Mpx : large au-dessus des 48 Mpx d'un iPhone, protège la RAM contre les bombes de décompression. */
export const MAX_PIXELS = 100_000_000;

export function assertPixelBudget(width: number, height: number) {
  if (width * height > MAX_PIXELS) throw new Error(`Image trop grande (${width}×${height})`);
}

type HeicImage = { width: number; height: number; decode(): Promise<{ data: Uint8ClampedArray }> };

/** Repli libheif pour les HEIC d'iPhone ; vérifie les dimensions avant d'allouer quoi que ce soit. */
async function openHeic(buf: Buffer): Promise<Sharp> {
  const images: HeicImage[] & { dispose(): void } = await decodeHeic.all({ buffer: buf });
  try {
    const [first] = images;
    assertPixelBudget(first.width, first.height);
    const { data } = await first.decode();
    return sharp(Buffer.from(data), { raw: { width: first.width, height: first.height, channels: 4 } });
  } finally {
    images.dispose();
  }
}

async function open(buf: Buffer): Promise<Sharp> {
  try {
    const img = sharp(buf, { failOn: "error", limitInputPixels: MAX_PIXELS });
    await img.clone().resize(8).raw().toBuffer();
    return img.rotate();
  } catch (err) {
    try {
      return await openHeic(buf);
    } catch {
      throw err;
    }
  }
}

/** Écrit `${outBase}-400.webp` et `${outBase}-1600.webp`, renvoie les dimensions de l'original (orientation appliquée). */
export async function makeThumbs(buf: Buffer, outBase: string): Promise<{ width: number; height: number }> {
  const img = await open(buf);
  for (const size of THUMB_SIZES) {
    await img
      .clone()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: size === 400 ? 72 : 82 })
      .toFile(`${outBase}-${size}.webp`);
  }
  const meta = await img.metadata();
  const quarterTurn = (meta.orientation ?? 1) >= 5;
  return quarterTurn ? { width: meta.height!, height: meta.width! } : { width: meta.width!, height: meta.height! };
}
