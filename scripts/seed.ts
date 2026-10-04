import sharp from "sharp";
import { config } from "../server/config.js";
import { openDb } from "../server/db.js";
import { ingest } from "../server/ingest.js";
import { makeJpeg } from "../test/fixtures.js";
import { demoShots, type Shot } from "./demo-trips.js";

async function photo(shot: Shot): Promise<Buffer> {
  const [w, h] = shot.portrait ? [1067, 1600] : [1600, 1067];
  let source: Buffer;
  try {
    const res = await fetch(`https://picsum.photos/seed/${shot.seed}/${w}/${h}.jpg`);
    if (!res.ok) throw new Error(String(res.status));
    source = Buffer.from(await res.arrayBuffer());
  } catch {
    const hue = [...shot.seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    source = await sharp({ create: { width: w, height: h, channels: 3, background: `hsl(${hue},45%,55%)` } })
      .jpeg()
      .toBuffer();
  }
  return makeJpeg({ source, takenAt: shot.takenAt, lat: shot.lat, lon: shot.lon });
}

const db = openDb(config.dataDir);
const shots = demoShots();
let added = 0;
let dupes = 0;
const queue = [...shots];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let shot = queue.shift(); shot; shot = queue.shift()) {
      const r = await ingest(db, config.dataDir, { name: `${shot.seed}.jpg`, data: await photo(shot), userId: shot.who });
      r.duplicate ? dupes++ : added++;
      if ((added + dupes) % 25 === 0) console.log(`${added + dupes}/${shots.length}`);
    }
  }),
);
console.log(`\n${added} photos ajoutées · ${dupes} déjà présentes`);
