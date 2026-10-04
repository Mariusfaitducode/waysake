import { useState } from "react";
import { Link } from "react-router";
import { api, type UnlocatedDay } from "../api.js";
import { useApi, useDataVersion } from "../data.js";
import { count } from "../format.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { PlacePicker } from "../components/PlacePicker.js";
import { IconBack } from "../shell/icons.js";
import "./Locate.css";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => {
  const s = dayFmt.format(new Date(`${d}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const hour = (local: string) => local.slice(11, 16).replace(":", "h");

/** Les photos sans lieu, par journée et par moment : un lieu posé localise tout le groupe. */
export function Locate() {
  const { data, reload } = useApi(api.unlocated);
  const { bump } = useDataVersion();
  const [target, setTarget] = useState<{ ids: number[]; preview?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="locate">
      <Link to="/photos" className="back-link">
        <IconBack /> Photos
      </Link>
      <Header
        title="À localiser"
        subtitle={
          data && data.total > 0
            ? `${count(data.total, "photo n'a", "photos n'ont")} pas de lieu. Choisis une journée et dis où vous étiez : Atlas range le reste.`
            : undefined
        }
      />
      {data?.total === 0 && <EmptyState title="Toutes vos photos ont un lieu." text="Bravo. Les voyages, les étapes et les itinéraires sont complets." />}
      <div className="locate__days">
        {data?.days.map((d) => (
          <DayCard key={d.day} day={d} onLocate={(ids, preview) => setTarget({ ids, preview })} />
        ))}
      </div>
      {toast && (
        <div className="toast" role="status" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}
      {target && (
        <PlacePicker
          photos={target.ids}
          preview={target.preview}
          onClose={() => setTarget(null)}
          onDone={(place, updated) => {
            setToast(`${count(updated, "photo localisée", "photos localisées")} à ${place.name}`);
            reload();
            bump();
          }}
        />
      )}
    </div>
  );
}

function DayCard({ day, onLocate }: { day: UnlocatedDay; onLocate: (ids: number[], preview?: string) => void }) {
  const [open, setOpen] = useState(false);
  const byId = new Map(day.media.map((m) => [m.id, m]));
  return (
    <section className="lday">
      <div className="lday__head">
        <div>
          <h2>{dayLabel(day.day)}</h2>
          <p>
            {count(day.count, "photo", "photos")}
            {day.moments.length > 1 && `, ${day.moments.length} moments`}
          </p>
        </div>
        <button className="button button--small" onClick={() => onLocate(day.media.map((m) => m.id), byId.get(day.media[0].id)?.preview)}>
          Ajouter un lieu
        </button>
      </div>
      <div className="lday__strip">
        {day.media.slice(0, 12).map((m) => (
          <img key={m.id} src={m.thumb} alt="" loading="lazy" />
        ))}
        {day.count > 12 && <span className="lday__more">+{day.count - 12}</span>}
      </div>
      {day.moments.length > 1 && (
        <>
          <button className="lday__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Masquer les moments" : "Plusieurs endroits ? Moment par moment"}
          </button>
          {open && (
            <ul className="lday__moments">
              {day.moments.map((m) => (
                <li key={m.start}>
                  <div className="lmoment__thumbs">
                    {m.ids.slice(0, 4).map((id) => (
                      <img key={id} src={byId.get(id)!.thumb} alt="" loading="lazy" />
                    ))}
                  </div>
                  <div className="lmoment__text">
                    <strong>{m.start === m.end ? hour(m.start) : `${hour(m.start)} – ${hour(m.end)}`}</strong>
                    <span>{count(m.count, "photo", "photos")}</span>
                  </div>
                  <button className="button button--quiet button--small" onClick={() => onLocate(m.ids, byId.get(m.ids[0])?.preview)}>
                    Lieu
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
