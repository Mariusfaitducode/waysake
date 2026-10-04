import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { t } from "../i18n/index.js";
import { IconPhotos } from "../shell/icons.js";
import type { QueueState, UploadQueue } from "../upload-queue.js";
import "./Sheet.css";
import "./UploadSheet.css";

type Props = { queue: UploadQueue; importId: number | null; onSend: (files: File[]) => void; onRetry: () => void; onClose: () => void };

export function UploadSheet({ queue, importId, onSend, onRetry, onClose }: Props) {
  const navigate = useNavigate();
  const [s, setS] = useState<QueueState>(queue.state());
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    setS(queue.state());
    const unsubscribe = queue.subscribe(setS);
    return () => {
      unsubscribe();
    };
  }, [queue]);

  const busy = s.active > 0 || s.done + s.failed.length < s.total;
  const finished = s.total > 0 && !busy;
  const added = s.done - s.duplicates;
  const progress = s.total ? (s.done + s.failed.length) / s.total : 0;

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current && !busy) dialog.current.close();
      }}
    >
      <div className="sheet__body">
        <div className="sheet__grip" aria-hidden="true" />
        {s.total === 0 && (
          <>
            <h2 className="sheet__title">{t("common.addPhotos")}</h2>
            <label
              className={`drop ${dragging ? "is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(false);
                onSend([...e.dataTransfer.files]);
              }}
            >
              <input
                ref={input}
                type="file"
                multiple
                accept="image/*,video/*,.heic,.heif"
                className="sr-only"
                onChange={(e) => e.target.files && onSend([...e.target.files])}
              />
              <span className="drop__icon" aria-hidden="true">
                <IconPhotos />
              </span>
              <span className="drop__lead">{t("upload.choose")}</span>
              <span className="drop__hint">{t("upload.dropHint")}</span>
            </label>
            <p className="sheet__meta">
              {t("upload.phone.before")}{" "}
              <a href="/app" onClick={(e) => { e.preventDefault(); dialog.current?.close(); navigate("/app"); }}>
                {t("upload.phone.link")}
              </a>
              {t("upload.phone.after")}
            </p>
          </>
        )}

        {s.total > 0 && (
          <>
            <h2 className="sheet__title" aria-live="polite">
              {finished ? (added > 0 ? t("upload.received", { count: added }) : t("upload.nothingNew")) : t("upload.sending")}
            </h2>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={s.total}
              aria-valuenow={s.done + s.failed.length}
            >
              <div className="progress__bar" style={{ transform: `scaleX(${progress})` }} />
            </div>
            <p className="sheet__meta">
              {t("upload.progress", { done: s.done + s.failed.length, total: s.total })}
              {s.duplicates > 0 && ` · ${t("upload.duplicates", { count: s.duplicates })}`}
            </p>
            {s.failed.length > 0 && !busy && (
              <div className="failed">
                <p>{t("upload.failed", { count: s.failed.length })}</p>
                <ul>
                  {s.failed.slice(0, 5).map((f, i) => (
                    <li key={i}>
                      <strong>{f.file.name}</strong> — {f.error}
                    </li>
                  ))}
                </ul>
                <button className="button button--quiet" onClick={onRetry}>
                  {t("common.retry")}
                </button>
              </div>
            )}
            {finished && added > 0 && <p className="sheet__meta">{t("upload.sorted")}</p>}
            {finished && (
              <div className="sheet__actions">
                {added > 0 && importId ? (
                  <button
                    className="button"
                    onClick={() => {
                      const to = `/import/${importId}`;
                      dialog.current?.close();
                      navigate(to);
                    }}
                  >
                    {t("upload.review")}
                  </button>
                ) : (
                  <button className="button" onClick={() => dialog.current?.close()}>
                    {t("common.close")}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
