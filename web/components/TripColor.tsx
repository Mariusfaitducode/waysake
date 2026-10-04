import { useId } from "react";
import { t, useLocale } from "../i18n/index.js";
import { IconCheck, IconPhotos } from "../shell/icons.js";
import { safeTripColor, TRIP_COLOR_IDS, tripStyle, type TripColorId } from "../trip-colors.js";
import "./TripColor.css";

/**
 * Composants de la couleur de voyage (direction Horizon). Règle : la couleur n'est jamais seule —
 * une pastille accompagne toujours un nom de voyage, ou écrit le nom de la couleur.
 */

export const tripColorName = (color: unknown) => t(`tripColor.${safeTripColor(color)}` as const);

/** Petite pastille ronde devant un titre de voyage. Décorative (le titre porte le sens) sauf si `labelled`. */
export function TripColorDot({ color, size = 10, labelled = false }: { color: unknown; size?: number; labelled?: boolean }) {
  useLocale();
  return (
    <i
      className="trip-dot"
      style={{ ...tripStyle(color), width: size, height: size }}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? tripColorName(color) : undefined}
      aria-hidden={labelled ? undefined : true}
    />
  );
}

/** Étiquette : le nom de la couleur sur un fond légèrement teinté (liste des voyages, filtres actifs). */
export function TripColorTag({ color, dot = false }: { color: unknown; dot?: boolean }) {
  useLocale();
  return (
    <span className="trip-tag" style={tripStyle(color)}>
      {dot && <i className="trip-dot" aria-hidden />}
      {tripColorName(color)}
    </span>
  );
}

/**
 * Puce de filtre par couleur (« Tous », puis une puce par couleur présente). `color` absent : la puce « Tous ».
 * Bouton bascule : `pressed` dit si le filtre est actif.
 */
export function TripColorFilter({ color, label, pressed, onClick }: { color?: TripColorId; label?: string; pressed: boolean; onClick: () => void }) {
  useLocale();
  return (
    <button type="button" className="trip-filter" aria-pressed={pressed} onClick={onClick} style={color ? tripStyle(color) : undefined}>
      {color && <i className="trip-dot" aria-hidden />}
      {label ?? (color ? tripColorName(color) : "")}
    </button>
  );
}

/**
 * Sélecteur de la couleur d'un voyage : « Automatique » (d'après la couverture) puis les dix teintes.
 * `value` null = automatique ; `autoColor` est la teinte qu'Automatique donne aujourd'hui.
 * Appelle `onChange(id)` pour figer une teinte, `onChange(null)` pour revenir à l'automatique
 * (côté API : api.setTripColor(slug, color)).
 */
export function TripColorPicker({
  value,
  autoColor,
  onChange,
  disabled = false,
}: {
  value: TripColorId | null;
  autoColor: TripColorId;
  onChange: (color: TripColorId | null) => void;
  disabled?: boolean;
}) {
  useLocale();
  const current = value ?? autoColor;
  const titleId = useId();
  return (
    <div className="trip-picker" role="group" aria-labelledby={titleId}>
      <div className="trip-picker__head">
        <b id={titleId}>{t("tripColor.title")}</b>
        <span>{value ? tripColorName(current) : t("tripColor.autoName", { name: tripColorName(current) })}</span>
      </div>
      <button type="button" className="trip-picker__auto" aria-pressed={value === null} disabled={disabled} onClick={() => onChange(null)} style={tripStyle(autoColor)}>
        <IconPhotos />
        <span>
          {t("tripColor.auto")}
          <small>{t("tripColor.autoHint")}</small>
        </span>
        <i className="trip-picker__auto-swatch" aria-hidden />
      </button>
      <div className="trip-picker__grid">
        {TRIP_COLOR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="trip-picker__swatch"
            style={tripStyle(id)}
            aria-pressed={value === id}
            aria-label={tripColorName(id)}
            title={tripColorName(id)}
            disabled={disabled}
            onClick={() => onChange(id)}
          >
            <IconCheck />
          </button>
        ))}
      </div>
    </div>
  );
}
