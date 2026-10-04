import { t } from "./i18n/index.js";
import { fr } from "./i18n/fr.js";

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
  uploadedBy: string;
  hasThumbs: boolean;
  place?: string | null;
  thumb: string;
  preview: string;
  original: string;
};
export type TripSummary = {
  id: number;
  slug: string;
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
export type Note = { chapterId: number | null; body: string; author: string; updatedAt: number };
export type Trip = TripSummary & { route: [number, number][]; chapters: Chapter[]; notes: Note[] };
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
export type UnlocatedMedia = { id: number; kind: "photo" | "video"; width: number | null; height: number | null; hasThumbs: boolean; thumb: string; preview: string; takenAtLocal: string };
export type UnlocatedDay = { day: string; count: number; moments: { start: string; end: string; ids: number[]; count: number }[]; media: UnlocatedMedia[] };
export type PlaceHit = { kind: "country" | "region" | "place"; name: string; country: string; countryCode: string; lat: number; lon: number; flag: string };

/** La tour demande le mot de passe du foyer (ATLAS_PASSWORD) : session absente, fermée ou mot de passe changé. */
export class AuthRequiredError extends Error {}
export const AUTH_EVENT = "atlas:auth-required";

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
const get = <T,>(url: string) => call(url).then((r) => json<T>(r));
const send = <T,>(method: string, url: string, body?: unknown) =>
  call(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => json<T>(r));

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
  updateTrip: (slug: string, patch: { title?: string | null; coverMediaId?: number | null }) =>
    send("PATCH", `/api/trips/${encodeURIComponent(slug)}`, patch),
  renameChapter: (id: number, title: string | null) => send("PATCH", `/api/chapters/${id}`, { title }),
  mergeChapter: (id: number) => send("POST", `/api/chapters/${id}/merge-previous`),
  countries: () => get<Country[]>("/api/countries"),
  overview: () => get<Overview>("/api/overview"),
  saveNote: (tripId: number, chapterId: number | null, body: string) => send("PUT", "/api/notes", { tripId, chapterId, body }),
  notes: () => get<JournalNote[]>("/api/notes"),
  unlocated: () => get<{ total: number; days: UnlocatedDay[] }>("/api/unlocated"),
  locate: (ids: number[], lat: number, lon: number) => send<{ updated: number }>("POST", "/api/media/locate", { ids, lat, lon }),
  wishes: () => get<Wish[]>("/api/wishes"),
  addWish: (w: Partial<Wish>) => send<{ id: number }>("POST", "/api/wishes", w),
  updateWish: (id: number, patch: Partial<Wish> & { doneTripSlug?: string | null }) => send("PATCH", `/api/wishes/${id}`, patch),
  deleteWish: (id: number) => send("DELETE", `/api/wishes/${id}`),
  places: (q: string) => get<PlaceHit[]>(`/api/places?q=${encodeURIComponent(q)}`),
};
