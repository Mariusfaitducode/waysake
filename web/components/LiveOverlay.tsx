import { useAuthorName } from "../data.js";
import { useLive } from "../live.js";
import { useProfile } from "../profile.js";
import { t } from "../i18n/index.js";
import "./Live.css";

/** Dans la visionneuse, en mode « ensemble » : qui mène, et les réactions de l'autre qui s'envolent. */
export function LiveOverlay({ mediaId, onLeave }: { mediaId: number; onLeave: () => void }) {
  const { state, floating } = useLive();
  const { me } = useProfile();
  const name = useAuthorName();
  if (!state) return null;
  const others = state.members.filter((u) => u !== me.id);
  const status = !others.length
    ? t("live.waiting")
    : state.leader === me.id
      ? t("live.youLead", { names: others.map(name).join(", ") })
      : t("live.follows", { name: name(state.leader) });
  return (
    <>
      <div className="live-bar" role="status">
        <span className={`live-bar__dot${others.length ? " is-on" : ""}`} aria-hidden="true" />
        <span>{status}</span>
        <button className="live-bar__leave" onClick={onLeave}>
          {t("live.leave")}
        </button>
      </div>
      <div className="live-floats" aria-hidden="true">
        {floating
          .filter((f) => f.mediaId === mediaId)
          .map((f, i) => (
            <span key={f.key} className="live-float" style={{ "--x": `${15 + ((f.key * 37 + i * 13) % 70)}%` } as React.CSSProperties}>
              {f.emoji}
              <small>{name(f.from)}</small>
            </span>
          ))}
      </div>
    </>
  );
}
