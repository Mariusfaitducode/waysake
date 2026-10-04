import { Link } from "react-router";
import { EmptyState } from "../components/EmptyState.js";

export function NotFound() {
  return (
    <EmptyState title="Cette page n'existe pas." text="Le lien est peut-être ancien. Tous vos voyages sont sur le globe.">
      <Link className="button" to="/">
        Revenir au globe
      </Link>
    </EmptyState>
  );
}
