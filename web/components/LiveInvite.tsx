import { useNavigate } from "react-router";
import { useAuthorName } from "../data.js";
import { useLive } from "../live.js";
import { t } from "../i18n/index.js";
import { placeTitle } from "../i18n/places.js";
import "./Live.css";

/** Bandeau d'invitation : « Alex regarde Italie, Slovénie & Croatie — Rejoindre ». */
export function LiveInvite() {
  const { invite, dismissInvite, join } = useLive();
  const navigate = useNavigate();
  const name = useAuthorName();
  if (!invite) return null;
  return (
    <div className="live-invite" role="alert">
      <span className="live-invite__dot" aria-hidden="true" />
      <p>{t("live.invite", { name: name(invite.from), trip: placeTitle(invite.trip.title) })}</p>
      <button className="button button--small" onClick={() => (join(invite.trip.slug), navigate(`/v/${invite.trip.slug}?ensemble`))}>
        {t("live.join")}
      </button>
      <button className="button button--quiet button--small" onClick={dismissInvite}>
        {t("live.later")}
      </button>
    </div>
  );
}
