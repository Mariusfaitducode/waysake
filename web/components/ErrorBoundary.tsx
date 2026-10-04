import { Component, type ReactNode } from "react";
import { EmptyState } from "./EmptyState.js";

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
      <EmptyState title="Cet écran n'a pas pu s'afficher." text="Vos photos sont en sécurité sur la tour. Recharge la page pour réessayer.">
        <button className="button" onClick={() => location.reload()}>
          Recharger
        </button>
      </EmptyState>
    );
  }
}
