import type { ReactNode } from "react";
import { useProfile } from "../profile.js";
import "./Header.css";

/** Grand titre façon iOS, en caractères de panneau routier. L'avatar (mobile) permet de changer de profil. */
export function Header({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const { me, switchProfile } = useProfile();
  return (
    <header className="header">
      <div className="header__row">
        <h1 className="header__title">{title}</h1>
        <div className="header__actions">
          {actions}
          <button className="header__me" onClick={switchProfile} style={{ "--c": me.color } as React.CSSProperties} aria-label={`${me.name} — changer de profil`}>
            {me.name[0]}
          </button>
        </div>
      </div>
      {subtitle && <p className="header__subtitle">{subtitle}</p>}
    </header>
  );
}
