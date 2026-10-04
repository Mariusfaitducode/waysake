import { Wordmark } from "../components/Logo.js";
import { useState } from "react";
import { api, ApiError, errorMessage } from "../api.js";
import { t } from "../i18n/index.js";
import { LanguageSwitch } from "../components/LanguageSwitch.js";
import "./ProfilePicker.css";
import "./Login.css";

/** La tour est protégée par le mot de passe du foyer (WAYSAKE_PASSWORD) : on le demande avant le choix du profil. */
export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      setError(err as Error);
      setBusy(false);
    }
  }

  return (
    <main className="picker">
      <div className="picker__brand">
        <Wordmark size={30} />
      </div>
      <div className="picker__center">
        <h1 className="picker__title">{t("login.title")}</h1>
        <p className="picker__hint">{t("login.hint")}</p>
        <form className="login" onSubmit={submit}>
          <input
            className="login__input"
            type="password"
            name="password"
            autoComplete="current-password"
            aria-label={t("login.label")}
            placeholder={t("login.label")}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="login__submit" type="submit" disabled={!password || busy} aria-label={busy ? t("login.busy") : t("login.submit")} title={t("login.submit")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        {error && (
          <p role="alert" className="login__error">
            {/* Relu dans la langue courante : on peut changer de langue après une erreur. */}
            {error instanceof ApiError ? errorMessage(error.body) : error.message}
          </p>
        )}
      </div>
      <footer className="picker__foot">
        <LanguageSwitch />
      </footer>
    </main>
  );
}
