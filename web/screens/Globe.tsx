import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { api, type TripSummary } from "../api.js";
import { useApi } from "../data.js";
import { GlobeMap, type GlobeTrip } from "../components/GlobeMap.js";
import { Wordmark } from "../components/Logo.js";
import { Avatar } from "../components/Avatar.js";
import { MemoryCard } from "../components/MemoryCard.js";
import { TripCard } from "../components/TripCard.js";
import { TripColorDot, tripColorName } from "../components/TripColor.js";
import { useUpload } from "../shell/upload.js";
import { useProfile } from "../profile.js";
import { IconPlus } from "../shell/icons.js";
import { t, useLocale } from "../i18n/index.js";
import { autoName } from "../i18n/places.js";
import { dateRange, scrollBehavior } from "../format.js";
import { safeTripColor, tripColorProps } from "../trip-colors.js";
import "./Globe.css";

/** Un point par jour, sans les jours passés au même endroit (moins de ~5 km du point précédent). */
function stopsOf(route: [number, number][]) {
  const out: [number, number][] = [];
  for (const p of route) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.05) out.push(p);
  }
  return out;
}

/** Étapes d'un voyage sur le globe : son itinéraire (liste des voyages), sinon son centre. */
function tripStops(trip: TripSummary): [number, number][] {
  const points = stopsOf(trip.route ?? []);
  return points.length ? points : [[trip.centerLon, trip.centerLat]];
}

const wide = () => matchMedia("(min-width: 900px)").matches;

export function GlobeScreen() {
  useLocale();
  const { data: trips } = useApi(api.trips);
  const { data: wishes } = useApi(api.wishes);
  const { data: overview } = useApi(api.overview);
  const { open: openUpload } = useUpload();
  const { me, switchProfile } = useProfile();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const visited = useMemo(() => [...new Set((trips ?? []).flatMap((t) => t.countryCodes))], [trips]);
  const globeTrips = useMemo<GlobeTrip[]>(
    () => (trips ?? []).map((trip) => ({ slug: trip.slug, name: autoName(trip), color: safeTripColor(trip.color), stops: tripStops(trip) })),
    [trips],
  );
  const onSelect = useCallback((slug: string | null) => setSelected(slug), []);
  const onHover = useCallback((slug: string | null) => setHovered(slug), []);

  // Place laissée au globe : la légende à gauche (grand écran), les cartes en bas, le titre en haut.
  const [padding, setPadding] = useState(() => framing());
  useEffect(() => {
    const mq = matchMedia("(min-width: 900px)");
    const update = () => setPadding(framing());
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Le voyage choisi sur le globe vient se placer dans le bandeau.
  useEffect(() => {
    if (!selected) return;
    strip.current?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(selected)}"]`)?.scrollIntoView({ behavior: scrollBehavior(), inline: "center", block: "nearest" });
  }, [selected]);

  const focus = hovered ?? selected;
  const hasTrips = !!trips && trips.length > 0;

  return (
    <div className="globe">
      <GlobeMap trips={globeTrips} wishes={wishes ?? []} visited={visited} selected={selected} focus={focus} padding={padding} onSelect={onSelect} onHover={onHover} />

      <div className="globe__top">
        <div className="globe__brand">
          <h1 className="globe__title">
            <Wordmark size={28} />
          </h1>
          {overview && overview.trips > 0 && (
            <Link to="/pays" className="globe__stats">
              {t("globe.summary", { trips: t("count.trips", { count: overview.trips }), countries: t("count.countries", { count: overview.countries }) })}
            </Link>
          )}
        </div>
        <div className="globe__actions">
          <Link to="/jeu" className="globe__play">
            {t("game.entry")}
          </Link>
          <button className="icon-button globe__add" onClick={openUpload} aria-label={t("common.addPhotos")}>
            <IconPlus />
          </button>
          <button className="globe__me" onClick={switchProfile} aria-label={t("profile.switch", { name: me.name })}>
            <Avatar name={me.name} color={me.color} size={40} />
          </button>
        </div>
      </div>

      <div className="globe__side">
        <MemoryCard />
        {hasTrips && (
          <nav className="globe__legend" aria-label={t("globe.legend")}>
            <ul>
              {trips.map((trip) => (
                <li key={trip.slug}>
                  <button
                    type="button"
                    className="globe__legend-row"
                    aria-pressed={selected === trip.slug}
                    data-focus={focus === trip.slug || undefined}
                    data-dim={(focus && focus !== trip.slug) || undefined}
                    onClick={() => setSelected(selected === trip.slug ? null : trip.slug)}
                    onPointerEnter={() => setHovered(trip.slug)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(trip.slug)}
                    onBlur={() => setHovered(null)}
                  >
                    <TripColorDot color={trip.color} size={10} />
                    <span className="globe__legend-text">
                      <b>{autoName(trip)}</b>
                      <small>{dateRange(trip.startAt, trip.endAt)}</small>
                    </span>
                    <em>{tripColorName(trip.color)}</em>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {trips && trips.length === 0 && (
        <div className="globe__empty">
          <p>{t("globe.empty")}</p>
          <button className="button" onClick={openUpload}>
            {t("common.addPhotos")}
          </button>
        </div>
      )}

      {hasTrips && (
        <div className="globe__strip" ref={strip} aria-label={t("globe.yourTrips")}>
          {trips.map((trip) => (
            <div
              key={trip.slug}
              data-slug={trip.slug}
              {...tripColorProps(trip.color)}
              className={`globe__slot${selected === trip.slug ? " is-selected" : ""}`}
              onPointerEnter={() => matchMedia("(hover: hover)").matches && setHovered(trip.slug)}
              onPointerLeave={() => setHovered(null)}
            >
              <TripCard trip={trip} size="sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Marges de cadrage du globe selon la largeur (légende à gauche sur grand écran, cartes du bas). */
function framing() {
  return wide() ? { top: 120, bottom: 270, left: 340, right: 80 } : { top: 110, bottom: 250, left: 40, right: 40 };
}
