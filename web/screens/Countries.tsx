import { Link } from "react-router";
import { api } from "../api.js";
import { useApi } from "../data.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { TripColorDot } from "../components/TripColor.js";
import { countryName, year } from "../format.js";
import { t, useLocale } from "../i18n/index.js";
import { autoName } from "../i18n/places.js";
import { IconBack } from "../shell/icons.js";
import { tripColorProps } from "../trip-colors.js";
import "./Countries.css";

/** Voyages listés sous chaque pays ; au-delà, « et n autres ». */
const SHOWN = 3;

export function Countries() {
  useLocale();
  const { data: countries } = useApi(api.countries);
  const { data: trips } = useApi(api.trips);

  return (
    <div className="countries">
      <Link to="/" className="back-link">
        <IconBack /> {t("common.globe")}
      </Link>
      <Header
        title={t("countries.title")}
        subtitle={countries && countries.length > 0 ? t("countries.subtitle", { countries: t("count.countries", { count: countries.length }) }) : undefined}
      />
      {countries?.length === 0 && <EmptyState title={t("countries.empty.title")} text={t("countries.empty.text")} />}
      <ol className="countries__grid">
        {countries?.map((c) => {
          const name = countryName(c.code, c.name);
          // Les voyages du plus récent au plus ancien (ordre de l'API).
          const here = (trips ?? []).filter((trip) => trip.countryCodes.includes(c.code));
          return (
            <li key={c.code} className="country">
              <span className="country__flag" aria-hidden="true">
                {c.flag}
              </span>
              <h2 className="country__name">{name}</h2>
              <p className="country__meta">
                {t("countries.meta", { year: year(c.firstVisit), trips: t("count.trips", { count: c.trips }), photos: t("count.photos", { count: c.photos }) })}
              </p>
              {here.length > 0 && (
                <ul className="country__trips" aria-label={t("countries.tripsIn", { country: name })}>
                  {here.slice(0, SHOWN).map((trip) => (
                    <li key={trip.slug} {...tripColorProps(trip.color)}>
                      <Link to={`/v/${trip.slug}`} className="country__trip">
                        <TripColorDot color={trip.color} size={9} />
                        <span>{autoName(trip)}</span>
                      </Link>
                    </li>
                  ))}
                  {here.length > SHOWN && (
                    <li>
                      <Link to="/voyages" className="country__more">
                        {t("countries.more", { count: here.length - SHOWN })}
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
