import type { CSSProperties } from "react";
import "./Avatar.css";

/**
 * Monogramme d'un profil, façon Contacts : un gris doux à peine teinté par la couleur du profil (qui vient de la
 * base, telle quelle). La couleur n'est jamais seule : le nom est toujours écrit à côté ou dans l'aria-label.
 */
export function Avatar({ name, color, size = 36, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span className={`avatar${className ? ` ${className}` : ""}`} style={{ "--c": color ?? "var(--text-muted)", "--size": `${size}px` } as CSSProperties} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
