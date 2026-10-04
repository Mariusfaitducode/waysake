import type { ReactNode } from "react";
import "./EmptyState.css";

/** État vide : une icône discrète (facultative), un titre, une phrase, puis l'action. Styles de base : `.empty` (base.css). */
export function EmptyState({ title, text, icon, children }: { title: string; text: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <section className="empty">
      {icon && (
        <div className="empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </section>
  );
}
