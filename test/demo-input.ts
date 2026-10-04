import { demoShots } from "../scripts/demo-trips.js";
import { reverseGeocode } from "../server/geo.js";
import type { ClusterInput } from "../server/clustering.js";

/** Les photos de démo telles que le regroupement les voit (sans passer par les fichiers). */
export function demoInput(): ClusterInput[] {
  return demoShots().map((s, i) => {
    const m = s.takenAt?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    const takenAt = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
    const lat = s.lat ?? null;
    const lon = s.lon ?? null;
    return { id: i + 1, takenAt, lat, lon, geo: lat !== null && lon !== null ? reverseGeocode(lat, lon) : null };
  });
}
