/**
 * Icônes au trait, 24 px, dessinées pour Waysake (pas de bibliothèque). Les icônes d'onglet ont une forme
 * `.ic-fill` : transparente au repos, remplie quand l'onglet est actif (comme les symboles « .fill » d'iOS).
 */
const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconGlobe = () => (
  <svg {...base}>
    <circle className="ic-fill" cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </svg>
);
/** Une route en lacets : un départ, deux virages, une arrivée (le chemin du logo, en plus simple). */
export const IconTrips = () => (
  <svg {...base}>
    <path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" />
    <circle className="ic-fill" cx="6" cy="19" r="2.2" />
    <circle className="ic-fill" cx="18" cy="5" r="2.2" />
  </svg>
);
export const IconPhotos = () => (
  <svg {...base}>
    <rect className="ic-fill" x="3" y="4.5" width="18" height="15" rx="3.5" />
    <circle cx="8.8" cy="9.6" r="1.6" />
    <path d="m21 15.5-4.6-4.6L8 19.5" />
  </svg>
);
export const IconBook = () => (
  <svg {...base}>
    <path className="ic-fill" d="M5 4.8A1.8 1.8 0 0 1 6.8 3H19v15H6.8A1.8 1.8 0 0 0 5 19.8Z" />
    <path d="M5 19.8A1.8 1.8 0 0 0 6.8 21.5H19M9 7.5h6" />
  </svg>
);
export const IconPlus = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconBack = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);
/** Chevron vers le bas (tourné par CSS pour monter). */
export const IconChevronDown = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IconMore = () => (
  <svg {...base} strokeWidth={2.4}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" />
  </svg>
);
export const IconClose = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
/** Agrandir : deux flèches vers les coins opposés. */
export const IconExpand = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />
  </svg>
);
export const IconNfc = () => (
  <svg {...base}>
    <path d="M7 8.5a5 5 0 0 1 0 7M10 6a8.5 8.5 0 0 1 0 12M13 3.5a12 12 0 0 1 0 17" />
  </svg>
);
export const IconCheck = () => (
  <svg {...base} strokeWidth={2.4}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconPin = () => (
  <svg {...base}>
    <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const IconPlay = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);
export const IconPostcard = () => (
  <svg {...base} strokeWidth={1.9}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <rect x="14.5" y="8.5" width="3.5" height="4" rx="0.6" />
    <path d="M6.5 10h5M6.5 13h5M6.5 16h3" />
  </svg>
);
export const IconTogether = () => (
  <svg {...base} strokeWidth={2}>
    <circle cx="9" cy="9" r="3.2" />
    <circle cx="16.5" cy="10" r="2.6" />
    <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M14.2 15.1c.7-.4 1.5-.6 2.3-.6 2.1 0 3.7 1.3 4.1 3.8" />
  </svg>
);
export const IconChart = () => (
  <svg {...base}>
    <path d="M4 20h16" />
    <rect className="ic-fill" x="5.5" y="12" width="3" height="5" rx="1" />
    <rect className="ic-fill" x="10.5" y="6" width="3" height="11" rx="1" />
    <rect className="ic-fill" x="15.5" y="9" width="3" height="8" rx="1" />
  </svg>
);
