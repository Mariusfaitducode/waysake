import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Header } from "../components/Header.js";
import { locale, t } from "../i18n/index.js";
import { bytes } from "../format.js";
import "./GetApp.css";

type Space = {
  disk: { free: number; total: number };
  used: { total: number };
  monthly: { bytes: number };
  forecast: { months: number | null; fullAt: number | null };
};

/** Place sur la tour : libre, prise par Waysake, et jusqu'à quand ça tiendra au rythme actuel (GET /api/space). */
function SpaceCard() {
  const [space, setSpace] = useState<Space | null>(null);
  useEffect(() => {
    fetch("/api/space", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSpace, () => setSpace(null));
  }, []);
  if (!space) return null;
  const { months, fullAt } = space.forecast;
  const rate = bytes(space.monthly.bytes);
  const forecast =
    months === null || fullAt === null
      ? null
      : months > 120
        ? t("getApp.space.forecastLong", { rate })
        : t("getApp.space.forecast", { rate, months, date: new Intl.DateTimeFormat(locale() === "fr" ? "fr-FR" : "en-US", { month: "long", year: "numeric" }).format(fullAt) });
  const used = space.disk.total > 0 ? 1 - space.disk.free / space.disk.total : 0;
  return (
    <section className="getapp__card">
      <h2>{t("getApp.space.title")}</h2>
      <p>{t("getApp.space.free", { free: bytes(space.disk.free), total: bytes(space.disk.total) })}</p>
      <div className="getapp__meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)}>
        <span style={{ width: `${Math.min(100, used * 100)}%` }} />
      </div>
      <p>{t("getApp.space.used", { used: bytes(space.used.total) })}</p>
      {forecast && <p>{forecast}</p>}
    </section>
  );
}

type Device = "android" | "iphone" | "desktop";
const detect = (): Device => (/android/i.test(navigator.userAgent) ? "android" : /iphone|ipad/i.test(navigator.userAgent) ? "iphone" : "desktop");

/** Mettre Waysake sur son téléphone : APK Android, raccourci iPhone, ou QR code depuis l'ordinateur. */
export function GetApp() {
  const [device] = useState(detect);
  const [qr, setQr] = useState("");
  const [apk, setApk] = useState<boolean | null>(null);
  const [shortcut, setShortcut] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const host = location.host;

  useEffect(() => {
    QRCode.toString(`${location.origin}/app`, { type: "svg", margin: 1, color: { dark: "#16191b", light: "#ffffff" } }).then(setQr);
    const exists = (url: string, set: (ok: boolean) => void) =>
      fetch(url, { method: "HEAD" }).then((r) => set(r.ok && !r.headers.get("content-type")?.includes("text/html")), () => set(false));
    exists("/waysake.apk", setApk);
    exists("/waysake.shortcut", setShortcut);
  }, []);

  return (
    <div className="getapp">
      <Header title={t("getApp.title")} subtitle={t("getApp.subtitle")} />

      {device === "desktop" && (
        <section className="getapp__card getapp__qr-card">
          <div className="getapp__qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <div>
            <h2>{t("getApp.scan.title")}</h2>
            <p>{t("getApp.scan.text")}</p>
          </div>
        </section>
      )}

      {device !== "iphone" && (
        <section className="getapp__card">
          <h2>Android</h2>
          <ol className="getapp__steps">
            <li>
              {apk === false ? (
                <span>{t("getApp.android.missing")}</span>
              ) : (
                <a className="button" href="/waysake.apk" download="Waysake.apk">
                  {t("getApp.android.download")}
                </a>
              )}
            </li>
            <li>{t("getApp.android.install")}</li>
            <li>
              {t("getApp.android.address")}
              <span className="getapp__address">
                <code>{host}</code>
                <button className="button button--quiet button--small" onClick={() => navigator.clipboard?.writeText(host).then(() => setCopied(true))}>
                  {copied ? t("getApp.copied") : t("getApp.copy")}
                </button>
              </span>
            </li>
            <li>{t("getApp.android.permission")}</li>
          </ol>
        </section>
      )}

      <SpaceCard />

      {device !== "android" && (
        <section className="getapp__card">
          <h2>iPhone</h2>
          {shortcut ? (
            <ol className="getapp__steps">
              <li>
                <a className="button" href="/waysake.shortcut">
                  {t("getApp.iphone.install")}
                </a>
              </li>
              <li>{t("getApp.iphone.add")}</li>
              <li>{t("getApp.iphone.run")}</li>
              <li>{t("getApp.iphone.allow")}</li>
            </ol>
          ) : (
            <p>{t("getApp.iphone")}</p>
          )}
        </section>
      )}
    </div>
  );
}
