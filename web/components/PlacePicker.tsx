import { useEffect, useState } from "react";
import { api, type PlaceHit } from "../api.js";
import { count } from "../format.js";
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
    const t = setTimeout(() => api.places(q).then(setHits, () => setHits([])), 150);
    return () => clearTimeout(t);
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

  return (
    <Sheet title="Où étiez-vous ?" onClose={onClose}>
      {preview && <img className="picker-preview" src={preview} alt="" />}
      {!chosen ? (
        <>
          <input className="field" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bled, Split, Lac de Braies…" autoComplete="off" />
          <ul className="place-hits">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.name}-${h.lat}`}>
                <button onClick={() => setChosen(h)}>
                  <IconPin />
                  <span>
                    <span aria-hidden="true">{h.flag} </span>
                    {h.name}
                    {h.kind !== "country" && <small>{h.country}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {q.trim().length >= 2 && hits.length === 0 && <p className="sheet__meta">Aucun lieu trouvé. Essaie la ville la plus proche.</p>}
        </>
      ) : (
        <div className="place-confirm">
          <p>
            Localiser <strong>{count(photos.length, "photo", "photos")}</strong> à{" "}
            <strong>
              {chosen.flag} {chosen.name}
            </strong>
            {chosen.kind !== "country" && `, ${chosen.country}`} ?
          </p>
          <p className="sheet__meta">Les voyages, les étapes et l'itinéraire se mettront à jour tout seuls.</p>
          {error && <p role="alert" className="prompt__error">{error}</p>}
          <div className="prompt__actions">
            <button className="button button--quiet" onClick={() => setChosen(null)} disabled={busy}>
              Changer
            </button>
            <button className="button" onClick={save} disabled={busy}>
              {busy ? "…" : "Valider"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
