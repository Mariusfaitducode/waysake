import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type ImportMedia, type Proposal, type ProposedTrip } from "../api.js";
import { useApi, useDataVersion } from "../data.js";
import { dateRange, flags } from "../format.js";
import { t } from "../i18n/index.js";
import { placeName, placeTitle } from "../i18n/places.js";
import { PhotoGrid } from "../components/PhotoGrid.js";
import { TripMap } from "../components/TripMap.js";
import { ActionSheet } from "../components/Sheet.js";
import { EmptyState } from "../components/EmptyState.js";
import { TripColorDot, TripColorTag } from "../components/TripColor.js";
import { IconBack } from "../shell/icons.js";
import { safeTripColor, tripColorProps, type TripColorId } from "../trip-colors.js";
import "./ImportReview.css";

/** L'écran où l'humain valide le tri proposé par Waysake. Identique sur l'app, l'ordinateur et Safari. */
export function ImportReview() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const [p, setP] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Les voyages existants : leur couleur (pastille des voyages complétés).
  const { data: trips } = useApi(api.trips);
  const colors = new Map<string, TripColorId>((trips ?? []).map((trip) => [trip.slug, trip.color]));

  const load = () => api.importProposal(id).then(setP, (e: Error) => setError(e.message));
  useEffect(() => {
    load();
    // Pendant qu'un téléphone envoie encore, la proposition s'enrichit toute seule.
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Décocher/recocher : réponse immédiate à l'écran, puis enregistrement.
  async function toggle(m: ImportMedia) {
    setP((cur) => cur && flip(cur, m.id));
    await api.updateImport(id, m.excluded ? { include: [m.id] } : { exclude: [m.id] });
    load();
  }

  async function confirm() {
    setBusy(true);
    try {
      const { trips } = await api.confirmImport(id);
      bump();
      navigate(trips[0] ? `/v/${trips[0]}` : "/voyages", { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (error && !p) return <EmptyState title={t("review.notFound")} text={error} />;
  if (!p) return <div className="review"><div className="skeleton review__skeleton" /></div>;
  if (p.status !== "pending")
    return (
      <EmptyState
        title={p.status === "confirmed" ? t("review.confirmed.title") : t("review.cancelled.title")}
        text={p.status === "confirmed" ? t("review.confirmed.text") : t("review.cancelled.text")}
      >
        <Link className="button" to="/voyages">{t("review.seeTrips")}</Link>
      </EmptyState>
    );

  const nothing = p.counts.received === 0;
  return (
    <div className="review">
      <header className="review__head">
        <Link to="/" className="back-link"><IconBack /> Waysake</Link>
        <h1 className="review__title">{nothing ? t("review.waiting") : t("review.found")}</h1>
        <p className="review__lead">
          {nothing
            ? t("review.waiting.text")
            : `${t("review.analyzed", { count: p.counts.received })}${p.counts.duplicates ? t("review.duplicates", { count: p.counts.duplicates }) : ""}${t("review.instructions")}`}
        </p>
      </header>

      {p.newTrips.map((trip) => (
        <ProposedTripCard key={`${trip.title}-${trip.startAt}`} trip={trip} onToggle={toggle} />
      ))}

      {p.extendedTrips.length > 0 && (
        <section className="review__block">
          <h2 className="review__h2">{t("review.extended")}</h2>
          <ul className="review__list">
            {p.extendedTrips.map((e) => (
              <li key={e.slug}>
                <strong>
                  {colors.has(e.slug) && <TripColorDot color={colors.get(e.slug)} />}
                  {placeTitle(e.title)}
                </strong>
                <span>+ {t("count.photos", { count: e.added })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.otherPhotos.length > 0 && (
        <section className="review__block">
          <Group title={t("review.other", { count: p.otherPhotos.length })} hint={t("review.other.hint")} items={p.otherPhotos} onToggle={toggle} />
        </section>
      )}

      {(p.setAside.screenshots.length > 0 || p.setAside.home.length > 0) && (
        <section className="review__block">
          <h2 className="review__h2">{t("review.setAside")}</h2>
          <p className="review__hint">{t("review.setAside.hint")}</p>
          {p.setAside.home.length > 0 && (
            <div className="review__aside">
              <label className="switch">
                <span>
                  <strong>{t("review.home", { count: p.setAside.home.length })}</strong>
                  <small>{t("review.home.hint")}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={p.keepHome}
                  onChange={async (e) => {
                    await api.updateImport(id, { keepHome: e.target.checked });
                    load();
                  }}
                />
              </label>
            </div>
          )}
          {p.setAside.screenshots.length > 0 && (
            <Group
              title={t("review.screenshots", { count: p.setAside.screenshots.length })}
              hint={t("review.screenshots.hint")}
              items={p.setAside.screenshots}
              onToggle={toggle}
              collapsed
            />
          )}
        </section>
      )}

      {!nothing && (
        <div className="review__bar">
          <div className="review__bar-inner">
            <button className="button button--quiet" onClick={() => setConfirmCancel(true)} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button className="button review__go" onClick={confirm} disabled={busy || p.counts.toImport === 0}>
              {busy ? t("review.importing") : t("review.import", { count: p.counts.toImport })}
            </button>
          </div>
        </div>
      )}

      {confirmCancel && (
        <ActionSheet
          title={t("review.cancel.title")}
          actions={[
            {
              label: t("review.cancel"),
              hint: t("review.cancel.hint"),
              danger: true,
              onSelect: () => api.cancelImport(id).then(() => navigate("/", { replace: true })),
            },
          ]}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}

/** Le voyage proposé, en carte Horizon : couverture à flou progressif, page teintée de la couleur proposée. */
function ProposedTripCard({ trip, onToggle }: { trip: ProposedTrip; onToggle: (m: ImportMedia) => void }) {
  const [open, setOpen] = useState(false);
  // Calculée par la tour sur la couverture (une tour plus ancienne ne l'envoie pas : pas de teinte).
  const color = trip.color ? safeTripColor(trip.color) : null;
  return (
    <section className={`proposed${color ? " has-color" : ""}`} {...(color ? tripColorProps(color) : {})}>
      <div className="proposed__hero">
        {trip.coverLarge && <img src={trip.coverLarge} alt="" />}
        <div className="proposed__blur" aria-hidden="true" />
        <div className="proposed__fade" aria-hidden="true" />
        <span className="proposed__badge">{t("review.newTrip")}</span>
        <div className="proposed__text">
          <span aria-hidden="true" className="proposed__flags">{flags(trip.countryCodes)}</span>
          <h2 className="proposed__title">{placeTitle(trip.title)}</h2>
          <p className="proposed__dates">{dateRange(trip.startAt, trip.endAt)}</p>
        </div>
      </div>
      <div className="proposed__body">
        <div className="proposed__facts">
          <p>
            {t("count.photos", { count: trip.count })}
            {trip.withPeople > 0 && t("review.withPeople", { count: trip.withPeople })}
            {trip.chapters.length > 1 && t("review.inStops", { stops: t("count.stops", { count: trip.chapters.length }) })}
          </p>
          {color && (
            <span className="proposed__color">
              <span>{t("review.color")}</span>
              <TripColorTag color={color} dot />
            </span>
          )}
        </div>
        {trip.chapters.length === 1 && trip.chapters[0].places.length > 0 && (
          <p className="review__hint">{trip.chapters[0].places.map((x) => placeName(x)).join(", ")}</p>
        )}
        {trip.chapters.length > 1 && (
          <ol className="proposed__stops">
            {trip.chapters.map((c, i) => (
              <li key={i}>
                <span className="step-number">{i + 1}</span>
                <span>
                  <strong>{placeTitle(c.title)}</strong>
                  {c.places.length > 0 && <small>{c.places.map((x) => placeName(x)).join(", ")}</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {trip.route.length > 1 && (
          <div className="proposed__map">
            <TripMap key={color ?? "ink"} route={trip.route} chapters={trip.chapters} compact color={color ?? undefined} />
          </div>
        )}
        <button className="proposed__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? t("review.hidePhotos") : t("review.checkPhotos")}
        </button>
        {open && (
          <>
            <p className="review__hint">{t("review.tapToSkip")}</p>
            <PhotoGrid items={trip.media} onOpen={onToggle} selected={(m) => !m.excluded} />
          </>
        )}
      </div>
    </section>
  );
}

function Group({ title, hint, items, onToggle, collapsed }: { title: string; hint: string; items: ImportMedia[]; onToggle: (m: ImportMedia) => void; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div className="review__group">
      <button className="review__group-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <strong>{title}</strong>
        <span>{open ? t("review.hide") : t("review.show")}</span>
      </button>
      {open && (
        <>
          <p className="review__hint">{hint}</p>
          <PhotoGrid items={items} onOpen={onToggle} selected={(m) => !m.excluded} />
        </>
      )}
    </div>
  );
}

function flip(p: Proposal, id: number): Proposal {
  const f = (list: ImportMedia[]) => list.map((m) => (m.id === id ? { ...m, excluded: !m.excluded } : m));
  return {
    ...p,
    newTrips: p.newTrips.map((trip) => ({ ...trip, media: f(trip.media) })),
    otherPhotos: f(p.otherPhotos),
    setAside: { screenshots: f(p.setAside.screenshots), home: f(p.setAside.home) },
  };
}
