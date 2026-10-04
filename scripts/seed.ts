import { config } from "../server/config.js";
import { openDb } from "../server/db.js";
import { ingest } from "../server/ingest.js";
import { makeJpeg } from "../test/fixtures.js";
import { demoCacheDir, demoPhotoJpeg } from "./demo-photos.js";
import { demoShots, type Shot } from "./demo-trips.js";

// Photos libres (crédits : docs/demo-photos.md), téléchargées une fois puis prises dans le cache.
// La date et le GPS sont ceux du voyage de démo, pas ceux de la photo.
let plain = 0;
async function photo(shot: Shot): Promise<Buffer> {
  const [w, h] = shot.portrait ? [1067, 1600] : [1600, 1067];
  const { data, photo } = await demoPhotoJpeg(shot.place, shot.index, w, h, { seed: shot.seed });
  if (!photo) plain++;
  return makeJpeg({ source: data, takenAt: shot.takenAt, lat: shot.lat, lon: shot.lon });
}

const started = Date.now();
console.log(`photos de démo : cache ${demoCacheDir()}`);
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
console.log(`\n${added} photos ajoutées · ${dupes} déjà présentes · ${((Date.now() - started) / 1000).toFixed(0)} s`);
if (plain) console.log(`${plain} images unies à la place de photos indisponibles (réseau ?) — relancez pnpm seed plus tard.`);
