import { Wordmark } from "../components/Logo.js";
import { useEffect, useState } from "react";
import { api, type User } from "../api.js";
import { inApp } from "../native.js";
import { t } from "../i18n/index.js";
import { Avatar } from "../components/Avatar.js";
import { LanguageSwitch } from "../components/LanguageSwitch.js";
import "./ProfilePicker.css";

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
      <div className="picker__brand">
        <Wordmark size={30} />
      </div>
      <div className="picker__center">
        <h1 className="picker__title">{t("profile.who")}</h1>
        <p className="picker__hint">{t("profile.hint")}</p>
        <ul className="picker__people">
          {users.map((u) => (
            <li key={u.id}>
              <button className="picker__person" onClick={() => pick(u)}>
                <Avatar name={u.name} color={u.color} size={112} className="picker__avatar" />
                <span className="picker__name">{u.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="picker__error">
            {error}
          </p>
        )}
      </div>
      <footer className="picker__foot">
        <LanguageSwitch />
        {locks && (
          <button className="button button--quiet button--small" onClick={lock}>
            {t("profile.lock")}
          </button>
        )}
      </footer>
    </main>
  );
}
