import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LiveHub } from "./live.js";
import { buildApp, type WaysakeApp } from "./app.js";

type Got = { event: string; data: any }[];
const client = (hub: LiveHub, user: string, room: string | null) => {
  const got: Got = [];
  const close = hub.connect(user, room, (event, data) => got.push({ event, data }));
  return { got, close, last: (event: string) => [...got].reverse().find((g) => g.event === event)?.data };
};

describe("salon « Regarder ensemble »", () => {
  let hub: LiveHub;
  beforeEach(() => (hub = new LiveHub()));

  it("entrer dans un salon envoie son état ; le premier arrivé mène", () => {
    const a = client(hub, "alex", "bled-2026");
    expect(a.last("state")).toEqual({ room: "bled-2026", leader: "alex", mediaId: null, members: ["alex"] });
    const s = client(hub, "sam", "bled-2026");
    expect(s.last("state")).toEqual({ room: "bled-2026", leader: "alex", mediaId: null, members: ["alex", "sam"] });
    expect(a.last("state").members).toEqual(["alex", "sam"]);
  });

  it("montrer une photo donne la main à celui qui la montre, et tout le salon suit", () => {
    const a = client(hub, "alex", "bled-2026");
    const s = client(hub, "sam", "bled-2026");
    hub.show("bled-2026", "sam", 42);
    expect(a.last("state")).toMatchObject({ leader: "sam", mediaId: 42 });
    expect(s.last("state")).toMatchObject({ leader: "sam", mediaId: 42 });
  });

  it("seul un membre du salon peut montrer une photo", () => {
    client(hub, "alex", "bled-2026");
    expect(hub.show("bled-2026", "sam", 1)).toBeNull();
    expect(hub.show("ailleurs", "alex", 1)).toBeNull();
  });

  it("l'invitation arrive à l'autre personne, où qu'elle soit dans Atlas, pas à celle qui invite", () => {
    const a = client(hub, "alex", "bled-2026");
    const elsewhere = client(hub, "sam", null);
    const otherTab = client(hub, "sam", "un-autre-voyage");
    expect(hub.invite("alex", { slug: "bled-2026", title: "Bled" })).toBe(2);
    expect(elsewhere.last("invite")).toEqual({ from: "alex", trip: { slug: "bled-2026", title: "Bled" } });
    expect(otherTab.last("invite")).toBeDefined();
    expect(a.last("invite")).toBeUndefined();
  });

  it("pas d'invitation pour qui est déjà dans le salon", () => {
    client(hub, "alex", "bled-2026");
    const s = client(hub, "sam", "bled-2026");
    expect(hub.invite("alex", { slug: "bled-2026", title: "Bled" })).toBe(0);
    expect(s.last("invite")).toBeUndefined();
  });

  it("les réactions en direct vont aux autres membres", () => {
    const a = client(hub, "alex", "bled-2026");
    const s = client(hub, "sam", "bled-2026");
    hub.react("bled-2026", "alex", "❤️", 42);
    expect(s.last("reaction")).toEqual({ from: "alex", emoji: "❤️", mediaId: 42 });
    expect(a.last("reaction")).toBeUndefined();
  });

  it("en partant, la main passe à qui reste ; un salon vide disparaît", () => {
    const a = client(hub, "alex", "bled-2026");
    const s = client(hub, "sam", "bled-2026");
    hub.show("bled-2026", "alex", 7);
    a.close();
    expect(s.last("state")).toEqual({ room: "bled-2026", leader: "sam", mediaId: 7, members: ["sam"] });
    s.close();
    expect(hub.state("bled-2026")).toBeNull();
  });

  it("deux onglets de la même personne comptent pour un membre", () => {
    client(hub, "alex", "bled-2026");
    const tab2 = client(hub, "alex", "bled-2026");
    expect(tab2.last("state").members).toEqual(["alex"]);
    tab2.close();
    expect(hub.state("bled-2026")?.members).toEqual(["alex"]);
  });
});

describe("API temps réel (SSE)", () => {
  let app: WaysakeApp;
  let base: string;
  let slug: string;
  beforeEach(async () => {
    app = await buildApp({ dataDir: mkdtempSync(join(tmpdir(), "atlas-")) });
    app.waysake.db
      .prepare(`INSERT INTO media (id, sha256, kind, original_path, original_name, mime, bytes, width, height, taken_at, taken_at_local, lat, lon, uploaded_by, uploaded_at, has_thumbs, location_source)
                VALUES (5, 's5', 'photo', 'x', 'x.jpg', 'image/jpeg', 1, 4, 3, ?, '2026-09-05T10:00:00', 46.3683, 14.1146, 'alex', 0, 1, 'exif')`)
      .run(Date.parse("2026-09-05T10:00:00Z"));
    app.waysake.rebuild();
    slug = (await app.inject({ url: "/api/trips" })).json()[0].slug;
    base = await app.listen({ port: 0, host: "127.0.0.1" });
  });
  afterEach(() => app.close());

  /** Lit le flux SSE jusqu'à trouver l'événement voulu. */
  async function until(res: Response, event: string, test: (d: any) => boolean = () => true) {
    const reader = res.body!.getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("flux terminé");
      buffer += new TextDecoder().decode(value);
      for (const block of buffer.split("\n\n")) {
        const ev = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (ev === event && data && test(JSON.parse(data))) {
          reader.releaseLock();
          return JSON.parse(data);
        }
      }
    }
  }

  it("un flux par personne : état du salon, photo montrée par l'autre, invitation", async () => {
    const ctrl = new AbortController();
    const alex = await fetch(`${base}/api/live/events?room=${slug}`, { headers: { "x-atlas-user": "alex" }, signal: ctrl.signal });
    expect(alex.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(await until(alex, "state")).toMatchObject({ room: slug, members: ["alex"] });

    const sam = await fetch(`${base}/api/live/events`, { headers: { "x-atlas-user": "sam" }, signal: ctrl.signal });
    const invite = await fetch(`${base}/api/live/${slug}/invite`, { method: "POST", headers: { "x-atlas-user": "alex" } });
    expect(await invite.json()).toEqual({ invited: 1 });
    expect(await until(sam, "invite")).toEqual({ from: "alex", trip: { slug, title: expect.any(String) } });

    const show = await fetch(`${base}/api/live/${slug}/show`, { method: "POST", headers: { "x-atlas-user": "alex", "content-type": "application/json" }, body: JSON.stringify({ mediaId: 5 }) });
    expect(show.status).toBe(200);
    expect(await until(alex, "state", (d) => d.mediaId === 5)).toMatchObject({ leader: "alex", mediaId: 5 });
    ctrl.abort();
  });

  it("refuse sans profil, hors du salon, ou avec des données invalides", async () => {
    expect((await fetch(`${base}/api/live/events`)).status).toBe(401);
    const post = (path: string, body: unknown, user = "alex") =>
      fetch(`${base}/api/live/${slug}/${path}`, { method: "POST", headers: { "x-atlas-user": user, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post("show", { mediaId: 5 })).status).toBe(403);
    expect((await post("show", { mediaId: "x" })).status).toBe(400);
    expect((await post("react", { emoji: "💩", mediaId: 5 })).status).toBe(400);
    const unknown = await fetch(`${base}/api/live/nulle-part/invite`, { method: "POST", headers: { "x-atlas-user": "alex" } });
    expect(unknown.status).toBe(404);
  });
});
