import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type GameRound, type GuessResult } from "../api.js";
import { useApi } from "../data.js";
import { useProfile } from "../profile.js";
import { number } from "../format.js";
import { t } from "../i18n/index.js";
import { GuessMap, type Pin } from "../components/GuessMap.js";
import { Sign } from "../components/Sign.js";
import { IconBack } from "../shell/icons.js";
import "./GamePlay.css";

const POLL_MS = 3000;

/** Une partie : la photo, la carte, l'épingle ; puis la révélation et la photo suivante. */
export function GamePlay() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { me } = useProfile();
  const { data: game, reload, error } = useApi(() => api.game(id), [id]);
  const { data: users } = useApi(api.users);
  const [cursor, setCursor] = useState<number | null>(null);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // À moi de jouer : en Défi, une photo sans mon épingle ; en Enquête, une photo sans proposition, ou proposée par l'autre.
  const pending = (r: GameRound) =>
    game?.mode === "defi" ? r.answer === null : r.status === "open" || (r.status === "proposed" && r.guesses[0]?.userId !== me.id);
  const next = (after = -1) => game?.rounds.findIndex((r, i) => i > after && pending(r)) ?? -1;

  // Nouvelle partie (revanche) : on repart de zéro.
  useEffect(() => {
    setCursor(null);
    setResult(null);
    setPin(null);
  }, [id]);
  useEffect(() => {
    if (game?.id === id && cursor === null) setCursor(next());
  }, [game, cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  // On suit l'autre joueur (ses épingles, ses confirmations) sans recharger la page.
  useEffect(() => {
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const color = (userId: string) => users?.find((u) => u.id === userId)?.color ?? "#6a7074";
  const name = (userId: string) => users?.find((u) => u.id === userId)?.name ?? userId;
  const round = game && cursor !== null && cursor >= 0 ? game.rounds[cursor] : null;
  const revealed = !!round && (result !== null || !pending(round));

  const pins = useMemo<Pin[]>(() => {
    if (!round) return [];
    const others = round.guesses.map((g) => ({ lat: g.lat, lon: g.lon, color: color(g.userId), label: g.userId === me.id ? t("game.myPin") : name(g.userId) }));
    if (round.answer && (game?.mode === "defi" || round.status === "agreed")) others.push({ lat: round.answer.lat, lon: round.answer.lon, color: "var(--autostrada)", label: t("game.here"), kind: "answer" as const } as Pin);
    return others;
  }, [round, users]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !game) return <p className="play__error">{error}</p>;
  if (!game || game.id !== id || cursor === null) return <div className="play" />;

  async function submit(at: { lat: number; lon: number }) {
    if (!round) return;
    setBusy(true);
    setFailure(null);
    try {
      setResult(await api.guess(game!.id, round.index, at.lat, at.lon));
      setPin(null);
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const goNext = () => {
    setResult(null);
    setPin(null);
    setCursor(next(cursor ?? -1) === -1 ? next() : next(cursor ?? -1));
  };

  // Fin de partie (pour moi) : les scores.
  if (!round) {
    const [first, second] = game.scores;
    const verdict = !first ? "" : game.mode === "defi" && game.scores.length === 1 ? t("game.solo", { points: number(first.points) }) : second && second.points === first.points ? t("game.tie") : t("game.winner", { name: name(first.userId), points: t("game.points", { count: first.points }) });
    return (
      <div className="play play--end">
        <Sign as="h1" size="lg">{t("game.end")}</Sign>
        <ol className="play__scores">
          {game.scores.map((s) => (
            <li key={s.userId} style={{ "--c": color(s.userId) } as React.CSSProperties}>
              <span>{name(s.userId)}</span>
              <b>{number(s.points)}</b>
            </li>
          ))}
        </ol>
        {verdict && <p className="play__verdict">{verdict}</p>}
        <div className="play__end-actions">
          <button className="button" onClick={() => api.newGame(game.mode).then(({ id: next }) => navigate(`/jeu/${next}`), (e) => setFailure((e as Error).message))}>
            {t("game.again")}
          </button>
          <Link className="button button--quiet" to="/jeu">
            {t("game.back")}
          </Link>
        </div>
        {failure && <p role="alert" className="prompt__error">{failure}</p>}
      </div>
    );
  }

  const proposal = game.mode === "enquete" && round.status === "proposed" ? round.guesses[0] : null;
  const mine = round.guesses.find((g) => g.userId === me.id);
  const shownResult = result ?? (mine ? { status: round.status, km: mine.km, points: mine.points, answer: round.answer } : null);

  return (
    <div className="play">
      <header className="play__top">
        <Link className="icon-button" to="/jeu" aria-label={t("game.back")}>
          <IconBack />
        </Link>
        <span className="play__round">{t("game.round", { n: round.index + 1, total: game.rounds.length })}</span>
        <span className="play__chips">
          {game.scores.map((s) => (
            <span key={s.userId} className="play__chip" style={{ "--c": color(s.userId) } as React.CSSProperties}>
              {name(s.userId)} <b>{number(s.points)}</b>
            </span>
          ))}
        </span>
      </header>

      <figure className="play__photo">
        <img key={round.media.id} src={round.media.preview} alt="" />
      </figure>

      <div className="play__map">
        <GuessMap round={round.index} pin={revealed ? null : pin} pins={revealed || proposal ? pins : []} onPick={revealed ? undefined : (lat, lon) => setPin({ lat, lon })} />
      </div>

      <footer className="play__bar" aria-live="polite">
        {revealed && shownResult ? (
          <>
            <p className="play__result">
              {game.mode === "defi" ? (
                <>
                  <b>{t("game.gain", { points: number(shownResult.points) })}</b> {shownResult.km !== null && t("game.km", { km: number(shownResult.km) })}
                </>
              ) : shownResult.status === "agreed" ? (
                t("game.agreed", { photos: t("count.photos", { count: round.momentSize }) })
              ) : shownResult.status === "disagreed" ? (
                t("game.disagreed", { km: number(shownResult.km ?? 0) })
              ) : (
                t("game.waitOther")
              )}
            </p>
            <button className="button" onClick={goNext}>
              {t("game.next")}
            </button>
          </>
        ) : (
          <>
            <p className="play__hint">{proposal ? t("game.proposedBy", { name: name(proposal.userId) }) : t("game.tapMap")}</p>
            {proposal && (
              <button className="button button--quiet" onClick={() => submit(proposal)} disabled={busy}>
                {t("game.confirm")}
              </button>
            )}
            <button className="button" onClick={() => pin && submit(pin)} disabled={!pin || busy}>
              {t("game.validate")}
            </button>
          </>
        )}
        {failure && <p role="alert" className="prompt__error">{failure}</p>}
      </footer>
    </div>
  );
}
