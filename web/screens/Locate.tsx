import { useState } from "react";
import { Link } from "react-router";
import { api, type Media, type UnlocatedDay, type UnlocatedMedia } from "../api.js";
import { useApi, useDataVersion } from "../data.js";
import { dayLabel, hitName, timeLabel as hour } from "../format.js";
import { t } from "../i18n/index.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { PlacePicker } from "../components/PlacePicker.js";
import { Viewer } from "../components/Viewer.js";
import { IconBack, IconPin } from "../shell/icons.js";
import "./Locate.css";

/** Les photos sans lieu, par journée et par moment : un lieu posé localise tout le groupe. */
export function Locate() {
  const { data, reload } = useApi(api.unlocated);
  const { bump } = useDataVersion();
  const [target, setTarget] = useState<{ ids: number[]; previews: string[] } | null>(null);
  // Regarder les photos d'une journée en grand (la visionneuse permet aussi d'en localiser une seule).
  const [viewing, setViewing] = useState<{ items: Media[]; index: number } | null>(null);
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
      {data && data.total > 0 && (
        <Link to="/jeu" className="locate__game">
          {t("game.locateHint")}
          <IconBack />
        </Link>
      )}
      <div className="locate__days">
        {data?.days.map((d) => (
          <DayCard
            key={d.day}
            day={d}
            onLocate={(ids) => setTarget({ ids, previews: ids.map((id) => d.media.find((m) => m.id === id)!.preview) })}
            onView={(ids, id) => {
              const items = ids.map((x) => asMedia(d.media.find((m) => m.id === x)!));
              setViewing({ items, index: Math.max(0, ids.indexOf(id)) });
            }}
          />
        ))}
      </div>
      {toast && (
        <div className="toast" role="status" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}
      {viewing && <Viewer items={viewing.items} index={viewing.index} onIndex={(index) => setViewing((v) => v && { ...v, index })} onClose={() => setViewing(null)} />}
      {target && (
        <PlacePicker
          photos={target.ids}
          previews={target.previews}
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

/** Une photo de la liste « à localiser », sous la forme qu'attend la visionneuse. */
const asMedia = (m: UnlocatedMedia): Media => ({ ...m, takenAt: null, lat: null, lon: null, locationSource: null, place: null });

function DayCard({ day, onLocate, onView }: { day: UnlocatedDay; onLocate: (ids: number[]) => void; onView: (ids: number[], id: number) => void }) {
  const [open, setOpen] = useState(false);
  const byId = new Map(day.media.map((m) => [m.id, m]));
  return (
    <section className="lday">
      <div className="lday__head">
        <div>
          <h2 className="lday__title">{dayLabel(day.day)}</h2>
          <p>
            {t("count.photos", { count: day.count })}
            {day.moments.length > 1 && `, ${t("locate.moments", { count: day.moments.length })}`}
          </p>
        </div>
        <button className="button button--quiet button--small" onClick={() => onLocate(day.media.map((m) => m.id))}>
          <IconPin />
          {t("locate.addPlace")}
        </button>
      </div>
      <div className="lday__strip">
        {day.media.map((m) => (
          <button key={m.id} className="lday__thumb" onClick={() => onView(day.media.map((x) => x.id), m.id)} aria-label={t("grid.open")}>
            <img src={m.thumb} alt="" loading="lazy" />
          </button>
        ))}
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
                      <button key={id} className="lday__thumb" onClick={() => onView(m.ids, id)} aria-label={t("grid.open")}>
                        <img src={byId.get(id)!.thumb} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                  <div className="lmoment__text">
                    <strong>{m.start === m.end ? hour(m.start) : `${hour(m.start)} – ${hour(m.end)}`}</strong>
                    <span>{t("count.photos", { count: m.count })}</span>
                  </div>
                  <button className="button button--quiet button--small" onClick={() => onLocate(m.ids)}>
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
