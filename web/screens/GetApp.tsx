import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Header } from "../components/Header.js";
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
      <Header title="Atlas sur ton téléphone" subtitle="Pour importer tes photos avec leurs lieux, directement depuis la photothèque." />

      {device === "desktop" && (
        <section className="getapp__card getapp__qr-card">
          <div className="getapp__qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <div>
            <h2>Scanne avec ton téléphone</h2>
            <p>L'appareil photo du téléphone ouvre cette page, avec le bon lien à télécharger. Tailscale doit être activé sur le téléphone.</p>
          </div>
        </section>
      )}

      {device !== "iphone" && (
        <section className="getapp__card">
          <h2>Android</h2>
          <ol className="getapp__steps">
            <li>
              {apk === false ? (
                <span>L'app n'est pas encore disponible sur cette tour.</span>
              ) : (
                <a className="button" href="/atlas.apk" download="Atlas.apk">
                  Télécharger l'app Atlas
                </a>
              )}
            </li>
            <li>Ouvre le fichier téléchargé. Android demande d'autoriser l'installation depuis Chrome : accepte, une seule fois.</li>
            <li>
              Dans l'app, tape l'adresse de la tour :
              <span className="getapp__address">
                <code>{host}</code>
                <button className="button button--quiet button--small" onClick={() => navigator.clipboard?.writeText(host).then(() => setCopied(true))}>
                  {copied ? "Copiée" : "Copier"}
                </button>
              </span>
            </li>
            <li>Autorise l'accès aux photos (accès complet) : c'est ce qui garde les lieux de tes photos.</li>
          </ol>
        </section>
      )}

      {device !== "android" && (
        <section className="getapp__card">
          <h2>iPhone</h2>
          <p>Le raccourci « Importer dans Atlas » arrive bientôt. En attendant, depuis un ordinateur, glisse les photos exportées dans Atlas : leurs lieux sont conservés.</p>
        </section>
      )}
    </div>
  );
}
