import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n/index.js";
import "./NoteEditor.css";

type Status = "idle" | "saving" | "saved" | "error";

/** Une note qui s'enregistre toute seule, comme dans Notes : pas de bouton « Enregistrer ». */
export function NoteEditor({ tripId, chapterId, initial, placeholder }: { tripId: number; chapterId: number | null; initial: string; placeholder: string }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(initial);
  const area = useRef<HTMLTextAreaElement>(null);

  const save = (text: string) =>
    api.saveNote(tripId, chapterId, text).then(
      () => setStatus("saved"),
      () => setStatus("error"),
    );

  // La zone de texte grandit avec le contenu.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Ne rien perdre en quittant la page au milieu d'une phrase.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void api.saveNote(tripId, chapterId, latest.current);
      }
    },
    [tripId, chapterId],
  );

  return (
    <div className="note">
      <textarea
        ref={area}
        className="note__area"
        value={value}
        rows={2}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          latest.current = e.target.value;
          setStatus("saving");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = undefined;
            void save(latest.current);
          }, 700);
        }}
      />
      <span className={`note__status is-${status}`} aria-live="polite">
        {status === "saving" ? "…" : status === "saved" ? t("note.saved") : status === "error" ? t("note.error") : ""}
      </span>
    </div>
  );
}
