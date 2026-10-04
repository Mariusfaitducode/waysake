import { Link } from "react-router";
import type { TripSummary } from "../api.js";
import { dateRange, flags } from "../format.js";
import { t } from "../i18n/index.js";
import { autoName } from "../i18n/places.js";
import "./TripCard.css";

/** Carte de voyage : la photo de couverture porte tout, le texte se pose dessus. */
export function TripCard({ trip, size = "md" }: { trip: TripSummary; size?: "sm" | "md" | "lg" }) {
  return (
    <Link to={`/v/${trip.slug}`} className={`trip-card trip-card--${size}`}>
      {trip.coverLarge && <img src={size === "sm" ? trip.cover! : trip.coverLarge} alt="" loading="lazy" decoding="async" />}
      <span className="trip-card__shade" aria-hidden="true" />
      <span className="trip-card__text">
        <span className="trip-card__flags" aria-hidden="true">{flags(trip.countryCodes)}</span>
        <strong className="trip-card__title">{autoName(trip)}</strong>
        <span className="trip-card__meta">{dateRange(trip.startAt, trip.endAt)}</span>
        <span className="trip-card__meta trip-card__count">{t("count.photos", { count: trip.mediaCount })}</span>
      </span>
    </Link>
  );
}
