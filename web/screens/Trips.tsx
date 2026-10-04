import { api } from "../api.js";
import { useApi } from "../data.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { TripCard } from "../components/TripCard.js";
import { useUpload } from "../shell/upload.js";
import { t } from "../i18n/index.js";
import "./Trips.css";

export function Trips() {
  const { data: trips } = useApi(api.trips);
  const { open } = useUpload();
  const years = new Map<number, typeof trips>();
  for (const trip of trips ?? []) {
    const y = new Date(trip.startAt).getUTCFullYear();
    years.set(y, [...(years.get(y) ?? []), trip]);
  }

  return (
    <div className="trips">
      <Header title={t("trips.title")} subtitle={trips && trips.length > 0 ? t("trips.subtitle", { trips: t("count.trips", { count: trips.length }) }) : undefined} />
      {!trips && (
        <div className="trips__list">
          <div className="skeleton" style={{ aspectRatio: "4 / 5" }} />
        </div>
      )}
      {trips?.length === 0 && (
        <EmptyState title={t("trips.empty.title")} text={t("trips.empty.text")}>
          <button className="button" onClick={open}>
            {t("common.addPhotos")}
          </button>
        </EmptyState>
      )}
      {[...years.entries()].map(([year, list], i) => (
        <section key={year} className="trips__year">
          <h2 className="trips__year-title">{year}</h2>
          <div className="trips__list">
            {list!.map((trip, j) => (
              <TripCard key={trip.slug} trip={trip} size={i === 0 && j === 0 ? "lg" : "md"} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
