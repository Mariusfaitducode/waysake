import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api, type Media } from "../api.js";
import { useApi } from "../data.js";
import { fullDate } from "../format.js";
import { t } from "../i18n/index.js";
import { localizeTrip, placeTitle } from "../i18n/places.js";
import { Sign } from "../components/Sign.js";
import { IconBack, IconClose } from "../shell/icons.js";
import { PHOTO_MS, SIGN_MS, routeSvg, slideshowPlan } from "../slideshow.js";
import "./Slideshow.css";

const IDLE_MS = 3000;

/**
 * Diaporama d'un voyage, pensé pour la télé : plein écran, une photo toutes les 5 s, un panneau entre deux
 * étapes, une mini-carte qui avance. Télécommande : ← → pour changer, OK/Espace pour la pause, Retour pour sortir.
 */
export function Slideshow() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { data: raw } = useApi(() => api.trip(slug), [slug]);
  const trip = useMemo(() => raw && localizeTrip(raw), [raw]);
  const [short, setShort] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [chrome, setChrome] = useState(true);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  const slides = useMemo(() => (trip ? slideshowPlan(trip, { short }) : []), [trip, short]);
  const slide = slides[index];
  const ended = trip !== null && index >= slides.length;
  const exit = useCallback(() => (history.length > 1 ? navigate(-1) : navigate(`/v/${slug}`)), [navigate, slug]);
  const go = useCallback((d: number) => setIndex((i) => Math.min(Math.max(i + d, 0), slides.length)), [slides.length]);

  // Les contrôles apparaissent au moindre geste, puis s'effacent.
  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setChrome(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(idle.current);
  }, [wake]);

  // Avance automatique.
  useEffect(() => {
    if (!playing || !slide) return;
    const timer = setTimeout(() => go(1), slide.kind === "sign" ? SIGN_MS : PHOTO_MS);
    return () => clearTimeout(timer);
  }, [playing, slide, go]);

  // Télécommande et clavier.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      wake();
      if (e.key === "ArrowRight" || e.key === "MediaTrackNext") go(1);
      else if (e.key === "ArrowLeft" || e.key === "MediaTrackPrevious") go(-1);
      else if (e.key === " " || e.key === "MediaPlayPause" || (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON")) setPlaying((p) => !p);
      else if (e.key === "Escape" || e.key === "Backspace" || e.key === "GoBack") exit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, exit, wake]);

  // L'écran reste allumé pendant la lecture (si le navigateur le permet).
  useEffect(() => {
    if (!playing || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
    void request();
    const again = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, [playing]);

  // Précharge la photo suivante.
  useEffect(() => {
    const next = slides.slice(index + 1).find((s) => s.kind === "photo");
    if (next?.kind === "photo") new Image().src = next.media.preview;
  }, [index, slides]);

  useEffect(() => {
    if (trip) document.title = `${trip.title}, ${t("slideshow.title")} — Waysake`;
    return () => void (document.title = "Waysake");
  }, [trip]);

  const map = useMemo(() => {
    if (!trip) return null;
    return routeSvg(trip.route, trip.chapters.map((c) => [c.centerLon, c.centerLat]), 220, 140);
  }, [trip]);

  if (!trip) return <div className="slideshow" />;
  const chapter = slide ? trip.chapters[slide.chapter] : null;

  return (
    <div className={`slideshow${chrome ? "" : " is-idle"}`} onPointerMove={wake} onClick={wake}>
      {slide?.kind === "photo" && <Photo key={`${slide.media.id}-${index}`} media={slide.media} />}
      {slide?.kind === "sign" && chapter && (
        <div key={`sign-${index}`} className="slideshow__sign">
          <span className="slideshow__exit">{t("slideshow.stop", { n: slide.chapter + 1 })}</span>
          <Sign as="h1" size="lg">{chapter.title}</Sign>
          {chapter.places.length > 0 && <p>{chapter.places.map((p) => placeTitle(p)).join(", ")}</p>}
        </div>
      )}
      {ended && (
        <div className="slideshow__sign">
          <Sign as="h1" size="lg">{trip.title}</Sign>
          <p>{t("slideshow.end")}</p>
          <div className="slideshow__end">
            <button className="button" autoFocus onClick={() => setIndex(0)}>
              {t("slideshow.again")}
            </button>
            <button className="button button--quiet slideshow__quiet" onClick={exit}>
              {t("slideshow.back")}
            </button>
          </div>
        </div>
      )}

      {slide?.kind === "photo" && chapter && (
        <div className="slideshow__caption">
          <strong>{chapter.title}</strong>
          {slide.media.note && <span className="slideshow__note">{slide.media.note}</span>}
          {slide.media.takenAtLocal && <span>{fullDate(slide.media.takenAtLocal)}</span>}
        </div>
      )}

      {map && map.path && slide && (
        <svg className="slideshow__map" viewBox="0 0 220 140" aria-hidden="true">
          <path d={map.path} className="slideshow__route" />
          {map.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === slide.chapter ? 7 : 4} className={i <= slide.chapter ? "is-done" : ""} />
          ))}
        </svg>
      )}

      {slides.length > 0 && (
        <div className="slideshow__progress" aria-hidden="true">
          <span style={{ width: `${(Math.min(index + 1, slides.length) / slides.length) * 100}%` }} />
        </div>
      )}

      <div className="slideshow__bar">
        <button className="icon-button icon-button--glass slideshow__button" onClick={exit} aria-label={t("slideshow.back")}>
          <IconClose />
        </button>
        <span className="slideshow__trip">{trip.title}</span>
        <button className="slideshow__toggle" onClick={() => (setShort((s) => !s), setIndex(0))} aria-pressed={short}>
          {short ? t("slideshow.full") : t("slideshow.short")}
        </button>
        {document.fullscreenEnabled && (
          <button className="slideshow__toggle" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
            {t("slideshow.fullscreen")}
          </button>
        )}
      </div>

      <div className="slideshow__controls">
        <button className="icon-button icon-button--glass slideshow__button" onClick={() => go(-1)} aria-label={t("viewer.prev")}>
          <IconBack />
        </button>
        <button className="slideshow__play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t("slideshow.pause") : t("slideshow.play")}>
          {playing ? <span className="slideshow__pause-icon" aria-hidden="true" /> : <span className="slideshow__play-icon" aria-hidden="true" />}
        </button>
        <button className="icon-button icon-button--glass slideshow__button slideshow__next" onClick={() => go(1)} aria-label={t("viewer.next")}>
          <IconBack />
        </button>
      </div>
    </div>
  );
}

/** Une photo plein écran, avec un lent mouvement de caméra (sauf si l'on préfère moins d'animations). */
function Photo({ media }: { media: Media }) {
  const [loaded, setLoaded] = useState(false);
  const landscape = (media.width ?? 4) >= (media.height ?? 3);
  return (
    <div className={`slideshow__photo${loaded ? " is-loaded" : ""}`}>
      <img src={media.preview} alt="" className="slideshow__blur" aria-hidden="true" />
      <img src={media.preview} alt={media.note ?? ""} className={`slideshow__img${landscape ? " is-landscape" : ""}`} onLoad={() => setLoaded(true)} />
    </div>
  );
}
