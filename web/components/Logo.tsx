import { useId } from "react";
import { GLYPH_CENTER, PIN, START, W_PATH, W_STROKE } from "../brand.js";
import "./Logo.css";

/**
 * Glyphe de Waysake (chemin en W). Le trait suit `currentColor` (Encre par défaut), l'épingle reste corail.
 * Décoratif par défaut : passer `label` quand le logo est seul porteur de sens (lien d'accueil sans texte).
 */
export function Logo({ size = 28, label, className }: { size?: number; label?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const mask = `ws-hole-${id}`;
  return (
    <svg
      className={`logo${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="#fff" />
        <circle cx={PIN.cx} cy={PIN.cy} r={PIN.hole} fill="#000" />
      </mask>
      <g transform={GLYPH_CENTER} mask={`url(#${mask})`}>
        <path d={W_PATH} fill="none" stroke="currentColor" strokeWidth={W_STROKE} strokeLinecap="round" />
        <circle cx={START.cx} cy={START.cy} r={START.r} fill="currentColor" />
        <circle cx={PIN.cx} cy={PIN.cy} r={PIN.r} fill="var(--brand-pin)" />
      </g>
    </svg>
  );
}

/** Glyphe + « Waysake » en Geist. `size` : hauteur du glyphe en px ; le texte suit. */
export function Wordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={`wordmark${className ? ` ${className}` : ""}`} style={{ fontSize: size * 0.72 }}>
      <Logo size={size} />
      <span className="wordmark__name">Waysake</span>
    </span>
  );
}
