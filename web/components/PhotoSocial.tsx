import { useEffect, useRef, useState } from "react";
import { api, REACTIONS, type Media, type Reaction, type Social } from "../api.js";
import { useAuthorName, useDataVersion } from "../data.js";
import { useProfile } from "../profile.js";
import { useLive } from "../live.js";
import { t } from "../i18n/index.js";
import "./PhotoSocial.css";

const SAVE_DELAY = 800;

/** Réactions et légende partagée d'une photo, dans la visionneuse. Monté une fois par photo (key = id). */
export function PhotoSocial({ media }: { media: Media }) {
  const { me } = useProfile();
  const { bump } = useDataVersion();
  const live = useLive();
  const authorName = useAuthorName();
  const [reactions, setReactions] = useState<Social["reactions"]>(media.reactions ?? {});
  const [text, setText] = useState(media.note ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSaved = useRef(media.note ?? "");
  const area = useRef<HTMLTextAreaElement>(null);
  const current = useRef(text); // dernière valeur tapée, lisible même après le démontage
  current.current = text;

  // La zone de texte suit la hauteur de la légende.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  // En direct : les réactions de l'autre apparaissent aussi dans les compteurs (toutes, même arrivées ensemble).
  const seen = useRef(Math.max(0, ...live.floating.map((f) => f.key)));
  useEffect(() => {
    const fresh = live.floating.filter((f) => f.key > seen.current);
    if (!fresh.length) return;
    seen.current = Math.max(...fresh.map((f) => f.key));
    setReactions((r) => {
      let next = r;
      for (const f of fresh)
        if (f.mediaId === media.id && !next[f.emoji]?.includes(f.from)) next = { ...next, [f.emoji]: [...(next[f.emoji] ?? []), f.from] };
      return next;
    });
  }, [live.floating]); // eslint-disable-line react-hooks/exhaustive-deps
  // En quittant la photo, une légende en cours est enregistrée.
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(emoji: Reaction) {
    if (!me) return;
    const mine = reactions[emoji]?.includes(me.id) ?? false;
    const before = reactions;
    const next = { ...reactions, [emoji]: mine ? reactions[emoji]!.filter((u) => u !== me.id) : [...(reactions[emoji] ?? []), me.id] };
    if (!next[emoji]!.length) delete next[emoji];
    setReactions(next); // tout de suite à l'écran ; la tour confirme
    try {
      if (!mine) live.react(emoji, media.id); // en direct, elle s'envole aussi chez l'autre
      setReactions((await api.react(media.id, emoji, !mine)).reactions);
      bump();
    } catch (e) {
      setReactions(before);
      setError((e as Error).message);
    }
  }

  async function flush(value = current.current) {
    clearTimeout(timer.current);
    if (value.trim() === lastSaved.current.trim()) return;
    try {
      const res = await api.photoNote(media.id, value);
      lastSaved.current = res.note ?? "";
      setSaved(true);
      setError(null);
      bump();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="social">
      <textarea
        ref={area}
        className="social__caption"
        rows={1}
        maxLength={500}
        value={text}
        placeholder={t("caption.placeholder")}
        aria-label={t("caption.label")}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
          clearTimeout(timer.current);
          const value = e.target.value;
          timer.current = setTimeout(() => void flush(value), SAVE_DELAY);
        }}
        onBlur={() => void flush()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <div className="social__row">
        <div className="social__reactions" role="group" aria-label={t("caption.label")}>
          {REACTIONS.map((emoji) => {
            const who = reactions[emoji] ?? [];
            const mine = !!me && who.includes(me.id);
            return (
              <button
                key={emoji}
                className={`social__reaction${mine ? " is-mine" : ""}`}
                aria-pressed={mine}
                aria-label={t(`reaction.${emoji}`)}
                title={who.length ? who.map(authorName).join(", ") : t(`reaction.${emoji}`)}
                onClick={() => void toggle(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
                {who.length > 0 && <span className="social__count">{who.length}</span>}
              </button>
            );
          })}
        </div>
        <span className="social__status" role="status">
          {error ?? (saved ? t("caption.saved") : "")}
        </span>
      </div>
    </div>
  );
}
