import { Link } from "react-router";
import { api } from "../api.js";
import { useApi } from "../data.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { count, year } from "../format.js";
import { IconBack } from "../shell/icons.js";
import "./Countries.css";

export function Countries() {
  const { data: countries } = useApi(api.countries);
  const { data: trips } = useApi(api.trips);
  const latestTrip = (code: string) => trips?.find((t) => t.countryCodes.includes(code));

  return (
    <div className="countries">
      <Link to="/" className="back-link">
        <IconBack /> Globe
      </Link>
      <Header
        title="Pays découverts"
        subtitle={countries && countries.length > 0 ? `${count(countries.length, "pays", "pays")} ensemble, dans l'ordre où vous les avez découverts.` : undefined}
      />
      {countries?.length === 0 && <EmptyState title="Pas encore de pays." text="Les pays apparaissent dès que des photos de voyage sont ajoutées." />}
      <ol className="countries__grid">
        {countries?.map((c) => {
          const t = latestTrip(c.code);
          return (
            <li key={c.code}>
              <Link to={t ? `/v/${t.slug}` : "/voyages"} className="country">
                <span className="country__flag" aria-hidden="true">{c.flag}</span>
                <span className="country__name">{c.name}</span>
                <span className="country__meta">
                  Depuis {year(c.firstVisit)}, {count(c.trips, "voyage", "voyages")}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
