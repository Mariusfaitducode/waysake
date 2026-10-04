/** Conversions de couleur minimales : sRGB ↔ OKLab ↔ OKLCH (Björn Ottosson, 2020). */

export type Oklab = [number, number, number];
export type Oklch = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Composantes sRGB 0–255 → OKLab. */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const [lr, lg, lb] = [r / 255, g / 255, b / 255].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToOklch([L, a, b]: Oklab): Oklch {
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, Math.hypot(a, b), h];
}

export function hexToOklch(hex: string): Oklch {
  const n = hex.replace("#", "");
  return oklabToOklch(rgbToOklab(parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)));
}

/** Écart entre deux teintes, en degrés (0–180). */
export function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
