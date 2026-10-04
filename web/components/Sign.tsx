import type { ReactNode } from "react";
import "./Sign.css";

/** Panneau d'autoroute : fond vert, liseré blanc intérieur. L'unique ornement de Waysake. */
export function Sign({ children, size = "md", as: Tag = "span" }: { children: ReactNode; size?: "sm" | "md" | "lg"; as?: "span" | "h1" | "h2" }) {
  return (
    <Tag className={`sign sign--${size}`}>
      <span className="sign__inner">{children}</span>
    </Tag>
  );
}
