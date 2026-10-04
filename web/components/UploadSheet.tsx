import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { count } from "../format.js";
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
            <h2 className="sheet__title">Ajouter des photos</h2>
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
              <span className="drop__lead">Choisir des photos</span>
              <span className="drop__hint">ou glisse-les ici, autant que tu veux. Atlas les trie, tu valides ensuite.</span>
            </label>
            <p className="sheet__meta">
              Sur téléphone, les navigateurs retirent le lieu des photos.{" "}
              <a href="/app" onClick={(e) => { e.preventDefault(); dialog.current?.close(); navigate("/app"); }}>
                Installe l'app Atlas
              </a>{" "}
              pour tout importer avec les lieux.
            </p>
          </>
        )}

        {s.total > 0 && (
          <>
            <h2 className="sheet__title" aria-live="polite">
              {finished ? (added > 0 ? `${count(added, "photo reçue", "photos reçues")}` : "Rien de nouveau") : "Envoi en cours…"}
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
              {s.done + s.failed.length} sur {s.total}
              {s.duplicates > 0 && ` · ${count(s.duplicates, "déjà présente", "déjà présentes")}`}
            </p>
            {s.failed.length > 0 && !busy && (
              <div className="failed">
                <p>{count(s.failed.length, "fichier n'a pas pu être ajouté", "fichiers n'ont pas pu être ajoutés")} :</p>
                <ul>
                  {s.failed.slice(0, 5).map((f, i) => (
                    <li key={i}>
                      <strong>{f.file.name}</strong> — {f.error}
                    </li>
                  ))}
                </ul>
                <button className="button button--quiet" onClick={onRetry}>
                  Réessayer
                </button>
              </div>
            )}
            {finished && added > 0 && <p className="sheet__meta">Atlas a trié vos photos. Il ne reste qu'à vérifier et valider.</p>}
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
                    Voir le tri proposé
                  </button>
                ) : (
                  <button className="button" onClick={() => dialog.current?.close()}>
                    Fermer
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
