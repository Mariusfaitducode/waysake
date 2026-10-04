import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, demo, type Reaction } from "./api.js";

/** « Regarder ensemble » côté interface : un flux SSE vers la tour, l'état du salon, les invitations, les réactions. */
export type RoomState = { room: string; leader: string; mediaId: number | null; members: string[] };
export type Invite = { from: string; trip: { slug: string; title: string } };
export type Floating = { key: number; from: string; emoji: Reaction; mediaId: number };

type Live = {
  room: string | null;
  state: RoomState | null;
  invite: Invite | null;
  floating: Floating[];
  join: (slug: string) => void;
  leave: () => void;
  dismissInvite: () => void;
  show: (mediaId: number) => void;
  react: (emoji: Reaction, mediaId: number) => void;
};

const Ctx = createContext<Live | null>(null);
export const useLive = () => useContext(Ctx)!;
const FLOAT_MS = 2600;
const RETRY_MS = 5000;

export function LiveProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [floating, setFloating] = useState<Floating[]>([]);
  const seq = useRef(0);
  const [attempt, setAttempt] = useState(0);

  // Un seul flux à la fois : sans salon, il ne sert qu'aux invitations. EventSource se reconnecte seul après une
  // coupure réseau, mais abandonne pour de bon sur une erreur HTTP (tour qui redémarre, 502 du proxy) : on relance.
  useEffect(() => {
    if (demo || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/live/events${room ? `?room=${encodeURIComponent(room)}` : ""}`);
    let retry: ReturnType<typeof setTimeout> | undefined;
    es.addEventListener("error", () => {
      if (es.readyState === EventSource.CLOSED) retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    });
    es.addEventListener("state", (e) => setState(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("invite", (e) => setInvite(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("reaction", (e) => {
      const r = JSON.parse((e as MessageEvent).data) as Omit<Floating, "key">;
      const key = ++seq.current;
      setFloating((f) => [...f, { ...r, key }]);
      setTimeout(() => setFloating((f) => f.filter((x) => x.key !== key)), FLOAT_MS);
    });
    return () => {
      clearTimeout(retry);
      es.close();
    };
  }, [room, attempt]);

  const join = useCallback((slug: string) => {
    if (demo) return demo.blocked(); // la démo n'a pas de tour pour relier deux écrans
    setState(null);
    setRoom(slug);
    setInvite((i) => (i?.trip.slug === slug ? null : i));
  }, []);
  const leave = useCallback(() => {
    setRoom(null);
    setState(null);
  }, []);
  const show = useCallback((mediaId: number) => void (room && api.liveShow(room, mediaId).catch(() => {})), [room]);
  const react = useCallback((emoji: Reaction, mediaId: number) => void (room && api.liveReact(room, emoji, mediaId).catch(() => {})), [room]);

  const value = useMemo(
    () => ({ room, state: state?.room === room ? state : null, invite, floating, join, leave, dismissInvite: () => setInvite(null), show, react }),
    [room, state, invite, floating, join, leave, show, react],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
