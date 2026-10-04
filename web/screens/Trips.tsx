import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { api, type TripSummary } from "../api.js";
import { useApi } from "../data.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { TripRow } from "../components/TripCard.js";
import { TripColorFilter } from "../components/TripColor.js";
import { useUpload } from "../shell/upload.js";
import { t } from "../i18n/index.js";
import { TRIP_COLOR_IDS, isTripColorId, safeTripColor } from "../trip-colors.js";
import "./Trips.css";

/**
 * Liste des voyages (Horizon) : grand titre, filtres par couleur (« Tous » puis les couleurs présentes),
 * lignes groupées par année. Le filtre vit dans l'adresse (?couleur=azure) : retour arrière et partage le gardent.
 */
export function Trips() {
  const { data: trips } = useApi(api.trips);
  const { open } = useUpload();
  const [params, setParams] = useSearchParams();
  const wanted = params.get("couleur");

  // Couleurs présentes, dans l'ordre de la palette (stable d'une visite à l'autre).
  const colors = useMemo(() => {
    const present = new Set((trips ?? []).map((trip) => safeTripColor(trip.color)));
    return TRIP_COLOR_IDS.filter((c) => present.has(c));
  }, [trips]);
  const filter = isTripColorId(wanted) && colors.includes(wanted) ? wanted : null;
  const setFilter = (c: string | null) => setParams(c ? { couleur: c } : {}, { replace: true });
  // Le filtre actif reste visible quand la rangée de puces défile (écran étroit, lien partagé).
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    filtersRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [filter, colors.length]);

  const years = useMemo(() => {
    const out = new Map<number, TripSummary[]>();
    for (const trip of trips ?? []) {
      if (filter && safeTripColor(trip.color) !== filter) continue;
      const y = new Date(trip.startAt).getUTCFullYear();
      out.set(y, [...(out.get(y) ?? []), trip]);
    }
    return [...out.entries()];
  }, [trips, filter]);

  return (
    <div className="trips">
      <Header title={t("trips.title")} subtitle={trips && trips.length > 0 ? t("trips.subtitle", { trips: t("count.trips", { count: trips.length }) }) : undefined} />
      {!trips && (
        <div className="trips__body" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="trips__skeleton">
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}
        </div>
      )}
      {trips?.length === 0 && (
        <EmptyState title={t("trips.empty.title")} text={t("trips.empty.text")}>
          <button className="button" onClick={open}>
            {t("common.addPhotos")}
          </button>
        </EmptyState>
      )}
      {trips && trips.length > 0 && (
        <div className="trips__body">
          {colors.length > 1 && (
            <div className="trips__filters" role="group" aria-label={t("trips.filters")} ref={filtersRef}>
              <TripColorFilter label={t("trips.filter.all")} pressed={!filter} onClick={() => setFilter(null)} />
              {colors.map((c) => (
                <TripColorFilter key={c} color={c} pressed={filter === c} onClick={() => setFilter(filter === c ? null : c)} />
              ))}
            </div>
          )}
          {years.map(([year, list]) => (
            <section key={year} className="trips__year" aria-labelledby={`trips-${year}`}>
              <h2 id={`trips-${year}`} className="trips__year-title">
                {year}
              </h2>
              <ul className="trips__list">
                {list.map((trip) => (
                  <li key={trip.slug}>
                    <TripRow trip={trip} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
