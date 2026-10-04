import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type PlaceHit, type Wish } from "../api.js";
import { useApi, useAuthorName, useDataVersion } from "../data.js";
import { countryName, hitName, wishMonth } from "../format.js";
import { t } from "../i18n/index.js";
import { autoName, placeTitle } from "../i18n/places.js";
import { Header } from "../components/Header.js";
import { ActionSheet, Sheet } from "../components/Sheet.js";
import { TripColorDot } from "../components/TripColor.js";
import { IconChart, IconCheck, IconPin, IconPlus } from "../shell/icons.js";
import { tripColorProps, type TripColorId } from "../trip-colors.js";
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

  // Couleur de chaque voyage, pour la pastille des souvenirs et des envies réalisées.
  const colors = new Map<string, TripColorId>((trips ?? []).map((trip) => [trip.slug, trip.color]));
  const todo = wishes?.filter((w) => !w.done) ?? [];
  const done = wishes?.filter((w) => w.done) ?? [];

  return (
    <div className="notebook">
      <Header title={t("notebook.title")} subtitle={t("notebook.subtitle")} />

      <section className="notebook__section" aria-labelledby="wishes-title">
        <div className="notebook__head">
          <h2 id="wishes-title">{t("notebook.wishes")}</h2>
          <button className="button button--small" onClick={() => setAdding(true)} aria-label={t("notebook.addWish")}>
            <IconPlus /> {t("notebook.add")}
          </button>
        </div>
        {wishes && todo.length === 0 && (
          <p className="notebook__empty">{t("notebook.wishes.empty")}</p>
        )}
        <ul className="wishes">
          {todo.map((w) => (
            <WishRow key={w.id} wish={w} onToggle={() => setCompleting(w)} onOpen={() => setEditing(w)} />
          ))}
        </ul>
        {done.length > 0 && (
          <>
            <h3 className="notebook__sub">{t("notebook.done")}</h3>
            <ul className="wishes">
              {done.map((w) => (
                <WishRow key={w.id} wish={w} color={w.doneTrip ? colors.get(w.doneTrip.slug) : undefined} onToggle={() => api.updateWish(w.id, { done: false }).then(bump)} onOpen={() => setEditing(w)} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="notebook__section" aria-labelledby="notes-title">
        <div className="notebook__head">
          <h2 id="notes-title">{t("notebook.memories")}</h2>
        </div>
        {notes && notes.length === 0 && <p className="notebook__empty">{t("notebook.memories.empty")}</p>}
        <ul className="memories">
          {notes?.map((n) => (
            <li key={`${n.trip.slug}-${n.chapterId}`}>
              <Link to={`/v/${n.trip.slug}`} className="memory" {...(colors.has(n.trip.slug) ? tripColorProps(colors.get(n.trip.slug)) : {})}>
                {n.trip.cover && <img className="memory__cover" src={n.trip.cover} alt="" loading="lazy" />}
                <div className="memory__text">
                  <p className="memory__where">
                    {colors.has(n.trip.slug) && <TripColorDot color={colors.get(n.trip.slug)} />}
                    <span>
                      {placeTitle(n.trip.title)}
                      {n.chapterTitle && <span className="memory__chapter"> · {placeTitle(n.chapterTitle)}</span>}
                    </span>
                  </p>
                  <blockquote className="memory__body">{n.body}</blockquote>
                  <p className="memory__who">{authorName(n.author)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link to="/stats" className="notebook__household">
        <IconChart /> {t("household.link")}
      </Link>

      {adding && <WishSheet onClose={() => setAdding(false)} onSaved={bump} />}
      {editing && <WishSheet wish={editing} onClose={() => setEditing(null)} onSaved={bump} />}
      {completing && (
        <ActionSheet
          title={t("notebook.completed", { title: completing.title })}
          actions={[
            ...(trips ?? []).slice(0, 5).map((trip) => ({
              label: autoName(trip),
              hint: t("notebook.linkTrip"),
              onSelect: () => api.updateWish(completing.id, { doneTripSlug: trip.slug }).then(bump),
            })),
            { label: t("notebook.noTrip"), onSelect: () => api.updateWish(completing.id, { done: true }).then(bump) },
          ]}
          onClose={() => setCompleting(null)}
        />
      )}
    </div>
  );
}

function WishRow({ wish, color, onToggle, onOpen }: { wish: Wish; color?: TripColorId; onToggle: () => void; onOpen: () => void }) {
  const meta = [wish.month && wishMonth(wish.month), wish.note].filter(Boolean).join(" · ");
  return (
    <li className={`wish${wish.done ? " is-done" : ""}`}>
      <button className="wish__check" onClick={onToggle} aria-label={wish.done ? t("notebook.markTodo", { title: wish.title }) : t("notebook.markDone", { title: wish.title })} aria-pressed={wish.done}>
        {wish.done && <IconCheck />}
      </button>
      <button className="wish__main" onClick={onOpen}>
        <span className="wish__title">
          {wish.flag && <span className="wish__flag" aria-hidden="true">{wish.flag}</span>}
          {wish.title}
        </span>
        {wish.doneTrip && (
          <span className="wish__trip">
            {color && <TripColorDot color={color} size={8} />}
            {placeTitle(wish.doneTrip.title)}
          </span>
        )}
        {meta && <span className="wish__meta">{meta}</span>}
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
    const timer = setTimeout(() => api.places(query).then(setHits, () => setHits([])), 150);
    return () => clearTimeout(timer);
  }, [query, place, wish?.title]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const title = (place ? hitName(place) : query).trim();
    if (!title) return setError(t("api.wish_title_required"));
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
    <Sheet title={wish ? wish.title : t("notebook.newWish")} onClose={onClose}>
      <form className="wish-form" onSubmit={save}>
        <label className="wish-form__label">
          {t("notebook.destination")}
          <input
            className="field"
            autoFocus={!wish}
            value={place ? `${place.flag} ${hitName(place)}` : query}
            onChange={(e) => {
              setPlace(null);
              setQuery(e.target.value);
            }}
            placeholder={t("notebook.destination.placeholder")}
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
                    {hitName(h)}
                    {h.kind !== "country" && <small>{countryName(h.countryCode, h.country)}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="wish-form__label">
          {t("notebook.when")} <small>{t("notebook.optional")}</small>
          <input className="field" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="wish-form__label">
          {t("notebook.note")} <small>{t("notebook.optional")}</small>
          <textarea className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notebook.note.placeholder")} />
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
              {t("notebook.delete")}
            </button>
          )}
          <button className="button">{wish ? t("common.save") : t("notebook.add")}</button>
        </div>
      </form>
    </Sheet>
  );
}
