import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type ImportMedia, type Proposal, type ProposedTrip } from "../api.js";
import { useDataVersion } from "../data.js";
import { count, dateRange, flags } from "../format.js";
import { Sign } from "../components/Sign.js";
import { PhotoGrid } from "../components/PhotoGrid.js";
import { TripMap } from "../components/TripMap.js";
import { ActionSheet } from "../components/Sheet.js";
import { EmptyState } from "../components/EmptyState.js";
import { IconBack } from "../shell/icons.js";
import "./ImportReview.css";

/** L'écran où l'humain valide le tri proposé par Atlas. Identique sur l'app, l'ordinateur et Safari. */
export function ImportReview() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const [p, setP] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = () => api.importProposal(id).then(setP, (e: Error) => setError(e.message));
  useEffect(() => {
    load();
    // Pendant qu'un téléphone envoie encore, la proposition s'enrichit toute seule.
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
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

  if (error && !p) return <EmptyState title="Cet import est introuvable." text={error} />;
  if (!p) return <div className="review"><div className="skeleton review__skeleton" /></div>;
  if (p.status !== "pending")
    return (
      <EmptyState
        title={p.status === "confirmed" ? "Cet import est déjà dans Atlas." : "Cet import a été annulé."}
        text={p.status === "confirmed" ? "Ses photos sont rangées dans vos voyages." : "Aucune de ses photos n'a été gardée."}
      >
        <Link className="button" to="/voyages">Voir les voyages</Link>
      </EmptyState>
    );

  const nothing = p.counts.received === 0;
  return (
    <div className="review">
      <header className="review__head">
        <Link to="/" className="back-link"><IconBack /> Atlas</Link>
        <h1 className="review__title">{nothing ? "En attente des photos…" : "Voici ce qu'Atlas a trouvé"}</h1>
        <p className="review__lead">
          {nothing
            ? "Les photos apparaîtront ici dès qu'elles arrivent sur la tour."
            : `${count(p.counts.received, "photo analysée", "photos analysées")}${p.counts.duplicates ? `, ${count(p.counts.duplicates, "était déjà", "étaient déjà")} dans Atlas` : ""}. Vérifie, décoche ce que tu ne veux pas garder, puis importe.`}
        </p>
      </header>

      {p.newTrips.map((t) => (
        <ProposedTripCard key={`${t.title}-${t.startAt}`} trip={t} onToggle={toggle} />
      ))}

      {p.extendedTrips.length > 0 && (
        <section className="review__block">
          <h2 className="review__h2">Viennent compléter un voyage</h2>
          <ul className="review__list">
            {p.extendedTrips.map((e) => (
              <li key={e.slug}>
                <strong>{e.title}</strong>
                <span>+ {count(e.added, "photo", "photos")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.otherPhotos.length > 0 && (
        <Group title={`${count(p.otherPhotos.length, "photo", "photos")} hors voyage`} hint="Sans lieu ni date de voyage : elles iront dans Photos." items={p.otherPhotos} onToggle={toggle} />
      )}

      {(p.setAside.screenshots.length > 0 || p.setAside.home.length > 0) && (
        <section className="review__block">
          <h2 className="review__h2">Mises de côté</h2>
          <p className="review__hint">Atlas ne les importera pas, sauf si tu changes d'avis.</p>
          {p.setAside.home.length > 0 && (
            <div className="review__aside">
              <label className="switch">
                <span>
                  <strong>{count(p.setAside.home.length, "photo prise à la maison", "photos prises à la maison")}</strong>
                  <small>Le quotidien, pas un voyage.</small>
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
              title={count(p.setAside.screenshots.length, "capture d'écran", "captures d'écran")}
              hint="Touche une capture pour la garder quand même."
              items={p.setAside.screenshots}
              onToggle={toggle}
              collapsed
            />
          )}
        </section>
      )}

      {!nothing && (
        <div className="review__bar">
          <button className="button button--quiet" onClick={() => setConfirmCancel(true)} disabled={busy}>
            Annuler
          </button>
          <button className="button review__go" onClick={confirm} disabled={busy || p.counts.toImport === 0}>
            {busy ? "Import…" : `Importer ${count(p.counts.toImport, "photo", "photos")}`}
          </button>
        </div>
      )}

      {confirmCancel && (
        <ActionSheet
          title="Annuler cet import ?"
          actions={[
            {
              label: "Annuler l'import",
              hint: "Les photos envoyées seront supprimées de la tour. Elles restent sur ton téléphone.",
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

function ProposedTripCard({ trip, onToggle }: { trip: ProposedTrip; onToggle: (m: ImportMedia) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="proposed">
      <div className="proposed__hero">
        {trip.coverLarge && <img src={trip.coverLarge} alt="" />}
        <div className="proposed__shade" aria-hidden="true" />
        <span className="proposed__badge">Nouveau voyage</span>
        <div className="proposed__text">
          <span aria-hidden="true" className="proposed__flags">{flags(trip.countryCodes)}</span>
          <Sign size="md">{trip.title}</Sign>
          <p>{dateRange(trip.startAt, trip.endAt)}</p>
        </div>
      </div>
      <div className="proposed__body">
        <p className="proposed__facts">
          {count(trip.count, "photo", "photos")}
          {trip.withPeople > 0 && `, dont ${trip.withPeople} avec des personnes`}
          {trip.chapters.length > 1 && `, en ${trip.chapters.length} étapes`}
        </p>
        {trip.chapters.length === 1 && trip.chapters[0].places.length > 0 && (
          <p className="review__hint">{trip.chapters[0].places.join(", ")}</p>
        )}
        {trip.chapters.length > 1 && (
          <ol className="proposed__stops">
            {trip.chapters.map((c, i) => (
              <li key={i}>
                <Sign size="sm">{i + 1}</Sign>
                <span>
                  <strong>{c.title}</strong>
                  {c.places.length > 0 && <small>{c.places.join(", ")}</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {trip.route.length > 1 && <TripMap route={trip.route} chapters={trip.chapters} compact />}
        <button className="proposed__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Masquer les photos" : "Vérifier les photos"}
        </button>
        {open && (
          <>
            <p className="review__hint">Touche une photo pour ne pas l'importer.</p>
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
        <span>{open ? "Masquer" : "Voir"}</span>
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
    newTrips: p.newTrips.map((t) => ({ ...t, media: f(t.media) })),
    otherPhotos: f(p.otherPhotos),
    setAside: { screenshots: f(p.setAside.screenshots), home: f(p.setAside.home) },
  };
}
