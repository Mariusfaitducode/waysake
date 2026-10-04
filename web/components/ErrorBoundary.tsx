import { Component, type ReactNode } from "react";
import { EmptyState } from "./EmptyState.js";
import { t } from "../i18n/index.js";

/** Si un écran plante, on l'annonce simplement, sans page blanche. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState title={t("error.screen.title")} text={t("error.screen.text")}>
        <button className="button" onClick={() => location.reload()}>
          {t("common.reload")}
        </button>
      </EmptyState>
    );
  }
}
