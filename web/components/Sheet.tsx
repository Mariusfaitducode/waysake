import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n/index.js";
import "./Sheet.css";

/** Feuille modale (dialog natif : focus piégé, Échap, retour du focus). Glisse du bas sur téléphone. */
export function Sheet({ title, onClose, children, dismissable = true }: { title?: string; onClose: () => void; children: ReactNode; dismissable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        if (!dismissable) e.preventDefault();
      }}
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => {
        if (dismissable && e.target === ref.current) ref.current.close();
      }}
    >
      <div className="sheet__body">
        <div className="sheet__grip" aria-hidden="true" />
        {title && <h2 className="sheet__title">{title}</h2>}
        {children}
      </div>
    </dialog>
  );
}

export type Action = { label: string; onSelect: () => void; danger?: boolean; hint?: string };

/** Menu d'actions façon iOS. */
export function ActionSheet({ title, actions, onClose }: { title?: string; actions: Action[]; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="actions">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`actions__item${a.danger ? " is-danger" : ""}`}
            onClick={() => {
              onClose();
              a.onSelect();
            }}
          >
            <span>{a.label}</span>
            {a.hint && <small>{a.hint}</small>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Saisie d'un nom. Laisser vide rend le nom automatique. */
export function PromptSheet({
  title,
  initial,
  placeholder,
  hint,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  placeholder: string;
  hint?: string;
  onSubmit: (value: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="prompt"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(value);
            (e.target as HTMLFormElement).closest("dialog")?.close();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <input className="field" autoFocus value={value} placeholder={placeholder} maxLength={120} onChange={(e) => setValue(e.target.value)} />
        {hint && <p className="prompt__hint">{hint}</p>}
        {error && <p role="alert" className="prompt__error">{error}</p>}
        <div className="prompt__actions">
          <button type="button" className="button button--quiet" onClick={(e) => (e.currentTarget.closest("dialog") as HTMLDialogElement).close()}>
            {t("common.cancel")}
          </button>
          <button className="button" disabled={busy}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
