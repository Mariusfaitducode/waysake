import { useEffect, useState } from "react";
import { api, type User } from "../api.js";
import { inApp } from "../native.js";
import { t } from "../i18n/index.js";
import { LanguageSwitch } from "../components/LanguageSwitch.js";
import "./ProfilePicker.css";
import "./Login.css";

export function ProfilePicker({ onPick }: { onPick: (u: User) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locks, setLocks] = useState(false);
  useEffect(() => {
    api.users().then(setUsers, (e) => setError(e.message));
    // Tour protégée par mot de passe : on peut verrouiller cet appareil (l'app a ses propres réglages).
    api.health().then((h) => setLocks(!!h.auth && !inApp()), () => {});
  }, []);

  async function lock() {
    try {
      await api.logout();
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pick(u: User) {
    try {
      onPick((await api.setMe(u.id)).user);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="picker">
      <div className="picker__sign" aria-hidden="true">
        <span>Waysake</span>
      </div>
      <h1 className="picker__title">{t("profile.who")}</h1>
      <p className="picker__hint">{t("profile.hint")}</p>
      <div className="picker__people">
        {users.map((u) => (
          <button key={u.id} className="picker__person" onClick={() => pick(u)} style={{ "--c": u.color } as React.CSSProperties}>
            <span className="picker__avatar" aria-hidden="true">{u.name[0]}</span>
            <span className="picker__name">{u.name}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="picker__error">{error}</p>}
      <div className="picker__lang">
        <LanguageSwitch />
      </div>
      {locks && (
        <button className="button button--quiet button--small picker__lock" onClick={lock}>
          {t("profile.lock")}
        </button>
      )}
    </main>
  );
}
