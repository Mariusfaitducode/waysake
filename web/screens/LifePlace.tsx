import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type Media } from "../api.js";
import { useApi, useDataVersion } from "../data.js";
import { dateRange, monthRange, number, scrollBehavior, yearRange } from "../format.js";
import { t } from "../i18n/index.js";
import { autoName } from "../i18n/places.js";
import { PhotoGrid } from "../components/PhotoGrid.js";
import { Viewer } from "../components/Viewer.js";
import { ActionSheet, PromptSheet, Sheet, type Action } from "../components/Sheet.js";
import { EmptyState } from "../components/EmptyState.js";
import { IconBack, IconMore } from "../shell/icons.js";
import { NEUTRAL_TRIP_COLOR } from "../../server/trip-palette.js";
import { tripColorProps } from "../trip-colors.js";
import "./Trip.css";
import "./LifePlace.css";

type Overlay = { kind: "menu" } | { kind: "rename" } | { kind: "cover-help" } | { kind: "reject" } | { kind: "error"; message: string };

/**
 * Page d'un lieu de vie (Horizon) : même couverture que la page d'un voyage (« la photo d'abord »), le nom, une
 * frise des périodes (des points, comme les étapes d'un voyage), puis les photos par période, la plus récente
 * d'abord. Un lieu n'a pas de couleur de voyage : la page reste neutre (Ardoise).
 */
export function LifePlaceScreen() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const { data: place, error, loading } = useApi(() => api.placeOfLife(slug), [slug]);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const periodRefs = useRef<(HTMLElement | null)[]>([]);

  const flat = useMemo(() => place?.periods.flatMap((p) => p.media) ?? [], [place]);
  const title = place ? autoName(place) : "";
  useEffect(() => {
    if (title) document.title = `${title} — Waysake`;
    return () => {
      document.title = "Waysake";
    };
  }, [title]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if ((!place && error) || place?.status === "rejected")
    return (
      <EmptyState title={t("place.notFound.title")} text={t("place.notFound.text")}>
        <Link className="button" to="/voyages">
          {t("place.notFound.action")}
        </Link>
      </EmptyState>
    );
  if (!place) return loading ? <div className="trip-cover trip-cover--loading skeleton" /> : null;

  const back = () => (history.length > 1 ? navigate(-1) : navigate("/voyages"));
  const goToPeriod = (i: number) => periodRefs.current[i]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  const periods = place.periods;
  // Frise sous le titre : de la plus ancienne à la plus récente (le dernier point, plein, est la période la plus récente).
  const chronological = periods.map((p, i) => ({ p, i })).reverse();
  const fail = (e: Error) => setOverlay({ kind: "error", message: e.message });
  const reject = () =>
    api
      .updatePlaceOfLife(place.slug, { status: "rejected" })
      .then(() => {
        navigate("/voyages", { replace: true });
        bump();
      })
      .catch(fail);

  const actions: Action[] = [
    { label: t("place.rename"), onSelect: () => setOverlay({ kind: "rename" }) },
    { label: t("trip.changeCover"), hint: t("trip.changeCover.hint"), onSelect: () => setOverlay({ kind: "cover-help" }) },
    { label: t("place.reject"), hint: t("place.reject.hint"), danger: true, onSelect: () => setOverlay({ kind: "reject" }) },
  ];

  return (
    <article className="trip place" {...tripColorProps(NEUTRAL_TRIP_COLOR)}>
      <header className="trip-cover">
        <div className="trip-cover__photo">
          {place.coverLarge && <img className="trip-cover__img" src={place.coverLarge} alt="" />}
          <div className="trip-cover__veil" aria-hidden="true" />
          <div className="trip-cover__bar">
            <button className="icon-button icon-button--glass" onClick={back} aria-label={t("common.back")}>
              <IconBack />
            </button>
            <span className="trip-cover__spacer" />
            <button className="icon-button icon-button--glass" onClick={() => setOverlay({ kind: "menu" })} aria-label={t("place.options")}>
              <IconMore />
            </button>
          </div>
        </div>
        <div className="trip-cover__text">
          <h1 className="title trip-cover__title">
            <button className="place__title" onClick={() => setOverlay({ kind: "rename" })} title={t("place.rename")}>
              {title}
            </button>
          </h1>
          <p className="trip-cover__meta">
            {[place.startAt !== null && place.endAt !== null && yearRange(place.startAt, place.endAt), t("place.kind")].filter(Boolean).join(" · ")}
          </p>
          <p className="trip-cover__figures">
            <b>{number(periods.length)}</b> {t("place.figure.periods", { count: periods.length })} · <b>{number(place.mediaCount)}</b>{" "}
            {t("stats.photos", { count: place.mediaCount })}
          </p>
          {periods.length > 1 && (
            <ol className={`trip-route${periods.length > 5 ? " trip-route--many" : ""}`} aria-label={t("place.periods")}>
              {chronological.map(({ p, i }) => (
                <li key={p.startAt}>
                  <button onClick={() => goToPeriod(i)} aria-label={monthRange(p.startAt, p.endAt)}>
                    <i aria-hidden="true" />
                    <span>{monthRange(p.startAt, p.endAt)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </header>

      <div className="trip__body">
        <div className="trip__backdrop" aria-hidden="true">
          {place.cover && <img src={place.cover} alt="" />}
        </div>

        {periods.length > 1 && (
          <section className="trip__route place__route" aria-label={t("place.periods")}>
            <ol className={`trip-steps place__steps${periods.length > 8 ? " place__steps--long" : ""}`}>
              {periods.map((p, i) => (
                <li key={p.startAt}>
                  <button onClick={() => goToPeriod(i)}>
                    <b>{monthRange(p.startAt, p.endAt)}</b>
                    <small>{t("count.photos", { count: p.count })}</small>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {periods.map((p, i) => (
          <section key={p.startAt} className="chapter" ref={(el) => void (periodRefs.current[i] = el)} aria-labelledby={`p-${p.startAt}`}>
            <div className="chapter__head">
              <div className="chapter__titles">
                <h2 id={`p-${p.startAt}`} className="chapter__title">
                  {monthRange(p.startAt, p.endAt)}
                </h2>
                <p className="chapter__meta">{[dateRange(p.startAt, p.endAt), t("count.photos", { count: p.count })].join(" · ")}</p>
              </div>
            </div>
            <PhotoGrid items={p.media} onOpen={(m) => setViewer(flat.indexOf(m))} />
          </section>
        ))}
      </div>

      {viewer !== null && (
        <Viewer
          items={flat}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          action={{ label: t("trip.useAsCover"), run: (m: Media) => api.updatePlaceOfLife(place.slug, { coverMediaId: m.id }).then(bump) }}
        />
      )}

      {overlay?.kind === "menu" && <ActionSheet title={title} actions={actions} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "rename" && (
        <PromptSheet
          title={t("place.rename")}
          initial={place.title}
          placeholder={place.autoTitle}
          hint={t("place.rename.hint", { auto: place.autoTitle })}
          onSubmit={(v) => api.updatePlaceOfLife(place.slug, { title: v.trim() || null }).then(bump)}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "cover-help" && (
        <ActionSheet
          title={t("trip.chooseCover")}
          actions={[{ label: t("trip.openFirst"), hint: t("trip.openFirst.hint"), onSelect: () => setViewer(0) }]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "reject" && (
        <ActionSheet
          title={t("place.reject.confirm", { title })}
          actions={[{ label: t("place.reject.confirm.action"), hint: t("place.reject.confirm.hint"), danger: true, onSelect: reject }]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "error" && (
        <Sheet onClose={() => setOverlay(null)}>
          <p role="alert" className="place__error">
            {overlay.message}
          </p>
        </Sheet>
      )}
    </article>
  );
}
