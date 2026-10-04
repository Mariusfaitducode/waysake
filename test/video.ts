import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";

/** Une vraie petite vidéo QuickTime (2 s), avec date et position comme un iPhone. */
export function makeVideo(opts: { creationTime?: string; location?: string; seconds?: number; ext?: "mov" | "mp4" } = {}): Buffer {
  const out = join(mkdtempSync(join(tmpdir(), "atlas-vid-")), `clip.${opts.ext ?? "mov"}`);
  const meta = [
    ...(opts.creationTime ? ["-metadata", `creation_time=${opts.creationTime}`] : []),
    ...(opts.location ? ["-metadata", `location=${opts.location}`] : []),
  ];
  execFileSync(ffmpeg as unknown as string, [
    "-v", "error", "-y", "-f", "lavfi", "-i", `testsrc=duration=${opts.seconds ?? 2}:size=320x180:rate=10`,
    ...meta, "-c:v", "mpeg4", out,
  ]);
  return readFileSync(out);
}
