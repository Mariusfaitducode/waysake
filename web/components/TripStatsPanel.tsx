import { api } from "../api.js";
import { useApi } from "../data.js";
import { dayLabel, number } from "../format.js";
import { t } from "../i18n/index.js";
import { placeTitle } from "../i18n/places.js";
import "./TripStatsPanel.css";

/** Le voyage en chiffres, façon panneau d'autoroute, puis qui a pris les photos. */
export function TripStatsPanel({ slug }: { slug: string }) {
  const { data: s } = useApi(() => api.tripStats(slug), [slug]);
  const { data: users } = useApi(api.users);
  if (!s || s.photos === 0) return null;
  const user = (id: string) => users?.find((u) => u.id === id);
  const [first, second] = s.byUser;
  const verdict = s.byUser.length > 1 ? (first.count === second.count ? t("stats.tie") : t("stats.winner", { name: user(first.userId)?.name ?? first.userId })) : null;

  const figures = [
    s.km > 0 && { value: number(s.km), label: t("stats.km") },
    { value: number(s.days), label: t("stats.days", { count: s.days }) },
    { value: number(s.countries), label: t("stats.countries", { count: s.countries }) },
    { value: number(s.photos), label: t("stats.photos", { count: s.photos }) },
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <section className="stats" aria-labelledby="stats-title">
      <h2 id="stats-title" className="chapter__title">{t("stats.title")}</h2>
      <dl className="stats__panel">
        {figures.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="stats__facts">
        {s.topChapter && (
          <div>
            <dt>{t("stats.topChapter")}</dt>
            <dd>
              {placeTitle(s.topChapter.title)}, {t("count.photos", { count: s.topChapter.count })}
            </dd>
          </div>
        )}
        {s.topDay && (
          <div>
            <dt>{t("stats.topDay")}</dt>
            <dd>
              {dayLabel(s.topDay.day)}, {t("count.photos", { count: s.topDay.count })}
            </dd>
          </div>
        )}
      </dl>
      {s.byUser.length > 0 && (
        <div className="stats__who">
          <p className="stats__label">{t("stats.byUser")}</p>
          <div className="stats__bar" role="img" aria-label={s.byUser.map((u) => `${user(u.userId)?.name ?? u.userId} ${u.share} %`).join(", ")}>
            {s.byUser.map((u) => (
              <span key={u.userId} style={{ flexGrow: u.count, background: user(u.userId)?.color ?? "var(--muted)" }} />
            ))}
          </div>
          <ul className="stats__legend">
            {s.byUser.map((u) => (
              <li key={u.userId}>
                <i style={{ background: user(u.userId)?.color ?? "var(--muted)" }} aria-hidden="true" />
                {user(u.userId)?.name ?? u.userId} <b>{u.share} %</b>
              </li>
            ))}
          </ul>
          {verdict && <p className="stats__verdict">{verdict}</p>}
        </div>
      )}
    </section>
  );
}
