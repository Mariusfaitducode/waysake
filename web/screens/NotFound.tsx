import { Link } from "react-router";
import { EmptyState } from "../components/EmptyState.js";
import { Logo } from "../components/Logo.js";
import { t } from "../i18n/index.js";

export function NotFound() {
  return (
    <EmptyState title={t("error.notFound.title")} text={t("error.notFound.text")} icon={<Logo size={40} />}>
      <Link className="button" to="/">
        {t("error.notFound.action")}
      </Link>
    </EmptyState>
  );
}
