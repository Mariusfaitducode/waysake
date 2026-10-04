import { intlTag, locale, translatorFor, type Locale } from "../i18n";

/** Tailles, durées, place sur la tour et débit d'envoi. Pur : testé sans téléphone. */

export function formatBytes(bytes: number, l: Locale = locale()) {
  const tr = translatorFor(l);
  const n = (v: number) => new Intl.NumberFormat(intlTag(l), { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);
  if (bytes >= 1e12) return tr("size.tb", { n: n(bytes / 1e12) });
  if (bytes >= 1e9) return tr("size.gb", { n: n(bytes / 1e9) });
  if (bytes >= 1e6 || bytes === 0) return tr("size.mb", { n: n(bytes / 1e6) });
  return tr("size.kb", { n: n(Math.max(1, Math.round(bytes / 1e3))) });
}

export function formatDuration(seconds: number, l: Locale = locale()) {
  const tr = translatorFor(l);
  if (seconds < 60) return tr("duration.lessThanMinute");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return tr("duration.minutes", { count: minutes });
  return tr("duration.hours", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

export const etaSeconds = (bytesLeft: number, bytesPerSecond: number) => (bytesLeft <= 0 ? 0 : bytesLeft / Math.max(bytesPerSecond, 1));

/** Taille d'une sélection : la vraie taille du fichier quand le téléphone la donne, sinon la moyenne de la tour. */
export function sizeOf(items: { size: number | null; mediaType: "photo" | "video" }[], average: { photo: number; video: number }) {
  return items.reduce((n, i) => n + (i.size ?? average[i.mediaType]), 0);
}

const MARGIN = 1e9;
/** `full` : ne tient pas ; `tight` : tient, mais il restera moins de 1 Go. */
export function diskWarning(bytes: number, free: number): "full" | "tight" | null {
  if (bytes > free) return "full";
  return bytes + MARGIN > free ? "tight" : null;
}

export function forecastText(f: { months: number | null; fullAt: number | null }, monthlyBytes: number, l: Locale = locale()): string | null {
  if (f.months === null || f.fullAt === null || !(monthlyBytes > 0)) return null;
  const tr = translatorFor(l);
  const rate = formatBytes(monthlyBytes, l);
  if (f.months > 120) return tr("space.forecastLong", { rate });
  const date = new Intl.DateTimeFormat(intlTag(l), { month: "long", year: "numeric" }).format(f.fullAt);
  return tr("space.forecast", { rate, months: f.months, date });
}

/**
 * Débit réel pendant un envoi : octets terminés / temps écoulé depuis le début (tous envois parallèles confondus).
 * Avant 5 secondes, la mesure est trop bruitée : on garde le débit connu (moyenne des envois précédents).
 */
export function createRateMeter(prior: number, clock: () => number = Date.now) {
  const start = clock();
  let bytes = 0;
  return {
    add(n: number) {
      bytes += n;
    },
    rate() {
      const ms = clock() - start;
      return ms >= 5000 && bytes > 0 ? (bytes / ms) * 1000 : prior;
    },
    sample: () => ({ bytes, ms: clock() - start }),
  };
}
