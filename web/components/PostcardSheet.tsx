import { useState } from "react";
import { locale, t } from "../i18n/index.js";
import { Sheet } from "./Sheet.js";
import "./PostcardSheet.css";

/** Carte postale d'un voyage, dessinée par la tour : aperçu, téléchargement, partage (feuille du téléphone). */
export function PostcardSheet({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const url = `/api/trips/${encodeURIComponent(slug)}/postcard.jpg?lang=${locale()}&title=${encodeURIComponent(title)}`;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShareFiles = typeof navigator.canShare === "function";

  async function share() {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `${slug}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title });
      else location.href = url;
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    }
  }

  return (
    <Sheet title={t("postcard.title")} onClose={onClose}>
      <p className="sheet__meta postcard__hint">{t("postcard.hint")}</p>
      <div className={`postcard${loaded ? " is-loaded" : ""}`}>
        {!loaded && <span className="postcard__wait">{t("postcard.loading")}</span>}
        <img src={url} alt={title} onLoad={() => setLoaded(true)} />
      </div>
      {error && <p role="alert" className="prompt__error">{error}</p>}
      <div className="prompt__actions">
        <a className="button button--quiet" href={url} download={`${slug}.jpg`}>
          {t("postcard.download")}
        </a>
        {canShareFiles && (
          <button className="button" onClick={share} disabled={!loaded}>
            {t("postcard.share")}
          </button>
        )}
      </div>
    </Sheet>
  );
}
