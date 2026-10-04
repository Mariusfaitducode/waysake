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
      <div className="picker__sign" aria-hidden="true">
        <span>Waysake</span>
      </div>
      <h1 className="picker__title">{t("login.title")}</h1>
      <p className="picker__hint">{t("login.hint")}</p>
      <form className="login" onSubmit={submit}>
        <input
          className="login__input"
          type="password"
          name="password"
          autoComplete="current-password"
          aria-label={t("login.label")}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="button" type="submit" disabled={!password || busy}>
          {busy ? t("login.busy") : t("login.submit")}
        </button>
      </form>
      {error && (
        <p role="alert" className="picker__error">
          {/* Relu dans la langue courante : on peut changer de langue après une erreur. */}
          {error instanceof ApiError ? errorMessage(error.body) : error.message}
        </p>
      )}
      <div className="picker__lang">
        <LanguageSwitch />
      </div>
    </main>
  );
}
