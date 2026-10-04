import { Link, NavLink, Outlet, useLocation } from "react-router";
import type { User } from "../api.js";
import { IconBook, IconChart, IconGlobe, IconPhotos, IconPlus, IconTrips } from "./icons.js";
import { useUpload } from "./upload.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { LiveInvite } from "../components/LiveInvite.js";
import { Logo } from "../components/Logo.js";
import { Avatar } from "../components/Avatar.js";
import { t } from "../i18n/index.js";
import "./Shell.css";

const TABS = [
  { to: "/", label: "nav.globe" as const, icon: IconGlobe, end: true },
  { to: "/voyages", label: "nav.trips" as const, icon: IconTrips, end: false },
  { to: "/photos", label: "nav.photos" as const, icon: IconPhotos, end: false },
  { to: "/carnet", label: "nav.notebook" as const, icon: IconBook, end: false },
];

export function Shell({ me, onSwitchProfile }: { me: User; onSwitchProfile: () => void }) {
  const { open } = useUpload();
  const { pathname } = useLocation();
  // Sur le globe (bandeau de voyages) et dans un voyage, l'écran appartient aux images : l'ajout passe par l'en-tête.
  const showAdd = pathname !== "/" && !pathname.startsWith("/v/") && !pathname.startsWith("/import/") && pathname !== "/photos/a-localiser" && !pathname.startsWith("/jeu");

  // L'écran de validation a sa propre barre d'action : les onglets s'effacent.
  const focused = pathname.startsWith("/import/");
  return (
    <div className={`shell${focused ? " shell--focused" : ""}`}>
      <nav className="tabs" aria-label={t("nav.main")} hidden={focused}>
        <Link to="/" className="tabs__brand" aria-label="Waysake" title="Waysake">
          <Logo size={30} />
        </Link>
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tabs__item${isActive || (to === "/voyages" && pathname.startsWith("/v/")) ? " is-active" : ""}`}>
            <Icon />
            <span className="tabs__label">{t(label)}</span>
          </NavLink>
        ))}
        {/* Sur ordinateur, un accès discret aux statistiques du foyer au-dessus du profil ; sur téléphone, depuis le Carnet. */}
        <NavLink to="/stats" className={({ isActive }) => `tabs__extra${isActive ? " is-active" : ""}`} aria-label={t("household.title")} title={t("household.title")}>
          <IconChart />
        </NavLink>
        <button className="tabs__me" onClick={onSwitchProfile} aria-label={t("profile.switch", { name: me.name })} title={me.name}>
          <Avatar name={me.name} color={me.color} size={36} />
        </button>
      </nav>
      <main className="shell__main">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <LiveInvite />
      {showAdd && (
        <button className="fab" onClick={open} aria-label={t("common.addPhotos")}>
          <IconPlus />
        </button>
      )}
    </div>
  );
}
