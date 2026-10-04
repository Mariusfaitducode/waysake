import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Header } from "../components/Header.js";
import { t } from "../i18n/index.js";
import "./GetApp.css";

type Device = "android" | "iphone" | "desktop";
const detect = (): Device => (/android/i.test(navigator.userAgent) ? "android" : /iphone|ipad/i.test(navigator.userAgent) ? "iphone" : "desktop");

/** Mettre Atlas sur son téléphone : APK Android, raccourci iPhone, ou QR code depuis l'ordinateur. */
export function GetApp() {
  const [device] = useState(detect);
  const [qr, setQr] = useState("");
  const [apk, setApk] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const host = location.host;

  useEffect(() => {
    QRCode.toString(`${location.origin}/app`, { type: "svg", margin: 1, color: { dark: "#16191b", light: "#ffffff" } }).then(setQr);
    fetch("/atlas.apk", { method: "HEAD" }).then((r) => setApk(r.ok && !r.headers.get("content-type")?.includes("text/html")), () => setApk(false));
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
                <a className="button" href="/atlas.apk" download="Atlas.apk">
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

      {device !== "android" && (
        <section className="getapp__card">
          <h2>iPhone</h2>
          <p>{t("getApp.iphone")}</p>
        </section>
      )}
    </div>
  );
}
