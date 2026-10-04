import { api } from "../api.js";
import { useApi } from "../data.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { TripCard } from "../components/TripCard.js";
import { useUpload } from "../shell/upload.js";
import { count } from "../format.js";
import "./Trips.css";

export function Trips() {
  const { data: trips } = useApi(api.trips);
  const { open } = useUpload();
  const years = new Map<number, typeof trips>();
  for (const t of trips ?? []) {
    const y = new Date(t.startAt).getUTCFullYear();
    years.set(y, [...(years.get(y) ?? []), t]);
  }

  return (
    <div className="trips">
      <Header title="Voyages" subtitle={trips && trips.length > 0 ? `${count(trips.length, "voyage", "voyages")}, rangés tout seuls.` : undefined} />
      {!trips && (
        <div className="trips__list">
          <div className="skeleton" style={{ aspectRatio: "4 / 5" }} />
        </div>
      )}
      {trips?.length === 0 && (
        <EmptyState title="Aucun voyage pour l'instant." text="Ajoute vos photos : Atlas reconnaît les voyages, les pays et les étapes grâce à la date et au lieu de chaque photo.">
          <button className="button" onClick={open}>
            Ajouter des photos
          </button>
        </EmptyState>
      )}
      {[...years.entries()].map(([year, list], i) => (
        <section key={year} className="trips__year">
          <h2 className="trips__year-title">{year}</h2>
          <div className="trips__list">
            {list!.map((t, j) => (
              <TripCard key={t.slug} trip={t} size={i === 0 && j === 0 ? "lg" : "md"} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
