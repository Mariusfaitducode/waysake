import { NavLink, Outlet, useLocation } from "react-router";
import type { User } from "../api.js";
import { IconBook, IconGlobe, IconPhotos, IconPlus, IconTrips } from "./icons.js";
import { useUpload } from "./upload.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import "./Shell.css";

const TABS = [
  { to: "/", label: "Globe", icon: IconGlobe, end: true },
  { to: "/voyages", label: "Voyages", icon: IconTrips, end: false },
  { to: "/photos", label: "Photos", icon: IconPhotos, end: false },
  { to: "/carnet", label: "Carnet", icon: IconBook, end: false },
];

export function Shell({ me, onSwitchProfile }: { me: User; onSwitchProfile: () => void }) {
  const { open } = useUpload();
  const { pathname } = useLocation();
  // Sur le globe (bandeau de voyages) et dans un voyage, l'écran appartient aux images : l'ajout passe par l'en-tête.
  const showAdd = pathname !== "/" && !pathname.startsWith("/v/") && !pathname.startsWith("/import/") && pathname !== "/photos/a-localiser";

  // L'écran de validation a sa propre barre d'action : les onglets s'effacent.
  const focused = pathname.startsWith("/import/");
  return (
    <div className={`shell${focused ? " shell--focused" : ""}`}>
      <nav className="tabs" aria-label="Navigation principale" hidden={focused}>
        <div className="tabs__brand" aria-hidden="true">
          <span>Atlas</span>
        </div>
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tabs__item${isActive || (to === "/voyages" && pathname.startsWith("/v/")) ? " is-active" : ""}`}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
        <button className="tabs__me" onClick={onSwitchProfile} style={{ "--c": me.color } as React.CSSProperties} aria-label={`${me.name} — changer de profil`}>
          {me.name[0]}
        </button>
      </nav>
      <main className="shell__main">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      {showAdd && (
        <button className="fab" onClick={open} aria-label="Ajouter des photos">
          <IconPlus />
        </button>
      )}
    </div>
  );
}
