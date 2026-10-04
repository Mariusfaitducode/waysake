import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api.js";

/**
 * Version des données : après un envoi (et le recalcul des voyages côté tour), on l'incrémente
 * et chaque écran recharge ce qu'il affiche. Pas de cache compliqué : deux personnes, une tour.
 */
const DataVersion = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return <DataVersion.Provider value={{ version, bump }}>{children}</DataVersion.Provider>;
}

export const useDataVersion = () => useContext(DataVersion);

export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const { version } = useDataVersion();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [local, setLocal] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    load().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: Error) => alive && setState((s) => ({ data: s.data, error: e.message, loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, local, ...deps]);
  return { ...state, reload: () => setLocal((n) => n + 1) };
}

/** Prénom d'un profil à partir de son identifiant (l'identifiant tant que la liste n'est pas chargée). */
export function useAuthorName() {
  const { data: users } = useApi(api.users);
  return (id: string) => users?.find((u) => u.id === id)?.name ?? id;
}
