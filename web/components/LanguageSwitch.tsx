import { setLocale, t, useLocale, type Locale } from "../i18n/index.js";
import "./LanguageSwitch.css";

const LOCALES: Locale[] = ["fr", "en"];

/** Français / English, mémorisé sur cet appareil. Chaque langue s'écrit dans sa propre langue. */
export function LanguageSwitch() {
  const current = useLocale();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      {LOCALES.map((l) => (
        <button key={l} lang={l} className="lang-switch__item" aria-pressed={current === l} onClick={() => setLocale(l)}>
          {t(l === "fr" ? "lang.fr" : "lang.en")}
        </button>
      ))}
    </div>
  );
}
