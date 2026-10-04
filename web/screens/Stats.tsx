import type { ReactNode } from "react";
import { Link } from "react-router";
import { api, type Space, type StatsOverview, type User } from "../api.js";
import { useApi } from "../data.js";
import { Header } from "../components/Header.js";
import { Avatar } from "../components/Avatar.js";
import { bytes, monthYear, number, shortDay, shortMonth, when } from "../format.js";
import { locale, t } from "../i18n/index.js";
import { rich } from "../i18n/rich.js";
import { IconBack } from "../shell/icons.js";
// Lien retour (Countries) et chiffres, barre et légende du voyage en chiffres (TripStatsPanel), réutilisés ;
// Stats.css les remet à plat ici (plus de panneau).
import "./Countries.css";
import "../components/TripStatsPanel.css";
import "./Stats.css";

/** Au-delà, l'histogramme ne montre que les derniers mois : les barres resteraient lisibles sur un téléphone. */
const MAX_MONTHS = 36;
const TAILSCALE_ADMIN = "https://login.tailscale.com/admin/machines";
const SHADES = [
  "var(--accent)",
  "color-mix(in oklab, var(--accent) 42%, var(--surface))",
  "color-mix(in oklab, var(--accent) 20%, var(--surface))",
  "color-mix(in oklab, var(--accent) 64%, var(--surface))",
];

/** Statistiques et réglages du foyer : envois, personnes, place, sauvegarde, trafic, accès, application. */
export function Stats() {
  const { data: s, error } = useApi(api.statsOverview);
  const { data: space } = useApi(api.space);
  // Graphiques : Encre et ses nuances, dans l'ordre des profils (jamais seules : le prénom est écrit à côté).
  // La couleur du profil (en base) ne teinte que les monogrammes, adoucie (Avatar).
  const color = (id: string) => SHADES[Math.max(0, s?.access.users.findIndex((u) => u.id === id) ?? 0) % SHADES.length];
  const name = (id: string) => s?.access.users.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="household">
      <Link to="/carnet" className="back-link">
        <IconBack /> {t("nav.notebook")}
      </Link>
      <Header title={t("household.title")} subtitle={t("household.subtitle")} />
      {error && !s && <p role="alert" className="household__error">{error}</p>}
      {!s && !error && <div className="household__grid" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton household__placeholder" />)}</div>}
      {s && (
        <div className="household__grid">
          <Uploads s={s} color={color} name={name} />
          <People s={s} color={color} name={name} />
          <SpaceCard space={space} />
          <Backup s={s} />
          <Access s={s} />
          <Traffic s={s} name={name} color={color} />
          <AppCard s={s} />
        </div>
      )}
    </div>
  );
}

type Who = { color: (id: string) => string; name: (id: string) => string };

function Card({ id, title, wide, children }: { id: string; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`household__card${wide ? " household__card--wide" : ""}`} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

/** Histogramme en CSS : une colonne par période, empilée par profil. Pas de bibliothèque. */
function Bars({ columns, label, users, color }: { columns: { key: string; tick: string; parts: { id: string; value: number; color: string }[] }[]; label: string; users?: User[]; color?: (id: string) => string }) {
  const max = Math.max(1, ...columns.map((c) => c.parts.reduce((n, p) => n + p.value, 0)));
  // Une étiquette sur deux, sur trois… pour qu'elles ne se chevauchent pas.
  const every = Math.ceil(columns.length / 6);
  return (
    <figure className="bars" role="img" aria-label={label}>
      <div className="bars__plot" style={{ "--n": columns.length } as React.CSSProperties}>
        {columns.map((c) => (
          <div key={c.key} className="bars__col">
            {c.parts.map((p) => (
              <span key={p.id} style={{ height: `${(p.value / max) * 100}%`, background: p.color }} />
            ))}
          </div>
        ))}
      </div>
      <div className="bars__ticks" style={{ "--n": columns.length } as React.CSSProperties} aria-hidden="true">
        {columns.map((c, i) => (
          <span key={c.key}>{(columns.length - 1 - i) % every === 0 ? c.tick : ""}</span>
        ))}
      </div>
      {users && users.length > 1 && (
        <ul className="stats__legend bars__legend" aria-hidden="true">
          {users.map((u) => (
            <li key={u.id}>
              <i style={{ background: color?.(u.id) ?? "var(--accent)" }} />
              {u.name}
            </li>
          ))}
        </ul>
      )}
      <p className="bars__max" aria-hidden="true">{number(max)}</p>
    </figure>
  );
}

function Uploads({ s, color }: { s: StatsOverview } & Who) {
  const { totals, months } = s.uploads;
  const shown = months.slice(-MAX_MONTHS);
  const columns = shown.map((m) => ({
    key: m.month,
    tick: shortMonth(m.month),
    parts: s.access.users.map((u) => ({ id: u.id, value: m.byUser[u.id] ?? 0, color: color(u.id) })),
  }));
  const summary = shown.filter((m) => m.total).map((m) => `${shortMonth(m.month)} ${number(m.total)}`).join(", ");
  return (
    <Card id="household-uploads" title={t("household.uploads.title")} wide>
      <dl className="stats__panel household__panel">
        <div>
          <dt>{t("household.uploads.photos", { count: totals.photos })}</dt>
          <dd>{number(totals.photos)}</dd>
        </div>
        <div>
          <dt>{t("household.uploads.videos", { count: totals.videos })}</dt>
          <dd>{number(totals.videos)}</dd>
        </div>
        <div>
          <dt>{t("household.uploads.volume")}</dt>
          <dd>{bytes(totals.bytes)}</dd>
        </div>
      </dl>
      {months.length === 0 ? (
        <p className="household__muted">{t("household.uploads.empty")}</p>
      ) : (
        <>
          <Bars columns={columns} label={t("household.uploads.chart", { summary })} users={s.access.users} color={color} />
          <p className="household__muted">
            {t("household.uploads.hint")} {months.length > MAX_MONTHS && t("household.uploads.recent", { count: MAX_MONTHS })}
          </p>
        </>
      )}
    </Card>
  );
}

function People({ s, color, name }: { s: StatsOverview } & Who) {
  return (
    <Card id="household-people" title={t("household.people.title")}>
      <div className="stats__bar" aria-hidden="true">
        {s.people.filter((p) => p.share > 0).map((p) => (
          <span key={p.userId} style={{ flexGrow: p.share, background: color(p.userId) }} />
        ))}
      </div>
      <ul className="household__people">
        {s.people.map((p) => (
          <li key={p.userId}>
            <Avatar name={name(p.userId)} color={s.access.users.find((u) => u.id === p.userId)?.color} size={34} />
            <div>
              <p className="household__strong">
                {name(p.userId)} <b className="household__share">{t("household.people.share", { share: p.share })}</b>
              </p>
              <p>
                {t("count.photos", { count: p.photos })}, {t("household.count.videos", { count: p.videos })}, {bytes(p.bytes)}
              </p>
              <p className="household__muted">
                {p.lastUploadAt ? t("household.people.last", { when: when(p.lastUploadAt) }) : t("household.people.never")}
                {p.reactions !== null && <> · {t("household.people.reactions", { count: p.reactions })}</>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SpaceCard({ space }: { space: Space | null }) {
  if (!space) return <div className="skeleton household__placeholder" aria-hidden="true" />;
  const { disk, used, monthly, forecast } = space;
  const other = Math.max(0, disk.total - disk.free - used.total);
  const pct = (n: number) => `${disk.total ? (n / disk.total) * 100 : 0}%`;
  const segments = [
    { key: "waysake", label: t("household.space.waysake"), value: used.total, cls: "is-waysake" },
    { key: "other", label: t("household.space.other"), value: other, cls: "is-other" },
    { key: "free", label: t("household.space.free"), value: disk.free, cls: "is-free" },
  ];
  const far = forecast.months !== null && forecast.months > 120;
  return (
    <Card id="household-space" title={t("household.space.title")}>
      <p className="household__big">{t("household.space.summary", { free: bytes(disk.free), total: bytes(disk.total) })}</p>
      <div className="household__disk" role="img" aria-label={segments.map((g) => `${g.label} ${bytes(g.value)}`).join(", ")}>
        {segments.map((g) => (
          <span key={g.key} className={g.cls} style={{ width: pct(g.value) }} />
        ))}
      </div>
      <ul className="stats__legend household__legend">
        {segments.map((g) => (
          <li key={g.key}>
            <i className={g.cls} aria-hidden="true" />
            {g.label} <b>{bytes(g.value)}</b>
          </li>
        ))}
      </ul>
      <p className="household__muted">{t("household.space.detail", { originals: bytes(used.originals), derived: bytes(used.derived), database: bytes(used.database) })}</p>
      <p>
        {forecast.fullAt === null
          ? t("household.space.noRhythm")
          : far
            ? t("household.space.forecastFar", { monthly: bytes(monthly.bytes) })
            : t("household.space.forecast", { monthly: bytes(monthly.bytes), date: monthYear(forecast.fullAt) })}
      </p>
    </Card>
  );
}

function Backup({ s }: { s: StatsOverview }) {
  const { snapshots, lastSnapshotAt, external } = s.backup;
  // L'heure du journal est celle de la tour (Windows), sans fuseau : on l'affiche telle quelle.
  const at = external?.at ? when(Date.parse(external.at)) : "";
  const stale = external?.ok && external.at && Date.now() - Date.parse(external.at) > 3 * 86_400_000;
  return (
    <Card id="household-backup" title={t("household.backup.title")}>
      <p>{lastSnapshotAt ? t("household.backup.snapshot", { when: when(lastSnapshotAt) }) : t("household.backup.noSnapshot")}</p>
      <p className="household__muted">
        {t("household.backup.kept", { count: snapshots })}. {t("household.backup.snapshotHint")}
      </p>
      {external === null ? (
        <div className="household__warning" role="note">
          <p className="household__strong">{t("household.backup.none")}</p>
          <p>{rich(t("household.backup.noneText"))}</p>
        </div>
      ) : (
        <div className={`household__status${external.ok && !stale ? " is-ok" : " is-bad"}`}>
          <p>
            {external.reason === "ok"
              ? t("household.backup.ok", { when: at })
              : external.reason === "failed"
                ? t("household.backup.failed", { when: at })
                : external.reason === "disk_missing"
                  ? t("household.backup.diskMissing", { when: at })
                  : t("household.backup.unknown")}
          </p>
          {stale && <p>{t("household.backup.stale")}</p>}
        </div>
      )}
    </Card>
  );
}

function Traffic({ s, name, color }: { s: StatsOverview } & Who) {
  const { since, days, served, uploads, people } = s.traffic;
  const columns = days.map((d) => ({ key: d.day, tick: shortDay(d.day), parts: [{ id: "all", value: d.requests, color: "var(--accent)" }] }));
  const figures = [
    { label: t("household.traffic.photos"), value: bytes(served.photos) },
    { label: t("household.traffic.videos"), value: bytes(served.videos) },
    { label: t("household.traffic.previews"), value: bytes(served.previews) },
    { label: t("household.traffic.uploads"), value: `${t("household.count.files", { count: uploads.count })}, ${bytes(uploads.bytes)}` },
  ];
  return (
    <Card id="household-traffic" title={t("household.traffic.title")} wide>
      <p className="household__muted">{t("household.traffic.since", { when: when(since) })}</p>
      <div className="household__split">
        <div>
          <p className="stats__label">{t("household.traffic.requests")}</p>
          <Bars columns={columns} label={t("household.traffic.chart", { summary: days.map((d) => `${shortDay(d.day)} ${number(d.requests)}`).join(", ") })} />
        </div>
        <dl className="household__facts">
          {figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="stats__label">{t("household.traffic.people")}</p>
      {people.length === 0 ? (
        <p className="household__muted">{t("household.traffic.nobody")}</p>
      ) : (
        <ul className="stats__legend">
          {people.map((p) => (
            <li key={p.userId}>
              <i style={{ background: color(p.userId) }} aria-hidden="true" />
              {name(p.userId)} <b>{t("household.traffic.visits", { count: p.visits })}</b>, {t("household.traffic.lastSeen", { when: when(p.lastSeen) })}
            </li>
          ))}
        </ul>
      )}
      <p className="household__muted">{t("household.traffic.visitHint")}</p>
    </Card>
  );
}

function Access({ s }: { s: StatsOverview }) {
  const { users, devices } = s.access;
  return (
    <Card id="household-access" title={t("household.access.title")}>
      <ul className="household__profiles">
        {users.map((u) => (
          <li key={u.id}>
            <Avatar name={u.name} color={u.color} size={28} />
            {u.name}
          </li>
        ))}
      </ul>
      {devices ? (
        <p>
          {t("household.access.devices", { count: devices.count })}. {devices.latestAt && t("household.access.latest", { when: when(devices.latestAt) })}
        </p>
      ) : (
        <p>{t("household.access.noPassword")}</p>
      )}
      <p className="household__muted">{t("household.access.tailscale")}</p>
      <a className="button button--quiet button--small household__external" href={TAILSCALE_ADMIN} target="_blank" rel="noreferrer noopener">
        {t("household.access.manage")} ↗
      </a>
    </Card>
  );
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return t("household.duration.days", { days, hours });
  if (hours) return t("household.duration.hours", { hours, minutes });
  return t("household.duration.minutes", { minutes });
}

function AppCard({ s }: { s: StatsOverview }) {
  const { version, startedAt, uptime, node, database, library } = s.app;
  const rows: [string, ReactNode][] = [
    [t("household.app.version"), version ? t("household.app.deployed", { commit: version.commit, when: when(Date.parse(version.date)) }) : t("household.app.unknown", { when: when(startedAt) })],
    [t("household.app.uptime"), duration(uptime)],
    [t("household.app.node"), node],
    [t("household.app.database"), bytes(database)],
    [t("household.app.trips"), number(library.trips)],
    [t("household.app.chapters"), number(library.chapters)],
    [t("household.app.countries"), number(library.countries)],
    [t("household.app.unlocated"), library.unlocated ? <Link to="/photos/a-localiser">{number(library.unlocated)}</Link> : "0"],
  ];
  const settings: [string, ReactNode][] = [
    [t("household.app.password"), s.access.password ? t("household.app.on") : t("household.app.off")],
    [t("household.app.profiles"), s.access.users.map((u) => u.name).join(", ")],
    [t("household.app.language"), t(locale() === "fr" ? "lang.fr" : "lang.en")],
  ];
  return (
    <Card id="household-app" title={t("household.app.title")} wide>
      <div className="household__split">
        <Table rows={rows} />
        <div>
          <p className="stats__label">{t("household.app.settings")}</p>
          <Table rows={settings} />
        </div>
      </div>
    </Card>
  );
}

function Table({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="household__table">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
