import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useLive } from "../live.js";
import { useProfile } from "../profile.js";
import { api, type Chapter, type Media, type Trip } from "../api.js";
import { useApi, useDataVersion } from "../data.js";
import { countryName, dateRange, dayRange, days, hitName, number, scrollBehavior } from "../format.js";
import { t } from "../i18n/index.js";
import { localizeTrip } from "../i18n/places.js";
import { PhotoGrid } from "../components/PhotoGrid.js";
import { Viewer } from "../components/Viewer.js";
import { TripMap } from "../components/TripMap.js";
import { NoteEditor } from "../components/NoteEditor.js";
import { BadgeSheet } from "../components/BadgeSheet.js";
import { ActionSheet, PromptSheet, Sheet, type Action } from "../components/Sheet.js";
import { TripColorPicker, tripColorName } from "../components/TripColor.js";
import { EmptyState } from "../components/EmptyState.js";
import { TripStatsPanel } from "../components/TripStatsPanel.js";
import { PlacePicker } from "../components/PlacePicker.js";
import { canRelocate, subStops, type SubStop } from "../substops.js";
import { cityPins } from "../trip-map.js";
import { IconBack, IconMore, IconPlay, IconPostcard, IconTogether } from "../shell/icons.js";
import { PostcardSheet } from "../components/PostcardSheet.js";
import { tripColorProps } from "../trip-colors.js";
import "./Trip.css";

type Overlay =
  | { kind: "trip-menu" }
  | { kind: "rename-trip" }
  | { kind: "badge" }
  | { kind: "postcard" }
  | { kind: "chapter-menu"; chapter: Chapter; index: number }
  | { kind: "rename-chapter"; chapter: Chapter }
  | { kind: "substop-menu"; stop: SubStop }
  | { kind: "relocate"; stop: SubStop }
  | { kind: "cover-help" }
  | { kind: "color" }
  | { kind: "error"; message: string };

export function TripScreen() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const { data: raw, error, loading } = useApi(() => api.trip(slug), [slug]);
  // En anglais, les noms automatiques (calculés en français par la tour) sont traduits ; un nom choisi reste tel quel.
  const trip = useMemo(() => raw && localizeTrip(raw), [raw]);
  const { data: stats } = useApi(() => api.tripStats(slug), [slug]);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);
  const cityRefs = useRef(new Map<string, HTMLElement>());
  const [toast, setToast] = useState<string | null>(null);

  const flat = useMemo(() => trip?.chapters.flatMap((c) => c.media) ?? [], [trip]);
  // Les villes de chaque étape, dans l'ordre : elles découpent les photos de l'étape sans les réordonner,
  // donc la visionneuse (qui parcourt `flat`) suit exactement ce qui est affiché.
  const cities = useMemo(() => new Map(trip?.chapters.map((c) => [c.id, subStops(c.media)]) ?? []), [trip]);
  // Les mêmes villes sur la carte, avec quelques miniatures chacune.
  const pins = useMemo(() => cityPins(trip?.chapters ?? []), [trip]);
  const live = useLive();
  const { me } = useProfile();
  const [params, setParams] = useSearchParams();
  const together = live.room === slug;

  // Invitation acceptée (/v/<voyage>?ensemble) : on entre dans le salon.
  useEffect(() => {
    if (!params.has("ensemble")) return;
    live.join(slug);
    setParams({}, { replace: true });
  }, [slug, params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensemble : on suit la photo du meneur ; seul dans le salon, on ouvre la première.
  const leader = live.state?.leader;
  const shown = live.state?.mediaId;
  useEffect(() => {
    if (!together || leader === undefined || !flat.length) return;
    if (shown === null) {
      if (leader === me.id) {
        const i = viewer ?? 0;
        setViewer(i);
        live.show(flat[i].id);
      }
      return;
    }
    if (leader !== me.id) {
      const i = flat.findIndex((m) => m.id === shown);
      if (i >= 0) setViewer(i);
    }
  }, [together, leader, shown, flat]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTogether = () => {
    live.join(slug);
    void api.liveInvite(slug).catch(() => {});
  };
  const leaveTogether = () => {
    live.leave();
    setViewer(null);
  };

  const favorites = useMemo(() => (trip?.favorites ?? []).map((id) => flat.find((m) => m.id === id)).filter((m): m is Media => !!m), [trip, flat]);
  useEffect(() => {
    if (trip) document.title = `${trip.title} — Waysake`;
    return () => {
      document.title = "Waysake";
    };
  }, [trip?.title]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);
  // Arrivée depuis une vignette d'étape du globe : la page s'ouvre sur cette étape.
  const fromStop = (useLocation().state as { chapter?: number } | null)?.chapter;
  const loaded = !!trip;
  useEffect(() => {
    if (!loaded || !fromStop) return;
    const i = trip!.chapters.findIndex((c) => c.id === fromStop);
    if (i < 0) return;
    // Une seconde fois quand la carte et les panneaux du haut ont pris leur hauteur.
    const go = () => chapterRefs.current[i]?.scrollIntoView({ block: "start" });
    const frame = requestAnimationFrame(go);
    const later = setTimeout(go, 400);
    return () => (cancelAnimationFrame(frame), clearTimeout(later));
  }, [loaded, slug, fromStop]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trip && error)
    return (
      <EmptyState title={t("trip.notFound.title")} text={t("trip.notFound.text")}>
        <Link className="button" to="/voyages">
          {t("trip.notFound.action")}
        </Link>
      </EmptyState>
    );
  if (!trip) return loading ? <div className="trip-cover trip-cover--loading skeleton" /> : null;

  const noteFor = (chapterId: number | null) => trip.notes.find((n) => n.chapterId === chapterId)?.body ?? "";
  const back = () => (history.length > 1 ? navigate(-1) : navigate("/voyages"));
  const goToChapter = (i: number) => chapterRefs.current[i]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  const goToCity = (key: string) => cityRefs.current.get(key)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  // Une ville touchée sur la carte : on défile jusqu'à sa section (l'étape entière si elle n'a qu'une ville).
  const goToPin = (pin: { key: string; chapter: number }) => (cityRefs.current.has(pin.key) ? goToCity(pin.key) : goToChapter(pin.chapter));
  const cityName = (s: SubStop) => s.place ?? t("substop.unknown");
  const open = (m: Media) => setViewer(flat.indexOf(m));
  const many = trip.chapters.length > 1;
  const countries = trip.countryCodes.map((c) => countryName(c)).join(", ");
  const figures = [
    { value: days(trip.startAt, trip.endAt), label: (n: number) => t("stats.days", { count: n }) },
    { value: trip.mediaCount, label: (n: number) => t("stats.photos", { count: n }) },
    many && { value: trip.chapters.length, label: (n: number) => t("trip.figure.stops", { count: n }) },
    stats && stats.km > 0 && { value: stats.km, label: () => t("stats.km") },
  ].filter(Boolean) as { value: number; label: (n: number) => string }[];

  const tripActions: Action[] = [
    { label: t("live.start"), hint: t("live.start.hint"), onSelect: startTogether },
    { label: t("slideshow.open"), onSelect: () => navigate(`/v/${trip.slug}/diaporama`) },
    { label: t("postcard.open"), hint: t("postcard.hint"), onSelect: () => setOverlay({ kind: "postcard" }) },
    { label: t("trip.rename"), onSelect: () => setOverlay({ kind: "rename-trip" }) },
    { label: t("tripColor.title"), hint: tripColorName(trip.color), onSelect: () => setOverlay({ kind: "color" }) },
    { label: t("trip.changeCover"), hint: t("trip.changeCover.hint"), onSelect: () => setOverlay({ kind: "cover-help" }) },
    { label: t("trip.badge"), hint: t("trip.badge.hint"), onSelect: () => setOverlay({ kind: "badge" }) },
    // « En fait, c'est un lieu de vie » : la tour recalcule, puis on arrive sur la page du lieu.
    {
      label: t("trip.toPlace"),
      hint: t("trip.toPlace.hint"),
      onSelect: () =>
        api
          .tripToPlaceOfLife(trip.slug)
          .then(({ slug: place }) => {
            navigate(`/l/${place}`, { replace: true });
            bump();
          })
          .catch((e: Error) => setOverlay({ kind: "error", message: e.message })),
    },
  ];

  return (
    <article className="trip" {...tripColorProps(trip.color)}>
      <header className="trip-cover">
        {/* La photo est le sujet : nette sur presque toute sa hauteur, seul son bas se fond dans la page. */}
        <div className="trip-cover__photo">
          {trip.coverLarge && <img className="trip-cover__img" src={trip.coverLarge} alt="" />}
          <div className="trip-cover__veil" aria-hidden="true" />
          <div className="trip-cover__bar">
            <button className="icon-button icon-button--glass" onClick={back} aria-label={t("common.back")}>
              <IconBack />
            </button>
            <span className="trip-cover__spacer" />
            <button className="icon-button icon-button--glass" onClick={() => setOverlay({ kind: "trip-menu" })} aria-label={t("trip.options")}>
              <IconMore />
            </button>
            <button
              className="icon-button icon-button--glass trip-cover__swatch"
              onClick={() => setOverlay({ kind: "color" })}
              aria-label={t("trip.color", { name: tripColorName(trip.color) })}
              title={t("trip.color", { name: tripColorName(trip.color) })}
            >
              <i aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="trip-cover__text">
          <h1 className="title trip-cover__title">{trip.title}</h1>
          <p className="trip-cover__meta">{[dateRange(trip.startAt, trip.endAt), countries].filter(Boolean).join(" · ")}</p>
          {/* Les chiffres, discrets : une ligne de métadonnées, pas un tableau de bord. */}
          <p className="trip-cover__figures">
            {figures.map((f, i) => (
              <span key={f.label(f.value)}>
                {i > 0 && " · "}
                <b>{number(f.value)}</b> {f.label(f.value)}
              </span>
            ))}
          </p>
          {many && (
            <ol className={`trip-route${trip.chapters.length > 5 ? " trip-route--many" : ""}`} aria-label={t("trip.stops")}>
              {trip.chapters.map((c, i) => (
                <li key={c.id}>
                  <button onClick={() => goToChapter(i)} aria-label={c.title}>
                    <i aria-hidden="true" />
                    <span>{c.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="trip__actions">
            <button className="button trip__primary" onClick={startTogether}>
              <IconTogether />
              {t("live.start")}
            </button>
            <button className="button trip__tinted" onClick={() => navigate(`/v/${trip.slug}/diaporama`)} aria-label={t("slideshow.title")} title={t("slideshow.title")}>
              <IconPlay />
              <span className="trip__action-label">{t("slideshow.title")}</span>
            </button>
            <button className="button trip__tinted" onClick={() => setOverlay({ kind: "postcard" })} aria-label={t("postcard.open")} title={t("postcard.open")}>
              <IconPostcard />
              <span className="trip__action-label">{t("postcard.open")}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="trip__body">
        {/* Sous la couverture : la même photo très floutée, mêlée à la couleur du voyage (--trip-page). */}
        <div className="trip__backdrop" aria-hidden="true">
          {trip.cover && <img src={trip.cover} alt="" />}
        </div>

        {(many || trip.route.length > 1) && (
          <section className={`trip__route${many ? "" : " trip__route--map-only"}`} aria-label={t("trip.route")}>
            {many && (
              <ol className="trip-steps" aria-label={t("trip.stops")}>
                {trip.chapters.map((c, i) => (
                  <li key={c.id}>
                    <button onClick={() => goToChapter(i)}>
                      <b>{c.title}</b>
                      <small>
                        {dateRange(c.startAt, c.endAt)} · {t("count.photos", { count: c.media.length })}
                      </small>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {trip.route.length > 1 && <TripMap route={trip.route} chapters={trip.chapters} cities={pins} color={trip.color} onChapter={goToChapter} onCity={goToPin} />}
          </section>
        )}

        <section className="trip__section">
          <NoteEditor key={`t-${trip.id}`} tripId={trip.id} chapterId={null} initial={noteFor(null)} placeholder={t("trip.notePlaceholder")} />
        </section>

        {favorites.length > 0 && (
          <section className="favorites" aria-labelledby="favorites-title">
            <div className="favorites__head">
              <h2 id="favorites-title" className="chapter__title">{t("trip.favorites")}</h2>
              <p className="chapter__meta">{t("trip.favorites.hint")}</p>
            </div>
            <ul className="favorites__strip">
              {favorites.map((m) => (
                <li key={m.id}>
                  <button onClick={() => setViewer(flat.indexOf(m))} aria-label={t("grid.open")}>
                    <img src={m.thumb} alt="" loading="lazy" />
                    <span className="favorites__emoji" aria-hidden="true">
                      {Object.entries(m.reactions ?? {}).flatMap(([emoji, who]) => (who ?? []).map(() => emoji)).slice(0, 4).join("")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {trip.chapters.map((c, i) => {
          const stops = cities.get(c.id) ?? [];
          const split = stops.length > 1;
          return (
            <section key={c.id} className="chapter" ref={(el) => void (chapterRefs.current[i] = el)} aria-labelledby={`c-${c.id}`}>
              <div className="chapter__head">
                {many && <span className="step-number">{i + 1}</span>}
                <div className="chapter__titles">
                  <h2 id={`c-${c.id}`} className="chapter__title">{c.title}</h2>
                  {/* Les villes sont listées juste dessous quand l'étape en compte plusieurs. */}
                  <p className="chapter__meta">{[!split && c.places.join(", "), dateRange(c.startAt, c.endAt), t("count.photos", { count: c.media.length })].filter(Boolean).join(" · ")}</p>
                </div>
                <button className="icon-button chapter__more" onClick={() => setOverlay({ kind: "chapter-menu", chapter: c, index: i })} aria-label={t("chapter.options", { title: c.title })}>
                  <IconMore />
                </button>
              </div>
              {split ? (
                <>
                  <ol className="chapter__cities" aria-label={t("substop.list", { title: c.title })}>
                    {stops.map((s) => (
                      <li key={s.key}>
                        <button onClick={() => goToCity(s.key)} aria-label={`${cityName(s)}, ${t("count.photos", { count: s.media.length })}`}>
                          <span>
                            {cityName(s)}
                            <small aria-hidden="true">{s.media.length}</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  {stops.map((s) => (
                    <section
                      key={s.key}
                      className="substop"
                      ref={(el) => void (el ? cityRefs.current.set(s.key, el) : cityRefs.current.delete(s.key))}
                      aria-labelledby={`s-${s.media[0].id}`}
                    >
                      <div className="substop__head">
                        <i className="substop__dot" aria-hidden="true" />
                        <div className="substop__titles">
                          <h3 id={`s-${s.media[0].id}`} className="substop__title">{cityName(s)}</h3>
                          <p className="substop__meta">{[dayRange(s.startLocal, s.endLocal), t("count.photos", { count: s.media.length })].filter(Boolean).join(" · ")}</p>
                        </div>
                        <button className="icon-button substop__more" onClick={() => setOverlay({ kind: "substop-menu", stop: s })} aria-label={t("substop.options", { place: cityName(s) })}>
                          <IconMore />
                        </button>
                      </div>
                      <PhotoGrid items={s.media} onOpen={open} />
                    </section>
                  ))}
                </>
              ) : (
                <PhotoGrid items={c.media} onOpen={open} />
              )}
              <ChapterNote trip={trip} chapter={c} initial={noteFor(c.id)} />
            </section>
          );
        })}

        <TripStatsPanel stats={stats} />
      </div>

      {viewer !== null && (
        <Viewer
          items={flat}
          index={viewer}
          onIndex={(i) => {
            setViewer(i);
            if (together) live.show(flat[i].id);
          }}
          onClose={() => (together ? leaveTogether() : setViewer(null))}
          live={together ? { onLeave: leaveTogether } : undefined}
          action={{ label: t("trip.useAsCover"), run: (m: Media) => api.updateTrip(trip.slug, { coverMediaId: m.id }).then(bump) }}
        />
      )}

      {overlay?.kind === "trip-menu" && <ActionSheet title={trip.title} actions={tripActions} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "color" && (
        <Sheet onClose={() => setOverlay(null)}>
          <TripColorPicker value={trip.colorAuto ? null : trip.color} autoColor={trip.autoColor} onChange={(c) => api.setTripColor(trip.slug, c).then(bump)} />
        </Sheet>
      )}
      {overlay?.kind === "error" && (
        <Sheet onClose={() => setOverlay(null)}>
          <p role="alert" className="place__error">
            {overlay.message}
          </p>
        </Sheet>
      )}
      {overlay?.kind === "postcard" && <PostcardSheet slug={trip.slug} title={trip.title} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "badge" && <BadgeSheet slug={trip.slug} title={trip.title} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "cover-help" && (
        <ActionSheet
          title={t("trip.chooseCover")}
          actions={[{ label: t("trip.openFirst"), hint: t("trip.openFirst.hint"), onSelect: () => setViewer(0) }]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "rename-trip" && (
        <PromptSheet
          title={t("trip.rename")}
          initial={trip.title}
          placeholder={trip.autoTitle}
          hint={t("trip.rename.hint", { auto: trip.autoTitle })}
          onSubmit={(v) => api.updateTrip(trip.slug, { title: v.trim() || null }).then(bump)}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "chapter-menu" && (
        <ActionSheet
          title={overlay.chapter.title}
          actions={[
            { label: t("chapter.rename"), onSelect: () => setOverlay({ kind: "rename-chapter", chapter: overlay.chapter }) },
            ...(overlay.index > 0
              ? [{ label: t("chapter.merge", { title: trip.chapters[overlay.index - 1].title }), hint: t("chapter.merge.hint"), onSelect: () => api.mergeChapter(overlay.chapter.id).then(bump) }]
              : []),
          ]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "substop-menu" && (
        <ActionSheet
          title={cityName(overlay.stop)}
          actions={[
            {
              label: t("substop.relocate"),
              // Une ville dont toutes les photos ont un GPS d'origine ne peut pas changer de lieu : on dit pourquoi.
              hint: !overlay.stop.editable
                ? t("substop.relocate.locked")
                : overlay.stop.media.every(canRelocate)
                  ? t("substop.relocate.hint")
                  : t("substop.relocate.some", { count: overlay.stop.media.filter(canRelocate).length }),
              disabled: !overlay.stop.editable,
              onSelect: () => setOverlay({ kind: "relocate", stop: overlay.stop }),
            },
            { label: t("substop.view"), onSelect: () => open(overlay.stop.media[0]) },
          ]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "relocate" && (
        <PlacePicker
          photos={overlay.stop.media.filter(canRelocate).map((m) => m.id)}
          previews={overlay.stop.media.filter(canRelocate).map((m) => m.preview)}
          onClose={() => setOverlay(null)}
          onDone={(place, updated) => {
            setToast(updated ? t("substop.moved", { count: updated, place: hitName(place) }) : t("substop.moved.none"));
            // La tour a recalculé voyages et étapes : la page se recharge et les villes peuvent se regrouper.
            bump();
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}
      {overlay?.kind === "rename-chapter" && (
        <PromptSheet
          title={t("chapter.rename")}
          initial={overlay.chapter.title}
          placeholder={overlay.chapter.autoTitle}
          hint={t("chapter.rename.hint", { auto: overlay.chapter.autoTitle })}
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
        {t("chapter.addNote")}
      </button>
    );
  return (
    <div className="chapter__note">
      <NoteEditor key={`c-${chapter.id}`} tripId={trip.id} chapterId={chapter.id} initial={initial} placeholder={t("chapter.notePlaceholder", { title: chapter.title })} />
    </div>
  );
}
