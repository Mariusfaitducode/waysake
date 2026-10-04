import { useState } from "react";
import { Link } from "react-router";
import { api, type UnlocatedDay } from "../api.js";
import { useApi, useDataVersion } from "../data.js";
import { dayLabel, hitName, timeLabel as hour } from "../format.js";
import { t } from "../i18n/index.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { PlacePicker } from "../components/PlacePicker.js";
import { IconBack } from "../shell/icons.js";
import "./Locate.css";


/** Les photos sans lieu, par journée et par moment : un lieu posé localise tout le groupe. */
export function Locate() {
  const { data, reload } = useApi(api.unlocated);
  const { bump } = useDataVersion();
  const [target, setTarget] = useState<{ ids: number[]; preview?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="locate">
      <Link to="/photos" className="back-link">
        <IconBack /> {t("nav.photos")}
      </Link>
      <Header
        title={t("locate.title")}
        subtitle={
          data && data.total > 0
            ? t("locate.subtitle", { count: data.total })
            : undefined
        }
      />
      {data?.total === 0 && <EmptyState title={t("locate.empty.title")} text={t("locate.empty.text")} />}
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
            setToast(t("locate.done", { count: updated, place: hitName(place) }));
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
            {t("count.photos", { count: day.count })}
            {day.moments.length > 1 && `, ${t("locate.moments", { count: day.moments.length })}`}
          </p>
        </div>
        <button className="button button--small" onClick={() => onLocate(day.media.map((m) => m.id), byId.get(day.media[0].id)?.preview)}>
          {t("locate.addPlace")}
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
            {open ? t("locate.hideMoments") : t("locate.showMoments")}
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
                    <span>{t("count.photos", { count: m.count })}</span>
                  </div>
                  <button className="button button--quiet button--small" onClick={() => onLocate(m.ids, byId.get(m.ids[0])?.preview)}>
                    {t("locate.place")}
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
