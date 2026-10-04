/**
 * « Regarder ensemble » : des salons en mémoire (un par voyage), alimentés par des flux SSE.
 * Le meneur est celui qui a montré la dernière photo ; tout le salon la suit. Rien n'est écrit en base :
 * un redémarrage de la tour vide les salons, et les téléphones se reconnectent tout seuls.
 */
export type Send = (event: string, data: unknown) => void;
export type RoomState = { room: string; leader: string; mediaId: number | null; members: string[] };
type Conn = { user: string; room: string | null; send: Send };

export class LiveHub {
  private conns = new Set<Conn>();
  private rooms = new Map<string, { leader: string; mediaId: number | null }>();

  private membersOf(room: string) {
    return [...new Set([...this.conns].filter((c) => c.room === room).map((c) => c.user))].sort();
  }

  state(room: string): RoomState | null {
    const r = this.rooms.get(room);
    return r ? { room, ...r, members: this.membersOf(room) } : null;
  }

  private broadcast(room: string) {
    const s = this.state(room);
    if (s) for (const c of this.conns) if (c.room === room) c.send("state", s);
  }

  /** Un flux ouvert ; `room` = le salon rejoint, ou null pour ne recevoir que les invitations. Renvoie la déconnexion. */
  connect(user: string, room: string | null, send: Send): () => void {
    const conn: Conn = { user, room, send };
    this.conns.add(conn);
    if (room) {
      if (!this.rooms.has(room)) this.rooms.set(room, { leader: user, mediaId: null });
      this.broadcast(room);
    }
    return () => {
      if (!this.conns.delete(conn) || !room) return;
      const members = this.membersOf(room);
      const r = this.rooms.get(room)!;
      if (!members.length) this.rooms.delete(room);
      else {
        if (!members.includes(r.leader)) r.leader = members[0]; // la main passe à qui reste
        this.broadcast(room);
      }
    };
  }

  /** Invite les autres personnes (pas celles déjà dans le salon). Renvoie le nombre de flux prévenus. */
  invite(from: string, trip: { slug: string; title: string }): number {
    const inRoom = new Set(this.membersOf(trip.slug));
    let n = 0;
    for (const c of this.conns)
      if (c.user !== from && !inRoom.has(c.user)) {
        c.send("invite", { from, trip });
        n++;
      }
    return n;
  }

  /** Montre une photo à tout le salon ; null si `user` n'en fait pas partie. */
  show(room: string, user: string, mediaId: number): RoomState | null {
    const r = this.rooms.get(room);
    if (!r || !this.membersOf(room).includes(user)) return null;
    Object.assign(r, { leader: user, mediaId });
    this.broadcast(room);
    return this.state(room);
  }

  /** Une réaction qui flotte chez les autres membres. */
  react(room: string, user: string, emoji: string, mediaId: number): boolean {
    if (!this.membersOf(room).includes(user)) return false;
    for (const c of this.conns) if (c.room === room && c.user !== user) c.send("reaction", { from: user, emoji, mediaId });
    return true;
  }
}
