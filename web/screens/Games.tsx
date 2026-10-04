import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type GameMode } from "../api.js";
import { useApi, useAuthorName } from "../data.js";
import { number } from "../format.js";
import { t } from "../i18n/index.js";
import { Header } from "../components/Header.js";
import { Sign } from "../components/Sign.js";
import "./Games.css";

/** Accueil du jeu « Où était-ce ? » : deux modes, les records, les parties récentes. */
export function Games() {
  const { data } = useApi(api.games);
  const navigate = useNavigate();
  const name = useAuthorName();
  const [busy, setBusy] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const modes: { mode: GameMode; title: string; text: string }[] = [
    { mode: "defi", title: t("game.defi"), text: t("game.defi.text") },
    { mode: "enquete", title: t("game.enquete"), text: t("game.enquete.text") },
  ];

  return (
    <div className="games">
      <Header title={t("game.title")} subtitle={t("game.subtitle")} />
      <div className="games__modes">
        {modes.map((m) => (
          <section key={m.mode} className={`games__mode games__mode--${m.mode}`}>
            <Sign as="h2" size="md">{m.title}</Sign>
            <p>{m.text}</p>
            <button className="button" onClick={() => start(m.mode)} disabled={busy !== null}>
              {busy === m.mode ? "…" : t("game.play")}
            </button>
          </section>
        ))}
      </div>
      {error && <p role="alert" className="prompt__error games__error">{error}</p>}

      {data && data.records.length > 0 && (
        <section className="games__block">
          <h2 className="games__h">{t("game.records")}</h2>
          <ol className="games__records">
            {data.records.map((r) => (
              <li key={r.userId}>
                <span>{name(r.userId)}</span>
                <b>{number(r.points)}</b>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data && data.games.length > 0 && (
        <section className="games__block">
          <h2 className="games__h">{t("game.recent")}</h2>
          <ul className="games__list">
            {data.games.map((g) => (
              <li key={g.id}>
                <Link to={`/jeu/${g.id}`}>
                  <span className="games__list-mode">{g.mode === "defi" ? t("game.defi") : t("game.enquete")}</span>
                  <span className="games__list-scores">{g.scores.map((s) => `${name(s.userId)} ${number(s.points)}`).join(", ") || "—"}</span>
                  <span className="games__list-state">{g.done ? t("game.done") : t("game.progress", { played: g.played, rounds: g.rounds })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
