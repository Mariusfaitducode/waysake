import { useEffect, useState } from "react";
import { api, type User } from "../api.js";
import "./ProfilePicker.css";

export function ProfilePicker({ onPick }: { onPick: (u: User) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.users().then(setUsers, (e) => setError(e.message));
  }, []);

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
        <span>Atlas</span>
      </div>
      <h1 className="picker__title">Qui es-tu ?</h1>
      <p className="picker__hint">On s'en souviendra sur cet appareil.</p>
      <div className="picker__people">
        {users.map((u) => (
          <button key={u.id} className="picker__person" onClick={() => pick(u)} style={{ "--c": u.color } as React.CSSProperties}>
            <span className="picker__avatar" aria-hidden="true">{u.name[0]}</span>
            <span className="picker__name">{u.name}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="picker__error">{error}</p>}
    </main>
  );
}
