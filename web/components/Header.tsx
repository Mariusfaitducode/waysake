import type { ReactNode } from "react";
import { useProfile } from "../profile.js";
import { t } from "../i18n/index.js";
import { Avatar } from "./Avatar.js";
import "./Header.css";

/** Grand titre façon iOS, en Geist. L'avatar (téléphone) permet de changer de profil. */
export function Header({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const { me, switchProfile } = useProfile();
  return (
    <header className="header">
      <div className="header__row">
        <h1 className="header__title">{title}</h1>
        <div className="header__actions">
          {actions}
          <button className="header__me" onClick={switchProfile} aria-label={t("profile.switch", { name: me.name })}>
            <Avatar name={me.name} color={me.color} size={34} />
          </button>
        </div>
      </div>
      {subtitle && <p className="header__subtitle">{subtitle}</p>}
    </header>
  );
}
