import { Link } from "react-router";
import { api } from "../api.js";
import { useApi } from "../data.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { countryName, year } from "../format.js";
import { t } from "../i18n/index.js";
import { IconBack } from "../shell/icons.js";
import "./Countries.css";

export function Countries() {
  const { data: countries } = useApi(api.countries);
  const { data: trips } = useApi(api.trips);
  const latestTrip = (code: string) => trips?.find((trip) => trip.countryCodes.includes(code));

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
          const trip = latestTrip(c.code);
          return (
            <li key={c.code}>
              <Link to={trip ? `/v/${trip.slug}` : "/voyages"} className="country">
                <span className="country__flag" aria-hidden="true">{c.flag}</span>
                <span className="country__name">{countryName(c.code, c.name)}</span>
                <span className="country__meta">{t("countries.since", { year: year(c.firstVisit), trips: t("count.trips", { count: c.trips }) })}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
