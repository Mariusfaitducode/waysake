import { useEffect, useRef, useState } from "react";
import type { Media } from "../api.js";
import { useAuthorName } from "../data.js";
import { fullDate } from "../format.js";
import { IconBack, IconClose } from "../shell/icons.js";
import { t } from "../i18n/index.js";
import { placeTitle } from "../i18n/places.js";
import "./Viewer.css";

type Props = {
  items: Media[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Action contextuelle, ex. « Utiliser comme couverture » dans un voyage. */
  action?: { label: string; run: (m: Media) => Promise<unknown> };
};

/** Plein écran, dialog natif (focus piégé, Échap), flèches au clavier, balayage au doigt. */
export function Viewer({ items, index, onIndex, onClose, action }: Props) {
  const m = items[index];
  const ref = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const authorName = useAuthorName();
  const go = (d: number) => onIndex(Math.min(Math.max(index + d, 0), items.length - 1));

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
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
  const meta = [m.place && placeTitle(m.place), m.takenAtLocal ? fullDate(m.takenAtLocal) : t("common.unknownDate")].filter(Boolean).join(", ");

  return (
    <dialog
      ref={ref}
      className="viewer"
      aria-label={t("viewer.label")}
      onClose={onClose}
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
      {m.kind === "video" ? (
        <video key={m.id} className="viewer__media" src={m.original} poster={m.preview} controls playsInline autoPlay />
      ) : (
        <img key={m.id} className="viewer__media" src={m.preview} alt={meta} />
      )}
      <div className="viewer__bar">
        <button className="icon-button icon-button--glass" onClick={() => ref.current?.close()} aria-label={t("common.close")}>
          <IconClose />
        </button>
        <span className="viewer__count">
          {index + 1} / {items.length}
        </span>
      </div>
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
      <footer className="viewer__info">
        <div>
          <p className="viewer__place">{meta}</p>
          <p className="viewer__who">{t("viewer.by", { name: who })}</p>
        </div>
        <div className="viewer__actions">
          {action && (
            <button className="viewer__action" onClick={() => action.run(m).then(() => setDone(m.id))} disabled={done === m.id}>
              {done === m.id ? t("viewer.done") : action.label}
            </button>
          )}
          <a className="viewer__action" href={m.original} download>
            {t("viewer.download")}
          </a>
        </div>
      </footer>
    </dialog>
  );
}
