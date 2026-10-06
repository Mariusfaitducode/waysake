import { describe, it, expect } from "vitest";
import type { Media } from "./api.js";
import { canRelocate, subStops } from "./substops.js";

let next = 1;
/** Une photo prise le 12 août, une heure après la précédente, dans la ville donnée. */
function photo(place: string | null, extra: Partial<Media> = {}): Media {
  const id = next++;
  const hour = String(id % 24).padStart(2, "0");
  return {
    id,
    kind: "photo",
    width: 4,
    height: 3,
    takenAt: id * 3_600_000,
    takenAtLocal: `2026-08-12T${hour}:00:00`,
    lat: place ? 43 : null,
    lon: place ? 11 : null,
    locationSource: place ? "exif" : null,
    uploadedBy: "marius",
    hasThumbs: true,
    place,
    thumb: "",
    preview: "",
    original: "",
    ...extra,
  };
}
const cities = (media: Media[]) => subStops(media).map((s) => `${s.place}:${s.media.length}`);

describe("subStops", () => {
  it("une seule ville : un seul groupe", () => {
    const media = [photo("Sienne"), photo("Sienne"), photo("Sienne")];
    const groups = subStops(media);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ place: "Sienne", startLocal: media[0].takenAtLocal, endLocal: media[2].takenAtLocal });
    expect(groups[0].media).toEqual(media);
  });

  it("aucune photo : aucun groupe", () => expect(subStops([])).toEqual([]));

  it("revenir dans une ville plus tard fait une nouvelle sous-étape (ordre du récit)", () => {
    expect(cities([photo("Sienne"), photo("Sienne"), photo("Pise"), photo("Pise"), photo("Sienne")])).toEqual(["Sienne:2", "Pise:2", "Sienne:1"]);
  });

  it("une photo isolée entre deux passages dans la même ville y est rattachée", () => {
    expect(cities([photo("Sienne"), photo("Sienne"), photo("Pise"), photo("Sienne"), photo("Sienne")])).toEqual(["Sienne:5"]);
  });

  it("une vraie visite n'est pas du bruit : une photo seule à plus de 3 km de ses voisines reste visible (lac de Braies)", () => {
    const valdaora = { lat: 46.757, lon: 12.034 };
    const braies = { lat: 46.694, lon: 12.085 }; // ~8 km
    expect(cities([photo("Valdaora", valdaora), photo("Lago di Braies", braies), photo("Valdaora", valdaora)])).toEqual(["Valdaora:1", "Lago di Braies:1", "Valdaora:1"]);
    // Un GPS qui hésite à la limite de deux communes (à quelques centaines de mètres) reste du bruit.
    const limite = { lat: 46.759, lon: 12.036 };
    expect(cities([photo("Valdaora", valdaora), photo("Rasun", limite), photo("Valdaora", valdaora)])).toEqual(["Valdaora:3"]);
  });

  it("un lieu choisi à la main n'est jamais du bruit : la photo déplacée reste visible", () => {
    expect(cities([photo("Sienne"), photo("Pise", { locationSource: "manual" }), photo("Sienne")])).toEqual(["Sienne:1", "Pise:1", "Sienne:1"]);
    expect(cities([photo("Sienne"), photo("Pise", { locationSource: "game" }), photo("Sienne")])).toEqual(["Sienne:1", "Pise:1", "Sienne:1"]);
  });

  it("deux photos d'une autre ville ne sont pas du bruit", () => {
    expect(cities([photo("Sienne"), photo("Pise"), photo("Pise"), photo("Sienne")])).toEqual(["Sienne:1", "Pise:2", "Sienne:1"]);
  });

  it("une photo isolée entre deux villes différentes reste une sous-étape", () => {
    expect(cities([photo("Sienne"), photo("Pise"), photo("Lucques")])).toEqual(["Sienne:1", "Pise:1", "Lucques:1"]);
  });

  it("une photo sans lieu rejoint la précédente, ou la suivante si elle ouvre l'étape", () => {
    expect(cities([photo(null), photo("Sienne"), photo(null), photo("Sienne"), photo("Pise"), photo(null)])).toEqual(["Sienne:4", "Pise:2"]);
  });

  it("aucune photo localisée : un seul groupe sans nom", () => {
    expect(cities([photo(null), photo(null)])).toEqual(["null:2"]);
  });

  it("les photos restent dans l'ordre, sans perte ni doublon", () => {
    const media = [photo("A"), photo("B"), photo("A"), photo(null), photo("C"), photo("C"), photo("B")];
    expect(subStops(media).flatMap((s) => s.media)).toEqual(media);
  });

  it("des clés stables et uniques", () => {
    const keys = subStops([photo("Sienne"), photo("Pise"), photo("Pise"), photo("Sienne")]).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("modifiable dès qu'une photo n'a pas de GPS d'origine", () => {
    const [gps, manual, game, none] = [photo("Sienne"), photo("Sienne", { locationSource: "manual" }), photo("Sienne", { locationSource: "game" }), photo(null)];
    expect(subStops([gps, photo("Sienne", { locationSource: "phone" })])[0].editable).toBe(false);
    expect(subStops([gps, manual])[0].editable).toBe(true);
    expect(subStops([gps, game])[0].editable).toBe(true);
    expect(subStops([gps, none])[0].editable).toBe(true);
  });
});

describe("canRelocate", () => {
  it("comme la tour : jamais un GPS d'origine", () => {
    expect(canRelocate(photo("Sienne"))).toBe(false);
    expect(canRelocate(photo("Sienne", { locationSource: "phone" }))).toBe(false);
    expect(canRelocate(photo("Sienne", { locationSource: "manual" }))).toBe(true);
    expect(canRelocate(photo("Sienne", { locationSource: "game" }))).toBe(true);
    expect(canRelocate(photo(null))).toBe(true);
  });
});
