import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type PlaceHit, type Wish } from "../api.js";
import { useApi, useAuthorName, useDataVersion } from "../data.js";
import { wishMonth } from "../format.js";
import { Header } from "../components/Header.js";
import { ActionSheet, Sheet } from "../components/Sheet.js";
import { IconCheck, IconPin, IconPlus } from "../shell/icons.js";
import "./Notebook.css";

export function Notebook() {
  const { data: wishes } = useApi(api.wishes);
  const { data: notes } = useApi(api.notes);
  const { data: trips } = useApi(api.trips);
  const { bump } = useDataVersion();
  const authorName = useAuthorName();
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState<Wish | null>(null);
  const [editing, setEditing] = useState<Wish | null>(null);

  const todo = wishes?.filter((w) => !w.done) ?? [];
  const done = wishes?.filter((w) => w.done) ?? [];

  return (
    <div className="notebook">
      <Header title="Carnet" subtitle="Vos envies de voyage et vos souvenirs écrits." />

      <section className="notebook__section" aria-labelledby="wishes-title">
        <div className="notebook__head">
          <h2 id="wishes-title">Prochains voyages</h2>
          <button className="button button--small" onClick={() => setAdding(true)} aria-label="Ajouter une envie">
            <IconPlus /> Ajouter
          </button>
        </div>
        {wishes && todo.length === 0 && (
          <p className="notebook__empty">Où rêvez-vous d'aller ? Ajoutez une destination : elle apparaîtra sur le globe, en anneau jaune.</p>
        )}
        <ul className="wishes">
          {todo.map((w) => (
            <WishRow key={w.id} wish={w} onToggle={() => setCompleting(w)} onOpen={() => setEditing(w)} />
          ))}
        </ul>
        {done.length > 0 && (
          <>
            <h3 className="notebook__sub">Réalisées</h3>
            <ul className="wishes">
              {done.map((w) => (
                <WishRow key={w.id} wish={w} onToggle={() => api.updateWish(w.id, { done: false }).then(bump)} onOpen={() => setEditing(w)} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="notebook__section" aria-labelledby="notes-title">
        <div className="notebook__head">
          <h2 id="notes-title">Souvenirs</h2>
        </div>
        {notes && notes.length === 0 && <p className="notebook__empty">Les souvenirs s'écrivent dans chaque voyage, sous la carte ou à la fin d'une étape. Ils se retrouvent tous ici.</p>}
        <ul className="memories">
          {notes?.map((n) => (
            <li key={`${n.trip.slug}-${n.chapterId}`}>
              <Link to={`/v/${n.trip.slug}`} className="memory">
                {n.trip.cover && <img src={n.trip.cover} alt="" loading="lazy" />}
                <div>
                  <p className="memory__where">
                    {n.trip.title}
                    {n.chapterTitle && <span>, {n.chapterTitle}</span>}
                  </p>
                  <p className="memory__body">{n.body}</p>
                  <p className="memory__who">{authorName(n.author)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {adding && <WishSheet onClose={() => setAdding(false)} onSaved={bump} />}
      {editing && <WishSheet wish={editing} onClose={() => setEditing(null)} onSaved={bump} />}
      {completing && (
        <ActionSheet
          title={`${completing.title} : c'est fait !`}
          actions={[
            ...(trips ?? []).slice(0, 5).map((t) => ({
              label: t.title,
              hint: "Relier à ce voyage",
              onSelect: () => api.updateWish(completing.id, { doneTripSlug: t.slug }).then(bump),
            })),
            { label: "Sans voyage relié", onSelect: () => api.updateWish(completing.id, { done: true }).then(bump) },
          ]}
          onClose={() => setCompleting(null)}
        />
      )}
    </div>
  );
}

function WishRow({ wish, onToggle, onOpen }: { wish: Wish; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className={`wish${wish.done ? " is-done" : ""}`}>
      <button className="wish__check" onClick={onToggle} aria-label={wish.done ? `Marquer ${wish.title} comme à faire` : `Marquer ${wish.title} comme réalisée`} aria-pressed={wish.done}>
        {wish.done && <IconCheck />}
      </button>
      <button className="wish__main" onClick={onOpen}>
        <span className="wish__title">
          {wish.flag && <span className="wish__flag" aria-hidden="true">{wish.flag}</span>}
          {wish.title}
        </span>
        <span className="wish__meta">
          {[wish.month && wishMonth(wish.month), wish.doneTrip?.title, wish.note].filter(Boolean).join(". ")}
        </span>
      </button>
    </li>
  );
}

function WishSheet({ wish, onClose, onSaved }: { wish?: Wish; onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState(wish?.title ?? "");
  const [place, setPlace] = useState<PlaceHit | null>(null);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [month, setMonth] = useState(wish?.month ?? "");
  const [note, setNote] = useState(wish?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (place || query.trim().length < 2 || query === wish?.title) return setHits([]);
    const t = setTimeout(() => api.places(query).then(setHits, () => setHits([])), 150);
    return () => clearTimeout(t);
  }, [query, place, wish?.title]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const title = (place?.name ?? query).trim();
    if (!title) return setError("Donne un nom à cette envie.");
    const body = {
      title,
      month: month || null,
      note,
      ...(place ? { countryCode: place.countryCode, lat: place.lat, lon: place.lon } : {}),
    };
    try {
      if (wish) await api.updateWish(wish.id, body);
      else await api.addWish(body);
      onSaved();
      (e.target as HTMLElement).closest("dialog")?.close();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Sheet title={wish ? wish.title : "Nouvelle envie"} onClose={onClose}>
      <form className="wish-form" onSubmit={save}>
        <label className="wish-form__label">
          Destination
          <input
            className="field"
            autoFocus={!wish}
            value={place ? `${place.flag} ${place.name}` : query}
            onChange={(e) => {
              setPlace(null);
              setQuery(e.target.value);
            }}
            placeholder="Lisbonne, Japon, Islande…"
            autoComplete="off"
          />
        </label>
        {hits.length > 0 && (
          <ul className="wish-form__hits" role="listbox">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.name}-${h.lat}`}>
                <button type="button" onClick={() => setPlace(h)}>
                  <IconPin />
                  <span>
                    <span className="wish__flag" aria-hidden="true">{h.flag}</span>
                    {h.name}
                    {h.kind !== "country" && <small>{h.country}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="wish-form__label">
          Quand ? <small>facultatif</small>
          <input className="field" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="wish-form__label">
          Une note <small>facultatif</small>
          <textarea className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce qu'on veut y faire, une adresse, une idée…" />
        </label>
        {error && <p role="alert" className="prompt__error">{error}</p>}
        <div className="prompt__actions">
          {wish && (
            <button
              type="button"
              className="button button--danger"
              onClick={async (e) => {
                const dialog = e.currentTarget.closest("dialog");
                await api.deleteWish(wish.id);
                onSaved();
                dialog?.close();
              }}
            >
              Supprimer
            </button>
          )}
          <button className="button">{wish ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </form>
    </Sheet>
  );
}
