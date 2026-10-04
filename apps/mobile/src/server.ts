import { File, UploadType } from "expo-file-system";
import type { Settings } from "./storage";
import { tr } from "./i18n";
import { fr } from "./i18n/fr";

/** La tour renvoie `{ error, code }` : on traduit le code connu, sinon on garde son texte (en français). */
function errorMessage(body: { error?: string; code?: string; file?: string; seconds?: number }, status: number): string {
  const key = `api.${body.code}`;
  const params = { file: body.file ?? "", seconds: body.seconds ?? 0 };
  if (body.code && key in fr) return (tr as (k: string, p: Record<string, string | number>) => string)(key, params);
  return body.error ?? tr("api.status", { status });
}

export type Person = { id: string; name: string; color: string };

/** GET /api/space : disque de la tour, place prise par Waysake, rythme de croissance, débit d'envoi connu. */
export type Space = {
  disk: { free: number; total: number };
  used: { originals: number; derived: number; database: number; total: number };
  monthly: { bytes: number; items: number };
  forecast: { months: number | null; fullAt: number | null };
  average: { photo: number; video: number };
  uploadRate: { bytesPerSecond: number; measured: boolean };
};

/**
 * Appels à la tour. L'identité passe par l'en-tête X-Atlas-User (jamais dans l'adresse) ; le mot de passe du
 * foyer (WAYSAKE_PASSWORD), s'il y en a un, par `Authorization: Bearer`, téléversements compris.
 */
const headers = (s: Settings): Record<string, string> => ({
  "X-Atlas-User": s.user,
  Accept: "application/json",
  ...(s.password ? { Authorization: `Bearer ${s.password}` } : {}),
});

/** La tour refuse : mot de passe absent, faux ou changé depuis. */
export class PasswordError extends Error {}
/** Traduit au moment de l'erreur : la langue a pu changer depuis le lancement. */
const passwordError = () => new PasswordError(tr("password.needed"));

async function call<T>(s: Settings, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${s.server}${path}`, { ...init, headers: { ...headers(s), ...(init.headers ?? {}) } });
  } catch {
    throw new Error(tr("api.unreachable"));
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && body.code === "AUTH_REQUIRED") throw passwordError();
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  return body as T;
}

export const tower = {
  health: (s: Settings) => call<{ ok: boolean; auth?: boolean }>(s, "/api/health"),
  users: (s: Settings) => call<Person[]>(s, "/api/users"),
  lastImport: (s: Settings) => call<{ since: number | null }>(s, "/api/imports/last"),
  newImport: (s: Settings) => call<{ id: number }>(s, "/api/imports", { method: "POST" }),
  space: (s: Settings) => call<Space>(s, "/api/space"),
  /** Pour chaque élément (nom, date de prise de vue), est-il déjà dans Waysake ? Par lots : une requête reste petite. */
  async known(s: Settings, items: { name: string; takenAt: number }[]): Promise<boolean[]> {
    const out: boolean[] = [];
    for (let i = 0; i < items.length; i += 1000) {
      const r = await call<{ known: boolean[] }>(s, "/api/media/known", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.slice(i, i + 1000) }),
      });
      out.push(...r.known);
    }
    return out;
  },
  uploadRate: (s: Settings, bytes: number, ms: number) =>
    call<Space["uploadRate"]>(s, "/api/uploads/rate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bytes, ms }) }),
  async upload(s: Settings, importId: number, uri: string, fields: Record<string, string>) {
    const r = await new File(uri).upload(`${s.server}/api/media?import=${importId}`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      parameters: fields,
      headers: headers(s),
    });
    let body: { duplicate?: boolean; error?: string; code?: string; file?: string; seconds?: number } = {};
    try {
      body = JSON.parse(r.body);
    } catch {}
    if (r.status === 401 && body.code === "AUTH_REQUIRED") throw passwordError();
    if (r.status >= 400) throw new Error(errorMessage(body, r.status));
    return { duplicate: !!body.duplicate };
  },
};
