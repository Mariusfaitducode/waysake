import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type Chapter, type Media, type Trip } from "../api.js";
import { useApi, useDataVersion } from "../data.js";
import { count, dateRange, days, flags } from "../format.js";
import { Sign } from "../components/Sign.js";
import { PhotoGrid } from "../components/PhotoGrid.js";
import { Viewer } from "../components/Viewer.js";
import { TripMap } from "../components/TripMap.js";
import { NoteEditor } from "../components/NoteEditor.js";
import { BadgeSheet } from "../components/BadgeSheet.js";
import { ActionSheet, PromptSheet, type Action } from "../components/Sheet.js";
import { EmptyState } from "../components/EmptyState.js";
import { IconBack, IconMore, IconNfc } from "../shell/icons.js";
import "./Trip.css";

type Overlay =
  | { kind: "trip-menu" }
  | { kind: "rename-trip" }
  | { kind: "badge" }
  | { kind: "chapter-menu"; chapter: Chapter; index: number }
  | { kind: "rename-chapter"; chapter: Chapter }
  | { kind: "cover-help" };

export function TripScreen() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const { data: trip, error, loading } = useApi(() => api.trip(slug), [slug]);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);

  const flat = useMemo(() => trip?.chapters.flatMap((c) => c.media) ?? [], [trip]);
  useEffect(() => {
    if (trip) document.title = `${trip.title} — Atlas`;
    return () => {
      document.title = "Atlas";
    };
  }, [trip?.title]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!trip && error)
    return (
      <EmptyState title="Ce voyage est introuvable." text="Le lien est peut-être ancien, ou ses photos ont été retirées.">
        <Link className="button" to="/voyages">
          Voir tous les voyages
        </Link>
      </EmptyState>
    );
  if (!trip) return loading ? <div className="trip-hero skeleton" /> : null;

  const noteFor = (chapterId: number | null) => trip.notes.find((n) => n.chapterId === chapterId)?.body ?? "";
  const back = () => (history.length > 1 ? navigate(-1) : navigate("/voyages"));

  const tripActions: Action[] = [
    { label: "Renommer le voyage", onSelect: () => setOverlay({ kind: "rename-trip" }) },
    { label: "Changer la photo de couverture", hint: "Ouvre une photo, puis « Utiliser comme couverture »", onSelect: () => setOverlay({ kind: "cover-help" }) },
    { label: "Créer un badge pour le frigo", hint: "QR code ou badge NFC", onSelect: () => setOverlay({ kind: "badge" }) },
  ];

  return (
    <article className="trip">
      <header className="trip-hero">
        {trip.coverLarge && <img className="trip-hero__img" src={trip.coverLarge} alt="" />}
        <div className="trip-hero__shade" aria-hidden="true" />
        <div className="trip-hero__bar">
          <button className="icon-button icon-button--glass" onClick={back} aria-label="Retour">
            <IconBack />
          </button>
          <div className="trip-hero__actions">
            <button className="icon-button icon-button--glass" onClick={() => setOverlay({ kind: "badge" })} aria-label="Badge du frigo">
              <IconNfc />
            </button>
            <button className="icon-button icon-button--glass" onClick={() => setOverlay({ kind: "trip-menu" })} aria-label="Options du voyage">
              <IconMore />
            </button>
          </div>
        </div>
        <div className="trip-hero__text">
          <span className="trip-hero__flags" aria-hidden="true">{flags(trip.countryCodes)}</span>
          <Sign as="h1" size="lg">{trip.title}</Sign>
          <p className="trip-hero__meta">
            {dateRange(trip.startAt, trip.endAt)}, {count(days(trip.startAt, trip.endAt), "jour", "jours")}, {count(trip.mediaCount, "photo", "photos")}
          </p>
        </div>
      </header>

      <div className="trip__body">
        {trip.route.length > 1 && (
          <section className="trip__section" aria-label="Itinéraire">
            <TripMap route={trip.route} chapters={trip.chapters} onChapter={(i) => chapterRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" })} />
            <ol className="trip__stops">
              {trip.chapters.map((c, i) => (
                <li key={c.id}>
                  <button onClick={() => chapterRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    <Sign size="sm">{i + 1}</Sign>
                    <span>{c.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="trip__section">
          <NoteEditor key={`t-${trip.id}`} tripId={trip.id} chapterId={null} initial={noteFor(null)} placeholder="Raconte ce voyage : ce qu'il ne faut pas oublier, les fous rires, les adresses…" />
        </section>

        {trip.chapters.map((c, i) => (
          <section key={c.id} className="chapter" ref={(el) => void (chapterRefs.current[i] = el)} aria-labelledby={`c-${c.id}`}>
            <div className="chapter__head">
              <Sign size="sm">{i + 1}</Sign>
              <div className="chapter__titles">
                <h2 id={`c-${c.id}`} className="chapter__title">{c.title}</h2>
                <p className="chapter__meta">
                  {c.places.length > 0 && <span>{c.places.join(", ")}. </span>}
                  {dateRange(c.startAt, c.endAt)}
                </p>
              </div>
              <button className="icon-button chapter__more" onClick={() => setOverlay({ kind: "chapter-menu", chapter: c, index: i })} aria-label={`Options de l'étape ${c.title}`}>
                <IconMore />
              </button>
            </div>
            <PhotoGrid items={c.media} onOpen={(m) => setViewer(flat.indexOf(m))} />
            <ChapterNote trip={trip} chapter={c} initial={noteFor(c.id)} />
          </section>
        ))}
      </div>

      {viewer !== null && (
        <Viewer
          items={flat}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          action={{ label: "Utiliser comme couverture", run: (m: Media) => api.updateTrip(trip.slug, { coverMediaId: m.id }).then(bump) }}
        />
      )}

      {overlay?.kind === "trip-menu" && <ActionSheet title={trip.title} actions={tripActions} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "badge" && <BadgeSheet slug={trip.slug} title={trip.title} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "cover-help" && (
        <ActionSheet
          title="Choisir la couverture"
          actions={[{ label: "Ouvrir la première photo", hint: "Fais défiler, puis touche « Utiliser comme couverture »", onSelect: () => setViewer(0) }]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "rename-trip" && (
        <PromptSheet
          title="Renommer le voyage"
          initial={trip.title}
          placeholder={trip.autoTitle}
          hint={`Laisse vide pour revenir au nom automatique : « ${trip.autoTitle} ». Le lien du badge ne change pas.`}
          onSubmit={(v) => api.updateTrip(trip.slug, { title: v.trim() || null }).then(bump)}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "chapter-menu" && (
        <ActionSheet
          title={overlay.chapter.title}
          actions={[
            { label: "Renommer l'étape", onSelect: () => setOverlay({ kind: "rename-chapter", chapter: overlay.chapter }) },
            ...(overlay.index > 0
              ? [{ label: `Fusionner avec « ${trip.chapters[overlay.index - 1].title} »`, hint: "Les deux étapes n'en feront plus qu'une", onSelect: () => api.mergeChapter(overlay.chapter.id).then(bump) }]
              : []),
          ]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "rename-chapter" && (
        <PromptSheet
          title="Renommer l'étape"
          initial={overlay.chapter.title}
          placeholder={overlay.chapter.autoTitle}
          hint={`Laisse vide pour revenir à « ${overlay.chapter.autoTitle} ».`}
          onSubmit={(v) => api.renameChapter(overlay.chapter.id, v.trim() || null).then(bump)}
          onClose={() => setOverlay(null)}
        />
      )}
    </article>
  );
}

/** Note d'étape : repliée tant qu'elle est vide, pour ne pas encombrer. */
function ChapterNote({ trip, chapter, initial }: { trip: Trip; chapter: Chapter; initial: string }) {
  const [open, setOpen] = useState(initial.length > 0);
  if (!open)
    return (
      <button className="chapter__add-note" onClick={() => setOpen(true)}>
        Ajouter un souvenir à cette étape
      </button>
    );
  return (
    <div className="chapter__note">
      <NoteEditor key={`c-${chapter.id}`} tripId={trip.id} chapterId={chapter.id} initial={initial} placeholder={`Un souvenir de ${chapter.title}…`} />
    </div>
  );
}
