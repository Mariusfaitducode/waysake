import { File, UploadType } from "expo-file-system";
import type { Settings } from "./storage";

export type Person = { id: string; name: string; color: string };

/**
 * Appels à la tour. L'identité passe par l'en-tête X-Atlas-User (jamais dans l'adresse) ; le mot de passe du
 * foyer (ATLAS_PASSWORD), s'il y en a un, par `Authorization: Bearer`, téléversements compris.
 */
const headers = (s: Settings): Record<string, string> => ({
  "X-Atlas-User": s.user,
  Accept: "application/json",
  ...(s.password ? { Authorization: `Bearer ${s.password}` } : {}),
});

/** La tour refuse : mot de passe absent, faux ou changé depuis. */
export class PasswordError extends Error {}
const PASSWORD_MESSAGE = "La tour demande le mot de passe du foyer (ou il a changé). Ouvre les réglages d'Atlas pour le saisir.";

async function call<T>(s: Settings, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${s.server}${path}`, { ...init, headers: { ...headers(s), ...(init.headers ?? {}) } });
  } catch {
    throw new Error("La tour ne répond pas. Vérifie que Tailscale est connecté sur ton téléphone.");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && body.code === "AUTH_REQUIRED") throw new PasswordError(PASSWORD_MESSAGE);
  if (!res.ok) throw new Error(body.error ?? `La tour a répondu ${res.status}.`);
  return body as T;
}

export const tower = {
  health: (s: Settings) => call<{ ok: boolean; auth?: boolean }>(s, "/api/health"),
  users: (s: Settings) => call<Person[]>(s, "/api/users"),
  lastImport: (s: Settings) => call<{ since: number | null }>(s, "/api/imports/last"),
  newImport: (s: Settings) => call<{ id: number }>(s, "/api/imports", { method: "POST" }),
  async upload(s: Settings, importId: number, uri: string, fields: Record<string, string>) {
    const r = await new File(uri).upload(`${s.server}/api/media?import=${importId}`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      parameters: fields,
      headers: headers(s),
    });
    let body: { duplicate?: boolean; error?: string; code?: string } = {};
    try {
      body = JSON.parse(r.body);
    } catch {}
    if (r.status === 401 && body.code === "AUTH_REQUIRED") throw new PasswordError(PASSWORD_MESSAGE);
    if (r.status >= 400) throw new Error(body.error ?? `Erreur ${r.status}`);
    return { duplicate: !!body.duplicate };
  },
};
