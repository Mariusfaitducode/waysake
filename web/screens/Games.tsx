import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type GameMode } from "../api.js";
import { useApi } from "../data.js";
import { number, when } from "../format.js";
import { t } from "../i18n/index.js";
import { Header } from "../components/Header.js";
import { Avatar } from "../components/Avatar.js";
import { IconBack, IconPin } from "../shell/icons.js";
import "./Games.css";

/** Accueil du jeu « Où était-ce ? » : deux modes (une photo chacun), les records, les parties récentes. */
export function Games() {
  const { data } = useApi(api.games);
  const { data: trips } = useApi(api.trips);
  const { data: users } = useApi(api.users);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = (id: string) => users?.find((u) => u.id === id);
  const name = (id: string) => user(id)?.name ?? id;

  async function start(mode: GameMode) {
    setBusy(mode);
    setError(null);
    try {
      const { id } = await api.newGame(mode);
      navigate(`/jeu/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  // Une photo de vos voyages pour chaque mode : la couverture du plus récent, puis celle du suivant.
  const covers = (trips ?? []).map((tr) => tr.coverLarge ?? tr.cover).filter((c): c is string => !!c);
  const modes: { mode: GameMode; title: string; text: string; photo?: string }[] = [
    { mode: "defi", title: t("game.defi"), text: t("game.defi.text"), photo: covers[0] },
    { mode: "enquete", title: t("game.enquete"), text: t("game.enquete.text"), photo: covers[1] ?? covers[0] },
  ];

  return (
    <div className="games">
      <Header title={t("game.title")} subtitle={t("game.subtitle")} />
      <div className="games__modes">
        {modes.map((m, i) => (
          <section key={m.mode} className="games__mode" aria-labelledby={`game-mode-${m.mode}`}>
            <div className="games__photo">
              {m.photo ? (
                <img src={m.photo} alt="" loading="lazy" />
              ) : (
                <span className="games__photo-empty" aria-hidden="true">
                  <IconPin />
                </span>
              )}
            </div>
            <h2 id={`game-mode-${m.mode}`} className="games__mode-title">
              {m.title}
            </h2>
            <p>{m.text}</p>
            {/* Une seule action Encre par écran : le Défi ; l'Enquête reste discrète. */}
            <button className={`button${i === 0 ? "" : " button--quiet"}`} onClick={() => start(m.mode)} disabled={busy !== null}>
              {busy === m.mode ? "…" : t("game.play")}
            </button>
          </section>
        ))}
      </div>
      {error && (
        <p role="alert" className="prompt__error games__error">
          {error}
        </p>
      )}

      {data && data.records.length > 0 && (
        <section className="games__block" aria-labelledby="games-records">
          <h2 id="games-records" className="games__h">
            {t("game.records")}
          </h2>
          <ol className="games__group games__records">
            {data.records.map((r) => (
              <li key={r.userId}>
                <Avatar name={name(r.userId)} color={user(r.userId)?.color} size={32} />
                <span className="games__who">{name(r.userId)}</span>
                <b className="games__points">{number(r.points)}</b>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data && data.games.length > 0 && (
        <section className="games__block" aria-labelledby="games-recent">
          <h2 id="games-recent" className="games__h">
            {t("game.recent")}
          </h2>
          <ul className="games__group games__list">
            {data.games.map((g) => (
              <li key={g.id}>
                <Link to={`/jeu/${g.id}`}>
                  <span className="games__list-main">
                    <span className="games__list-mode">{g.mode === "defi" ? t("game.defi") : t("game.enquete")}</span>
                    <span className="games__list-scores">{g.scores.map((s) => `${name(s.userId)} ${number(s.points)}`).join(" · ") || when(g.createdAt)}</span>
                  </span>
                  <span className="games__list-state">{g.done ? t("game.done") : t("game.progress", { played: g.played, rounds: g.rounds })}</span>
                  <span className="games__chevron" aria-hidden="true">
                    <IconBack />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
