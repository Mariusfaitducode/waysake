import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../api.js";
import { useApi } from "../data.js";
import { GlobeMap } from "../components/GlobeMap.js";
import { TripCard } from "../components/TripCard.js";
import { useUpload } from "../shell/upload.js";
import { useProfile } from "../profile.js";
import { IconPlus } from "../shell/icons.js";
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
          <h1 className="globe__title">Atlas</h1>
          {overview && overview.trips > 0 && (
            <Link to="/pays" className="globe__stats">
              {overview.countries} pays, {overview.trips} voyages, {overview.km.toLocaleString("fr-FR")} km de route
            </Link>
          )}
        </div>
        <div className="globe__actions">
          <button className="icon-button" onClick={openUpload} aria-label="Ajouter des photos">
            <IconPlus />
          </button>
          <button className="globe__me" onClick={switchProfile} style={{ "--c": me.color } as React.CSSProperties} aria-label={`${me.name} — changer de profil`}>
          {me.name[0]}
          </button>
        </div>
      </div>

      {trips && trips.length === 0 && (
        <div className="globe__empty">
          <p>Ajoute les photos d'un voyage : il apparaîtra ici, sur le globe.</p>
          <button className="button" onClick={openUpload}>
            Ajouter des photos
          </button>
        </div>
      )}

      {trips && trips.length > 0 && (
        <div className="globe__strip" ref={strip} aria-label="Vos voyages">
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
