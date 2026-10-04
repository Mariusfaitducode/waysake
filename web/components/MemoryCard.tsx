import { useMemo, useState } from "react";
import { api } from "../api.js";
import { useApi } from "../data.js";
import { t } from "../i18n/index.js";
import { placeTitle } from "../i18n/places.js";
import { Viewer } from "./Viewer.js";
import "./MemoryCard.css";

/** Date locale du téléphone (YYYY-MM-DD) : c'est son « aujourd'hui » qui compte. */
function localToday() {
  // `?today=2026-02-18` : revoir la carte d'un autre jour (essais, captures d'écran).
  const forced = new URLSearchParams(location.search).get("today");
  if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) return forced;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** « Il y a un an… » : une carte discrète sur le globe quand ce jour a des souvenirs ; un tap les rouvre. */
export function MemoryCard() {
  const today = useMemo(localToday, []);
  const { data } = useApi(() => api.memories(today), [today]);
  const [open, setOpen] = useState<number | null>(null);
  const groups = data?.groups ?? [];
  const media = useMemo(() => groups.flatMap((g) => g.media), [groups]);
  if (!groups.length) return null;

  const first = groups[0];
  const cover = first.media.find((m) => m.hasThumbs) ?? first.media[0];
  const total = groups.reduce((n, g) => n + g.count, 0);

  return (
    <>
      <button className="memory" onClick={() => setOpen(0)} aria-label={t("memories.open")}>
        <img className="memory__img" src={cover.thumb} alt="" />
        <span className="memory__text">
          <strong>{t("memories.when", { count: first.yearsAgo })}</strong>
          <span>
            {first.trip ? `${placeTitle(first.trip.title)}, ` : ""}
            {t("count.photos", { count: total })}
          </span>
        </span>
      </button>
      {open !== null && <Viewer items={media} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
