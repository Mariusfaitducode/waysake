import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../api.js";
import { useApi } from "../data.js";
import { GlobeMap } from "../components/GlobeMap.js";
import { MemoryCard } from "../components/MemoryCard.js";
import { TripCard } from "../components/TripCard.js";
import { useUpload } from "../shell/upload.js";
import { useProfile } from "../profile.js";
import { IconPlus } from "../shell/icons.js";
import { t } from "../i18n/index.js";
import { number } from "../format.js";
import "./Globe.css";

export function GlobeScreen() {
  const { data: trips } = useApi(api.trips);
  const { data: wishes } = useApi(api.wishes);
  const { data: overview } = useApi(api.overview);
  const { open: openUpload } = useUpload();
  const { me, switchProfile } = useProfile();
  const [selected, setSelected] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const visited = useMemo(() => [...new Set((trips ?? []).flatMap((t) => t.countryCodes))], [trips]);
  const onSelect = useCallback((slug: string) => setSelected(slug), []);

  // Le voyage choisi sur le globe vient se placer dans le bandeau.
  useEffect(() => {
    if (!selected) return;
    strip.current?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(selected)}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  return (
    <div className="globe">
      <GlobeMap trips={trips ?? []} wishes={wishes ?? []} visited={visited} selected={selected} onSelect={onSelect} />

      <div className="globe__top">
        <div>
          <h1 className="globe__title">Waysake</h1>
          {overview && overview.trips > 0 && (
            <Link to="/pays" className="globe__stats">
              {t("globe.stats", { countries: t("count.countries", { count: overview.countries }), trips: t("count.trips", { count: overview.trips }), km: number(overview.km) })}
            </Link>
          )}
          <MemoryCard />
        </div>
        <div className="globe__actions">
          <Link to="/jeu" className="globe__play">
            {t("game.entry")}
          </Link>
          <button className="icon-button" onClick={openUpload} aria-label={t("common.addPhotos")}>
            <IconPlus />
          </button>
          <button className="globe__me" onClick={switchProfile} style={{ "--c": me.color } as React.CSSProperties} aria-label={t("profile.switch", { name: me.name })}>
          {me.name[0]}
          </button>
        </div>
      </div>

      {trips && trips.length === 0 && (
        <div className="globe__empty">
          <p>{t("globe.empty")}</p>
          <button className="button" onClick={openUpload}>
            {t("common.addPhotos")}
          </button>
        </div>
      )}

      {trips && trips.length > 0 && (
        <div className="globe__strip" ref={strip} aria-label={t("globe.yourTrips")}>
          {trips.map((t) => (
            <div key={t.slug} data-slug={t.slug} className={`globe__slot${selected === t.slug ? " is-selected" : ""}`} onPointerEnter={() => matchMedia("(hover: hover)").matches && setSelected(t.slug)}>
              <TripCard trip={t} size="sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
