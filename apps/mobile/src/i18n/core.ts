/**
 * Traduction minimale et typée, sans dépendance.
 *
 * - Un dictionnaire de référence (le français, déclaré `as const`) fixe les clés et les paramètres.
 * - Chaque autre langue est typée `Translation<typeof fr>` : une clé manquante ou en trop ne compile pas.
 * - `{nom}` est remplacé par le paramètre du même nom (les nombres sont formatés selon la langue).
 * - Un message au pluriel est un objet `{ one, other, … }` choisi par `Intl.PluralRules` sur `count` ;
 *   `zero` (facultatif) sert quand `count` vaut exactement 0 (« Aucune photo » plutôt que « 0 photo »).
 *
 * Copie de web/i18n/core.ts (l'app Expo est un projet à part : Metro ne lit pas en dehors d'apps/mobile).
 * Modifier les deux ensemble.
 */
export type Plural = { readonly zero?: string; readonly one?: string; readonly few?: string; readonly many?: string; readonly other: string };
export type Message = string | Plural;
export type Dict = { readonly [key: string]: Message };

/** Même forme que la référence : chaque clé est obligatoire, un pluriel reste un pluriel. */
export type Translation<D extends Dict> = { readonly [K in keyof D]: D[K] extends string ? string : Plural };

type Text<M> = M extends string ? M : M[keyof M] & string;
type Vars<S> = S extends `${string}{${infer P}}${infer R}` ? P | Vars<R> : never;
export type ParamsOf<M> = M extends string ? Vars<M> : Vars<Text<M>> | "count";
export type Params = Record<string, string | number>;
/** Pas de paramètre attendu → pas d'argument ; sinon un objet avec exactement les bons noms. */
export type Args<M> = [ParamsOf<M>] extends [never] ? [] : [Record<ParamsOf<M>, string | number>];

export type Translate<D extends Dict> = <K extends keyof D & string>(key: K, ...args: Args<D[K]>) => string;

/** Hermes (Android) n'a pas toujours Intl.PluralRules : règle française ou anglaise de secours. */
function pluralRule(locale: string): (n: number) => string {
  if (typeof Intl !== "undefined" && typeof Intl.PluralRules === "function") {
    const rules = new Intl.PluralRules(locale);
    return (n) => rules.select(n);
  }
  return locale.startsWith("fr") ? (n) => (Math.abs(n) < 2 ? "one" : "other") : (n) => (n === 1 ? "one" : "other");
}

export function createTranslator<D extends Dict>(locale: string, dict: Translation<D>): Translate<D> {
  const plural = pluralRule(locale);
  const number = new Intl.NumberFormat(locale);
  return ((key: string, params?: Params) => {
    let msg = (dict as Dict)[key];
    if (msg === undefined) return key;
    if (typeof msg !== "string") {
      const n = Number(params?.count ?? 0);
      const forms = msg as Record<string, string | undefined>;
      msg = (n === 0 ? forms.zero : undefined) ?? forms[plural(n)] ?? msg.other;
    }
    if (!params) return msg;
    return msg.replace(/\{(\w+)\}/g, (all, name: string) => {
      const v = params[name];
      return v === undefined ? all : typeof v === "number" ? number.format(v) : v;
    });
  }) as Translate<D>;
}
