import { execFile } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/** Métadonnées et image d'aperçu d'une vidéo, via ffmpeg (embarqué, aucune installation requise). */
export type VideoInfo = {
  takenAt: number | null;
  takenAtLocal: string | null;
  lat: number | null;
  lon: number | null;
  frame: Buffer | null;
};

const ffmpeg = ffmpegPath as unknown as string;

/**
 * Défense en profondeur : ffmpeg devine le format au contenu, pas à l'extension. On impose le
 * conteneur QuickTime/MP4 (iPhone .mov, Android .mp4) et le seul protocole « file », pour qu'un
 * faux fichier vidéo (liste HLS, concat…) ne puisse jamais lui faire lire autre chose.
 */
const SAFE_INPUT = ["-protocol_whitelist", "file", "-f", "mov"];

function run(args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve) => {
    execFile(ffmpeg, args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 60_000 }, (_err, stdout, stderr) =>
      resolve({ stdout, stderr: stderr.toString("utf8") }),
    );
  });
}

/** ISO 6709 : « +45.4375+012.3358+000.000/ » (iPhone : com.apple.quicktime.location.ISO6709, Android : location). */
function parseIso6709(s: string): { lat: number; lon: number } | null {
  const m = s.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0) ? { lat, lon } : null;
}

export async function readVideo(path: string): Promise<VideoInfo> {
  const { stderr } = await run(["-hide_banner", ...SAFE_INPUT, "-i", path]);
  const header = stderr.split(/\n\s*Stream #/)[0];

  // Préférer la date de l'iPhone (heure locale + fuseau), sinon creation_time (UTC).
  let takenAt: number | null = null;
  let takenAtLocal: string | null = null;
  const apple = header.match(/com\.apple\.quicktime\.creationdate\s*:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}):?(\d{2})/);
  const utc = header.match(/creation_time\s*:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (apple) {
    takenAtLocal = apple[1];
    const offset = (Number(apple[2]) * 60 + Math.sign(Number(apple[2]) || 1) * Number(apple[3])) * 60_000;
    takenAt = Date.parse(`${apple[1]}Z`) - offset;
  } else if (utc && !utc[1].startsWith("1970") && !utc[1].startsWith("1904")) {
    takenAtLocal = utc[1];
    takenAt = Date.parse(`${utc[1]}Z`);
  }

  const loc = header.match(/(?:ISO6709|location)\s*:\s*(\S+)/);
  const pos = loc ? parseIso6709(loc[1]) : null;

  // Image d'aperçu à 1 s (au début si la vidéo est plus courte). ffmpeg applique la rotation de l'iPhone.
  let frame: Buffer | null = null;
  for (const at of ["1", "0"]) {
    const { stdout } = await run(["-v", "error", "-ss", at, ...SAFE_INPUT, "-i", path, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "3", "-"]);
    if (stdout.length > 0) {
      frame = stdout;
      break;
    }
  }
  return { takenAt, takenAtLocal, lat: pos?.lat ?? null, lon: pos?.lon ?? null, frame };
}
