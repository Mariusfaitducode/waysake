import type { TripColorId } from "./trip-colors.js";
import { t } from "./i18n/index.js";
import { fr } from "./i18n/fr.js";
import { suggestIds } from "./format.js";
// Mode démo statique (pnpm build:demo) ; `null` dans le build normal, où vite.config.ts substitue web/demo/off.ts.
import { demo } from "./demo/runtime.js";

export { demo };

export type User = { id: string; name: string; color: string };
export type Media = {
  id: number;
  kind: "photo" | "video";
  width: number | null;
  height: number | null;
  takenAt: number | null;
  takenAtLocal: string | null;
  lat: number | null;
  lon: number | null;
  /** D'où vient le lieu : on ne peut poser ou corriger que « manual » et « game », ou une photo sans lieu. */
  locationSource?: "exif" | "phone" | "manual" | "game" | null;
  uploadedBy: string;
  hasThumbs: boolean;
  place?: string | null;
  thumb: string;
  preview: string;
  original: string;
  /** Qui a réagi, par réaction (identifiants de profils). */
  reactions?: Partial<Record<Reaction, string[]>>;
  /** Légende partagée. */
  note?: string | null;
};
export const REACTIONS = ["❤️", "😂", "🤩", "😮"] as const;
export type Reaction = (typeof REACTIONS)[number];
export type MemoryGroup = { year: number; yearsAgo: number; count: number; trip: { slug: string; title: string } | null; media: Media[] };
export type TripStats = {
  km: number;
  days: number;
  countries: number;
  photos: number;
  topChapter: { id: number; title: string; count: number } | null;
  topDay: { day: string; count: number } | null;
  byUser: { userId: string; count: number; share: number }[];
};
export type GameMode = "defi" | "enquete";
export type GameGuess = { userId: string; lat: number; lon: number; km: number | null; points: number };
export type GameRound = {
  index: number;
  status: "open" | "proposed" | "agreed" | "disagreed";
  media: { id: number; width: number | null; height: number | null; thumb: string; preview: string };
  takenAtLocal: string | null;
  momentSize: number;
  answer: { lat: number; lon: number } | null;
  guesses: GameGuess[];
};
export type GameScore = { userId: string; points: number; rounds: number };
export type Game = { id: number; mode: GameMode; createdBy: string; createdAt: number; rounds: GameRound[]; scores: GameScore[] };
export type GameSummary = { id: number; mode: GameMode; createdBy: string; createdAt: number; rounds: number; played: number; done: boolean; scores: GameScore[] };
export type GuessResult = { status: GameRound["status"]; km: number | null; points: number; answer: { lat: number; lon: number } | null };
export type Social = { reactions: Partial<Record<Reaction, string[]>>; note: string | null };
export type TripSummary = {
  id: number;
  slug: string;
  /** Nombre d'étapes, donné par la liste des voyages seulement. */
  chapterCount?: number;
  /** Itinéraire ([lon, lat] par jour), donné par la liste des voyages (globe). */
  route?: [number, number][];
  title: string;
  autoTitle: string;
  startAt: number;
  endAt: number;
  centerLat: number;
  centerLon: number;
  countryCodes: string[];
  mediaCount: number;
  coverMediaId: number | null;
  cover: string | null;
  coverLarge: string | null;
  /** Couleur effective du voyage (palette Horizon) : choix manuel, sinon automatique. */
  color: TripColorId;
  /** true quand la couleur suit la couverture (« Automatique »). */
  colorAuto: boolean;
  /** La teinte que donnerait « Automatique ». */
  autoColor: TripColorId;
};
export type Chapter = {
  id: number;
  title: string;
  autoTitle: string;
  places: string[];
  countryCodes: string[];
  startAt: number;
  endAt: number;
  centerLat: number;
  centerLon: number;
  media: Media[];
};
/** Une étape vue du globe de près : sa position, la couleur de son voyage et 1 à 3 miniatures. */
export type GlobeStop = { tripSlug: string; color: TripColorId; chapterId: number; title: string; lat: number; lon: number; thumbs: string[] };
export type Note = { chapterId: number | null; body: string; author: string; updatedAt: number };
export type Trip = TripSummary & { route: [number, number][]; chapters: Chapter[]; notes: Note[]; favorites: number[] };
/** Lieu de vie (ville habitée, maison de famille) : ses photos ne font pas de voyages, elles sont rangées par période. */
export type LifePlaceSummary = {
  id: number;
  slug: string;
  title: string;
  autoTitle: string;
  lat: number;
  lon: number;
  status: "auto" | "confirmed" | "rejected";
  mediaCount: number;
  startAt: number | null;
  endAt: number | null;
  /** Nombre de périodes (séjours continus). */
  periods: number;
  coverMediaId: number | null;
  cover: string | null;
  coverLarge: string | null;
};
export type LifePeriod = { startAt: number; endAt: number; count: number; media: Media[] };
export type LifePlace = Omit<LifePlaceSummary, "periods"> & { periodCount: number; periods: LifePeriod[] };
export type Country = { code: string; name: string; flag: string; trips: number; firstVisit: number; photos: number };
export type Overview = { countries: number; trips: number; photos: number; videos: number; km: number };
export type Wish = {
  id: number;
  title: string;
  countryCode: string | null;
  flag: string | null;
  lat: number | null;
  lon: number | null;
  month: string | null;
  note: string;
  author: string;
  done: boolean;
  doneTrip: { slug: string; title: string } | null;
};
export type JournalNote = {
  body: string;
  author: string;
  updatedAt: number;
  chapterId: number | null;
  chapterTitle: string | null;
  trip: { slug: string; title: string; cover: string | null };
};
export type ImportMedia = {
  id: number;
  kind: "photo" | "video";
  width: number | null;
  height: number | null;
  takenAtLocal: string | null;
  people: number | null;
  excluded: boolean;
  hasThumbs: boolean;
  thumb: string;
  preview: string;
};
export type ProposedTrip = {
  title: string;
  countryCodes: string[];
  startAt: number;
  endAt: number;
  route: [number, number][];
  /** Couleur que prendra le voyage une fois importé, calculée par la tour sur la couverture. */
  color: TripColorId;
  cover: string | null;
  coverLarge: string | null;
  count: number;
  withPeople: number;
  chapters: { title: string; places: string[]; startAt: number; endAt: number; centerLat: number; centerLon: number; count: number }[];
  media: ImportMedia[];
};
export type Proposal = {
  id: number;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: number;
  keepHome: boolean;
  counts: { received: number; duplicates: number; toImport: number; withPeople: number };
  newTrips: ProposedTrip[];
  extendedTrips: { slug: string; title: string; added: number }[];
  setAside: { screenshots: ImportMedia[]; home: ImportMedia[] };
  otherPhotos: ImportMedia[];
};
export type UnlocatedMedia = { id: number; kind: "photo" | "video"; width: number | null; height: number | null; hasThumbs: boolean; thumb: string; preview: string; original: string; uploadedBy: string; takenAtLocal: string };
/** Le lieu le plus proche d'un point posé sur la carte (null en pleine mer). */
/** Lieu suggéré pour un groupe de photos (GET /api/places/suggest). */
export type PlaceSuggestion = { name: string; country: string; countryCode: string; flag: string | null; lat: number; lon: number; count: number };
export type ReversePlace = { lat: number; lon: number; name: string | null; country: string | null; countryCode: string | null; flag: string | null };
export type UnlocatedDay = { day: string; count: number; moments: { start: string; end: string; ids: number[]; count: number }[]; media: UnlocatedMedia[] };
export type PlaceHit = { kind: "country" | "region" | "place"; name: string; country: string; countryCode: string; lat: number; lon: number; flag: string };

/** Place sur la tour (GET /api/space). */
export type Space = {
  disk: { free: number; total: number };
  used: { originals: number; derived: number; database: number; total: number };
  monthly: { bytes: number; items: number };
  forecast: { months: number | null; fullAt: number | null };
};
/** Page « Statistiques » (GET /api/stats/overview). Le trafic est en mémoire : il repart de zéro à chaque démarrage. */
export type StatsOverview = {
  uploads: { totals: { photos: number; videos: number; bytes: number }; months: { month: string; total: number; byUser: Record<string, number> }[] };
  people: { userId: string; photos: number; videos: number; bytes: number; lastUploadAt: number | null; reactions: number | null; share: number }[];
  backup: {
    snapshots: number;
    lastSnapshotAt: number | null;
    external: { at: string | null; ok: boolean; reason: "ok" | "failed" | "disk_missing" | "unknown" } | null;
  };
  traffic: {
    since: number;
    days: { day: string; requests: number }[];
    served: { photos: number; videos: number; previews: number };
    uploads: { count: number; bytes: number };
    people: { userId: string; requests: number; visits: number; lastSeen: number }[];
  };
  access: { password: boolean; users: User[]; devices: { count: number; latestAt: number | null } | null };
  app: {
    version: { commit: string; date: string } | null;
    startedAt: number;
    uptime: number;
    node: string;
    database: number;
    library: { trips: number; chapters: number; countries: number; unlocated: number };
  };
};

/** La tour demande le mot de passe du foyer (WAYSAKE_PASSWORD) : session absente, fermée ou mot de passe changé. */
export class AuthRequiredError extends Error {}
export const AUTH_EVENT = "waysake:auth-required";

/**
 * La tour renvoie `{ error, code }` : `error` est un texte français, `code` un identifiant stable
 * que l'interface traduit. Sans code connu, on garde le texte de la tour (en français).
 */
type ErrorBody = { error?: string; code?: string; file?: string; seconds?: number };
export function errorMessage(body: ErrorBody): string {
  const key = `api.${body.code}`;
  const params = { file: body.file ?? "", seconds: body.seconds ?? 0 };
  if (body.code && key in fr) return (t as (k: string, p: Record<string, string | number>) => string)(key, params);
  return body.error ?? t("api.unreachable");
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && body.code === "AUTH_REQUIRED") {
    window.dispatchEvent(new Event(AUTH_EVENT));
    throw new AuthRequiredError(errorMessage(body));
  }
  if (!res.ok) throw new ApiError(body);
  return body as T;
}

/** Erreur de la tour, gardée avec sa réponse : un écran peut la retraduire si la langue change entre-temps. */
export class ApiError extends Error {
  constructor(readonly body: ErrorBody) {
    super(errorMessage(body));
  }
}
/** Réseau coupé : « Failed to fetch » ne dit rien à personne. */
const call = (url: string, init?: RequestInit) =>
  fetch(url, init).catch(() => {
    throw new Error(t("api.unreachable"));
  });
const get = <T,>(url: string): Promise<T> => (demo ? (demo.get(url) as Promise<T>) : call(url).then((r) => json<T>(r)));
const send = <T,>(method: string, url: string, body?: unknown): Promise<T> =>
  demo
    ? (demo.send(method, url, body) as Promise<T>)
    : call(url, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then((r) => json<T>(r));

/** Adresse d'une ressource que la tour sert hors JSON (contour des pays, carte postale) ; fichier statique en démo. */
export const resourceUrl = (path: string) => (demo ? demo.url(path) : path);

export const api = {
  health: () => get<{ ok: boolean; auth?: boolean }>("/api/health"),
  login: (password: string) => send<{ ok: boolean }>("POST", "/api/login", { password }),
  logout: () => send<{ ok: boolean }>("POST", "/api/logout"),
  users: () => get<User[]>("/api/users"),
  me: () => get<{ user: User | null }>("/api/me"),
  setMe: (userId: string) => send<{ user: User }>("POST", "/api/me", { userId }),
  async allMedia(): Promise<Media[]> {
    const all: Media[] = [];
    let cursor: string | null = "0";
    while (cursor !== null) {
      const page: { items: Media[]; nextCursor: string | null } = await get(`/api/media?limit=1000&cursor=${cursor}`);
      all.push(...page.items);
      cursor = page.nextCursor;
    }
    return all;
  },
  upload(file: File, importId?: number): Promise<{ id: number; duplicate: boolean }> {
    if (demo) return demo.send("POST", "/api/media") as Promise<never>;
    const body = new FormData();
    body.append("file", file, file.name);
    return call(importId ? `/api/media?import=${importId}` : "/api/media", { method: "POST", body }).then((r) => json(r));
  },
  newImport: () => send<{ id: number }>("POST", "/api/imports"),
  importProposal: (id: number) => get<Proposal>(`/api/imports/${id}`),
  updateImport: (id: number, change: { exclude?: number[]; include?: number[]; keepHome?: boolean }) => send("PATCH", `/api/imports/${id}`, change),
  confirmImport: (id: number) => send<{ trips: string[] }>("POST", `/api/imports/${id}/confirm`),
  cancelImport: (id: number) => send("DELETE", `/api/imports/${id}`),
  trips: () => get<TripSummary[]>("/api/trips"),
  trip: (slug: string) => get<Trip>(`/api/trips/${encodeURIComponent(slug)}`),
  globeStops: () => get<GlobeStop[]>("/api/globe/stops"),
  /** Fige la couleur d'un voyage, ou revient à « Automatique » avec null. */
  setTripColor: (slug: string, color: TripColorId | null) =>
    send<{ color: TripColorId; colorAuto: boolean; autoColor: TripColorId }>("PUT", `/api/trips/${encodeURIComponent(slug)}/color`, { color }),
  updateTrip: (slug: string, patch: { title?: string | null; coverMediaId?: number | null }) =>
    send("PATCH", `/api/trips/${encodeURIComponent(slug)}`, patch),
  placesOfLife: () => get<LifePlaceSummary[]>("/api/places-of-life"),
  placeOfLife: (slug: string) => get<LifePlace>(`/api/places-of-life/${encodeURIComponent(slug)}`),
  updatePlaceOfLife: (slug: string, patch: { title?: string | null; coverMediaId?: number | null; status?: "confirmed" | "rejected" }) =>
    send("PATCH", `/api/places-of-life/${encodeURIComponent(slug)}`, patch),
  /** « C'est un lieu de vie » : le voyage disparaît, ses photos rejoignent le lieu (dont le lien est rendu). */
  tripToPlaceOfLife: (slug: string) => send<{ slug: string }>("POST", `/api/trips/${encodeURIComponent(slug)}/to-place-of-life`),
  renameChapter: (id: number, title: string | null) => send("PATCH", `/api/chapters/${id}`, { title }),
  mergeChapter: (id: number) => send("POST", `/api/chapters/${id}/merge-previous`),
  countries: () => get<Country[]>("/api/countries"),
  overview: () => get<Overview>("/api/overview"),
  saveNote: (tripId: number, chapterId: number | null, body: string) => send("PUT", "/api/notes", { tripId, chapterId, body }),
  notes: () => get<JournalNote[]>("/api/notes"),
  memories: (today: string) => get<{ groups: MemoryGroup[] }>(`/api/memories?today=${today}`),
  tripStats: (slug: string) => get<TripStats>(`/api/trips/${encodeURIComponent(slug)}/stats`),
  liveInvite: (slug: string) => send<{ invited: number }>("POST", `/api/live/${encodeURIComponent(slug)}/invite`),
  liveShow: (slug: string, mediaId: number) => send<unknown>("POST", `/api/live/${encodeURIComponent(slug)}/show`, { mediaId }),
  liveReact: (slug: string, emoji: Reaction, mediaId: number) => send<unknown>("POST", `/api/live/${encodeURIComponent(slug)}/react`, { emoji, mediaId }),
  games: () => get<{ games: GameSummary[]; records: { userId: string; points: number; gameId: number }[] }>("/api/games"),
  newGame: (mode: GameMode) => send<{ id: number }>("POST", "/api/games", { mode }),
  game: (id: number) => get<Game>(`/api/games/${id}`),
  guess: (id: number, round: number, lat: number, lon: number) => send<GuessResult>("POST", `/api/games/${id}/guess`, { round, lat, lon }),
  react: (mediaId: number, emoji: Reaction, on: boolean) => send<Social>("POST", `/api/media/${mediaId}/reactions`, { emoji, on }),
  photoNote: (mediaId: number, text: string) => send<Social>("PUT", `/api/media/${mediaId}/note`, { text }),
  unlocated: () => get<{ total: number; days: UnlocatedDay[] }>("/api/unlocated"),
  locate: (ids: number[], lat: number, lon: number) => send<{ updated: number }>("POST", "/api/media/locate", { ids, lat, lon }),
  wishes: () => get<Wish[]>("/api/wishes"),
  addWish: (w: Partial<Wish>) => send<{ id: number }>("POST", "/api/wishes", w),
  updateWish: (id: number, patch: Partial<Wish> & { doneTripSlug?: string | null }) => send("PATCH", `/api/wishes/${id}`, patch),
  deleteWish: (id: number) => send("DELETE", `/api/wishes/${id}`),
  places: (q: string) => get<PlaceHit[]>(`/api/places?q=${encodeURIComponent(q)}`),
  suggestPlaces: (ids: number[]) => get<PlaceSuggestion[]>(`/api/places/suggest?ids=${suggestIds(ids).join(",")}`),
  reversePlace: (lat: number, lon: number) => get<ReversePlace>(`/api/places/reverse?lat=${lat}&lon=${lon}`),
  space: () => get<Space>("/api/space"),
  statsOverview: () => get<StatsOverview>("/api/stats/overview"),
};
