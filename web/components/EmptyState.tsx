import type { ReactNode } from "react";

export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <section className="empty">
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </section>
  );
}
