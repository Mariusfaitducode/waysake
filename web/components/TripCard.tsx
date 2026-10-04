import { Link } from "react-router";
import type { TripSummary } from "../api.js";
import { dateRange } from "../format.js";
import { t } from "../i18n/index.js";
import { autoName } from "../i18n/places.js";
import { tripColorProps } from "../trip-colors.js";
import { TripColorDot, TripColorTag } from "./TripColor.js";
import "./TripCard.css";

/**
 * Nombre d'étapes d'un voyage, quand la tour le donne dans la liste (`chapterCount`).
 * Absent chez une tour qui ne l'envoie pas : la ligne se passe alors d'étapes et de mini-route.
 */
const stopsOf = (trip: TripSummary) => {
  const n = trip.chapterCount;
  return n && n > 0 ? n : null;
};

/** Carte de voyage sur photo (bas du globe) : la couverture porte tout, pastille de couleur devant le titre. */
export function TripCard({ trip, size = "md" }: { trip: TripSummary; size?: "sm" | "md" | "lg" }) {
  return (
    <Link to={`/v/${trip.slug}`} className={`trip-card trip-card--${size}`} {...tripColorProps(trip.color)}>
      {trip.coverLarge && <img src={size === "sm" ? trip.cover! : trip.coverLarge} alt="" loading="lazy" decoding="async" />}
      <span className="trip-card__shade" aria-hidden="true" />
      <span className="trip-card__text">
        <strong className="trip-card__title">
          <TripColorDot color={trip.color} />
          {autoName(trip)}
        </strong>
        <span className="trip-card__meta">
          {dateRange(trip.startAt, trip.endAt)}
          {size !== "sm" && ` · ${t("count.photos", { count: trip.mediaCount })}`}
        </span>
      </span>
    </Link>
  );
}

/**
 * Ligne de la liste des voyages (Horizon) : vignette 58 px, pastille + titre, dates · étapes · photos,
 * mini-route à la couleur du voyage, et le nom de la couleur à droite (la couleur n'est jamais seule).
 */
export function TripRow({ trip }: { trip: TripSummary }) {
  const stops = stopsOf(trip);
  const meta = [dateRange(trip.startAt, trip.endAt), stops && t("count.stops", { count: stops }), t("count.photos", { count: trip.mediaCount })].filter(Boolean).join(" · ");
  return (
    <Link to={`/v/${trip.slug}`} className="trip-row" {...tripColorProps(trip.color)}>
      <span className="trip-row__thumb">{trip.cover && <img src={trip.cover} alt="" loading="lazy" decoding="async" />}</span>
      <span className="trip-row__text">
        <strong className="trip-row__title">
          <TripColorDot color={trip.color} />
          <span>{autoName(trip)}</span>
        </strong>
        <span className="trip-row__meta">{meta}</span>
        {stops && <MiniRoute stops={stops} />}
      </span>
      <span className="trip-row__tag">
        <TripColorTag color={trip.color} />
      </span>
    </Link>
  );
}

/** Mini-route : une pastille par étape (six au plus, puis « +n »), reliées par un trait fin. Décorative. */
export function MiniRoute({ stops, max = 6 }: { stops: number; max?: number }) {
  const shown = Math.min(stops, max);
  return (
    <span className="mini-route" aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="mini-route__stop">
          {i > 0 && <u />}
          <i />
        </span>
      ))}
      {stops > shown && <em>+{stops - shown}</em>}
    </span>
  );
}
