import { useState } from "react";
import { api } from "../api.js";
import "./ProfilePicker.css";
import "./Login.css";

/** La tour est protégée par le mot de passe du foyer (ATLAS_PASSWORD) : on le demande avant le choix du profil. */
export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="picker">
      <div className="picker__sign" aria-hidden="true">
        <span>Atlas</span>
      </div>
      <h1 className="picker__title">Mot de passe</h1>
      <p className="picker__hint">Celui du foyer. On s'en souviendra sur cet appareil.</p>
      <form className="login" onSubmit={submit}>
        <input
          className="login__input"
          type="password"
          name="password"
          autoComplete="current-password"
          aria-label="Mot de passe du foyer"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="button" type="submit" disabled={!password || busy}>
          {busy ? "Un instant…" : "Entrer"}
        </button>
      </form>
      {error && <p role="alert" className="picker__error">{error}</p>}
    </main>
  );
}
