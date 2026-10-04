import { useEffect, useState } from "react";
import { api, type PlaceHit } from "../api.js";
import { countryName, hitName } from "../format.js";
import { t } from "../i18n/index.js";
import { rich } from "../i18n/rich.js";
import { Sheet } from "./Sheet.js";
import { PinMap } from "./PinMap.js";
import { IconBack, IconPin } from "../shell/icons.js";
import "./PlacePicker.css";

type Spot = { lat: number; lon: number; name: string | null; country: string | null; countryCode: string | null; flag: string | null };
const LAST = "waysake.lastPlace";
const EUROPE: [number, number] = [12, 46];
const remember = (s: Spot) => {
  try {
    localStorage.setItem(LAST, JSON.stringify({ lat: s.lat, lon: s.lon }));
  } catch {}
};
const lastPlace = (): [number, number] | null => {
  try {
    const p = JSON.parse(localStorage.getItem(LAST) ?? "null") as { lat: number; lon: number } | null;
    return p && Number.isFinite(p.lat) ? [p.lon, p.lat] : null;
  } catch {
    return null;
  }
};

/**
 * Choisir le lieu d'un groupe de photos : on les regarde en grand (on passe de l'une à l'autre), on cherche un nom
 * (hors ligne, sur la tour) ou on pointe directement sur la carte — les petits villages y sont tous. L'épingle se
 * pose d'un tap et se fait glisser jusqu'au bon endroit : c'est ce qui trace des itinéraires précis.
 */
export function PlacePicker({ photos, preview, previews, onDone, onClose }: { photos: number[]; preview?: string; previews?: string[]; onDone: (place: PlaceHit, updated: number) => void; onClose: () => void }) {
  const images = previews?.length ? previews : preview ? [preview] : [];
  const [shown, setShown] = useState(0);
  const [mode, setMode] = useState<"search" | "map">("search");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>(() => {
    const last = lastPlace();
    return last ? { center: last, zoom: 9 } : { center: EUROPE, zoom: 4 };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const timer = setTimeout(() => api.places(q).then(setHits, () => setHits([])), 150);
    return () => clearTimeout(timer);
  }, [q]);

  /** Une épingle posée ou déplacée : on retrouve le lieu le plus proche pour le nommer. */
  function pin(lat: number, lon: number) {
    setSpot({ lat, lon, name: null, country: null, countryCode: null, flag: null });
    api.reversePlace(lat, lon).then(
      (r) => setSpot((s) => (s && s.lat === lat && s.lon === lon ? r : s)),
      () => {},
    );
  }

  function choose(h: PlaceHit) {
    setSpot({ lat: h.lat, lon: h.lon, name: hitName(h), country: h.country, countryCode: h.countryCode, flag: h.flag });
    setView({ center: [h.lon, h.lat], zoom: h.kind === "place" ? 12 : h.kind === "region" ? 8 : 5 });
    setMode("map");
  }

  async function save(e: React.MouseEvent) {
    if (!spot) return;
    const dialog = (e.currentTarget as HTMLElement).closest("dialog");
    setBusy(true);
    try {
      const { updated } = await api.locate(photos, spot.lat, spot.lon);
      remember(spot);
      onDone(
        { kind: "place", name: spot.name ?? t("place.unnamed"), country: spot.country ?? "", countryCode: spot.countryCode ?? "", lat: spot.lat, lon: spot.lon, flag: spot.flag ?? "" },
        updated,
      );
      dialog?.close();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const where = spot?.name
    ? `${spot.flag ? `${spot.flag} ` : ""}${spot.name}${spot.countryCode ? `, ${countryName(spot.countryCode, spot.country ?? spot.countryCode)}` : ""}`
    : t("place.unnamed");

  return (
    <Sheet title={t("place.title")} onClose={onClose}>
      {images.length > 0 && (
        <figure className={`picker-photo${mode === "map" ? " is-small" : ""}`}>
          <img key={images[shown]} src={images[shown]} alt="" />
          {images.length > 1 && (
            <>
              <button className="picker-photo__nav picker-photo__nav--prev" onClick={() => setShown((i) => (i - 1 + images.length) % images.length)} aria-label={t("viewer.prev")}>
                <IconBack />
              </button>
              <button className="picker-photo__nav picker-photo__nav--next" onClick={() => setShown((i) => (i + 1) % images.length)} aria-label={t("viewer.next")}>
                <IconBack />
              </button>
              <figcaption>{t("place.photoOf", { n: shown + 1, total: images.length })}</figcaption>
            </>
          )}
        </figure>
      )}

      <div className="picker-tabs" role="tablist">
        <button role="tab" aria-selected={mode === "search"} onClick={() => setMode("search")}>
          {t("place.search")}
        </button>
        <button role="tab" aria-selected={mode === "map"} onClick={() => setMode("map")}>
          {t("place.onMap")}
        </button>
      </div>

      {mode === "search" ? (
        <>
          <input className="field" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("place.placeholder")} autoComplete="off" aria-label={t("place.search")} />
          <ul className="place-hits">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.name}-${h.lat}`}>
                <button onClick={() => choose(h)}>
                  <IconPin />
                  <span>
                    <span aria-hidden="true">{h.flag} </span>
                    {hitName(h)}
                    {h.kind !== "country" && <small>{countryName(h.countryCode, h.country)}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {q.trim().length >= 2 && hits.length === 0 && <p className="sheet__meta">{t("place.none")}</p>}
        </>
      ) : (
        <div className="place-map">
          <PinMap pin={spot} center={view.center} zoom={view.zoom} onPick={pin} />
          <p className="place-map__text">
            {spot ? rich(t("place.here", { photos: t("count.photos", { count: photos.length }), place: where })) : t("place.mapHint")}
          </p>
          {spot && <p className="sheet__meta">{t("place.confirm.hint")}</p>}
          {error && <p role="alert" className="prompt__error">{error}</p>}
          <div className="prompt__actions">
            <button className="button" onClick={save} disabled={!spot || busy}>
              {busy ? "…" : t("place.save")}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
