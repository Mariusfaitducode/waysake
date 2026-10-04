import { useEffect, useState } from "react";
import { api, type PlaceHit } from "../api.js";
import { countryName, hitName } from "../format.js";
import { t } from "../i18n/index.js";
import { rich } from "../i18n/rich.js";
import { Sheet } from "./Sheet.js";
import { IconPin } from "../shell/icons.js";
import "./PlacePicker.css";

/** Choisir un lieu (recherche hors ligne sur la tour) pour un groupe de photos, puis confirmer. */
export function PlacePicker({ photos, preview, onDone, onClose }: { photos: number[]; preview?: string; onDone: (place: PlaceHit, updated: number) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [chosen, setChosen] = useState<PlaceHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const timer = setTimeout(() => api.places(q).then(setHits, () => setHits([])), 150);
    return () => clearTimeout(timer);
  }, [q]);

  async function save(e: React.MouseEvent) {
    if (!chosen) return;
    const dialog = (e.currentTarget as HTMLElement).closest("dialog");
    setBusy(true);
    try {
      const { updated } = await api.locate(photos, chosen.lat, chosen.lon);
      onDone(chosen, updated);
      dialog?.close();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const where = chosen && `${chosen.flag} ${hitName(chosen)}${chosen.kind !== "country" ? `, ${countryName(chosen.countryCode, chosen.country)}` : ""}`;

  return (
    <Sheet title={t("place.title")} onClose={onClose}>
      {preview && <img className="picker-preview" src={preview} alt="" />}
      {!chosen ? (
        <>
          <input className="field" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("place.placeholder")} autoComplete="off" aria-label={t("place.search")} />
          <ul className="place-hits">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.name}-${h.lat}`}>
                <button onClick={() => setChosen(h)}>
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
        <div className="place-confirm">
          <p>{rich(t("place.confirm", { photos: t("count.photos", { count: photos.length }), place: where! }))}</p>
          <p className="sheet__meta">{t("place.confirm.hint")}</p>
          {error && <p role="alert" className="prompt__error">{error}</p>}
          <div className="prompt__actions">
            <button className="button button--quiet" onClick={() => setChosen(null)} disabled={busy}>
              {t("place.change")}
            </button>
            <button className="button" onClick={save} disabled={busy}>
              {busy ? "…" : t("place.save")}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
