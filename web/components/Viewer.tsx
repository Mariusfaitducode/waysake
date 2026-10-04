import { useEffect, useRef, useState } from "react";
import type { Media } from "../api.js";
import { useAuthorName, useDataVersion } from "../data.js";
import { dayLabel, hitName, timeLabel } from "../format.js";
import { PlacePicker } from "./PlacePicker.js";
import { IconBack, IconClose, IconPin } from "../shell/icons.js";
import { t } from "../i18n/index.js";
import { placeTitle } from "../i18n/places.js";
import { PhotoSocial } from "./PhotoSocial.js";
import { LiveOverlay } from "./LiveOverlay.js";
import "./Viewer.css";

type Props = {
  items: Media[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Action contextuelle, ex. « Utiliser comme couverture » dans un voyage. */
  action?: { label: string; run: (m: Media) => Promise<unknown> };
  /** Mode « Regarder ensemble » : bandeau du salon et réactions de l'autre. */
  live?: { onLeave: () => void };
};

const IconDownload = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
  </svg>
);

/**
 * Plein écran façon Photos : la photo seule sur fond noir (son propre flou derrière), un chrome discret
 * qu'un toucher sur la photo masque ou rappelle. Dialog natif (focus piégé, Échap), flèches au clavier,
 * balayage au doigt, glisser vers le bas pour fermer.
 */
export function Viewer({ items, index, onIndex, onClose, action, live }: Props) {
  const m = items[index];
  const ref = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [bare, setBare] = useState(false);
  // Lieu posé depuis la visionneuse, affiché tout de suite (la liste se recharge en arrière-plan).
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const authorName = useAuthorName();
  const { bump } = useDataVersion();
  const go = (d: number) => onIndex(Math.min(Math.max(index + d, 0), items.length - 1));

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return; // on écrit une légende
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  // Précharge la photo suivante pour un balayage sans attente.
  useEffect(() => {
    const next = items[index + 1];
    if (next?.kind === "photo") new Image().src = next.preview;
  }, [index, items]);

  const who = authorName(m.uploadedBy);
  // Un GPS d'origine ne se remplace jamais ; un lieu posé à la main ou au jeu se corrige.
  const located = m.lat != null || placed[m.id] !== undefined;
  const canPlace = !located || m.locationSource === "manual" || m.locationSource === "game" || placed[m.id] !== undefined;
  const placeName = placed[m.id] ?? (m.place ? placeTitle(m.place) : null);
  const day = m.takenAtLocal ? dayLabel(m.takenAtLocal.slice(0, 10)) : t("common.unknownDate");
  const time = m.takenAtLocal ? timeLabel(m.takenAtLocal) : null;
  // Titre façon Photos : le lieu, puis la date et l'heure ; sans lieu, la date seule en titre.
  const title = placeName ?? day;
  const subtitle = placeName ? [day, time].filter(Boolean).join(" · ") : time;
  const alt = [placeName, day].filter(Boolean).join(", ");

  return (
    <dialog
      ref={ref}
      className={`viewer${bare ? " is-bare" : ""}`}
      aria-label={t("viewer.label")}
      // En React, la fermeture d'une feuille ouverte depuis la visionneuse remonte jusqu'ici : on l'ignore.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (dy > 90) ref.current?.close(); // glisser vers le bas pour fermer
        touch.current = null;
      }}
    >
      {/* La photo elle-même, très floutée, remplit les bords : l'image ne flotte pas dans un cadre noir. */}
      <div className="viewer__ambient" aria-hidden="true">
        <img key={m.id} src={m.preview} alt="" />
      </div>
      {m.kind === "video" ? (
        <video key={m.id} className="viewer__media" src={m.original} poster={m.preview} controls playsInline autoPlay />
      ) : (
        <img key={m.id} className="viewer__media" src={m.preview} alt={alt} onClick={() => setBare((b) => !b)} />
      )}

      <header className="viewer__bar">
        <button className="icon-button icon-button--glass" onClick={() => ref.current?.close()} aria-label={t("common.close")}>
          <IconClose />
        </button>
        {!live && (
          <div className="viewer__title">
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
        )}
        <div className="viewer__tools">
          <span className="viewer__count">
            {index + 1} / {items.length}
          </span>
          <a className="icon-button icon-button--glass" href={m.original} download aria-label={t("viewer.download")} title={t("viewer.download")}>
            <IconDownload />
          </a>
        </div>
      </header>

      {index > 0 && (
        <button className="viewer__nav viewer__nav--prev icon-button icon-button--glass" onClick={() => go(-1)} aria-label={t("viewer.prev")}>
          <IconBack />
        </button>
      )}
      {index < items.length - 1 && (
        <button className="viewer__nav viewer__nav--next icon-button icon-button--glass" onClick={() => go(1)} aria-label={t("viewer.next")}>
          <IconBack />
        </button>
      )}
      {live && <LiveOverlay mediaId={m.id} onLeave={live.onLeave} />}

      <footer className="viewer__info">
        <div className="viewer__panel">
          <PhotoSocial key={m.id} media={m} />
          <div className="viewer__foot">
            <span className="viewer__who">{t("viewer.by", { name: who })}</span>
            <div className="viewer__actions">
              {canPlace && (
                <button className="viewer__action" onClick={() => setPlacing(true)}>
                  <IconPin />
                  {located ? t("viewer.editPlace") : t("viewer.addPlace")}
                </button>
              )}
              {action && (
                <button className="viewer__action" onClick={() => action.run(m).then(() => setDone(m.id))} disabled={done === m.id}>
                  {done === m.id ? t("viewer.done") : action.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
      {placing && (
        <PlacePicker
          photos={[m.id]}
          previews={[m.preview]}
          onDone={(place) => {
            setPlaced((p) => ({ ...p, [m.id]: hitName(place) }));
            bump();
          }}
          onClose={() => setPlacing(false)}
        />
      )}
    </dialog>
  );
}
