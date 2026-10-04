/** Icônes au trait, 24 px, dessinées pour Atlas (pas de bibliothèque). */
const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconGlobe = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </svg>
);
export const IconTrips = () => (
  <svg {...base}>
    <path d="M4 19c3-1 4-4 7-4s3 2 5 2 3-1 4-2" />
    <circle cx="6" cy="7" r="2.2" />
    <path d="M6 9.2v3.3M17.5 4.5l2 2-2 2" />
    <path d="M19.5 6.5H13" />
  </svg>
);
export const IconPhotos = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 15-4.5-4.5L8 19" />
  </svg>
);
export const IconBook = () => (
  <svg {...base}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Z" />
    <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6" />
  </svg>
);
export const IconPlus = () => (
  <svg {...base} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconBack = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M15 5 8 12l7 7" />
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
