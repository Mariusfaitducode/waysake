import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Sheet } from "./Sheet.js";
import "./BadgeSheet.css";

type NdefWriter = { write: (msg: { records: { recordType: string; data: string }[] }) => Promise<void> };
declare global {
  interface Window {
    NDEFReader?: new () => NdefWriter;
  }
}

const isPrivateHost = (h: string) => h === "localhost" || /^(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);

/** Badge du frigo : un lien court qui ouvre directement ce voyage, en QR code ou écrit sur un badge NFC. */
export function BadgeSheet({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const url = `${location.origin}/v/${slug}`;
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [nfc, setNfc] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const canWriteNfc = typeof window !== "undefined" && "NDEFReader" in window;

  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#16191b", light: "#ffffff" } }).then(setSvg);
  }, [url]);

  async function writeNfc() {
    try {
      setNfc("waiting");
      await new window.NDEFReader!().write({ records: [{ recordType: "url", data: url }] });
      setNfc("done");
    } catch {
      setNfc("error");
    }
  }

  return (
    <Sheet title="Badge du frigo" onClose={onClose}>
      <p className="badge__lead">
        Ce lien ouvre directement <strong>{title}</strong>. Il ne change jamais, même si tu renommes le voyage.
      </p>
      <div className="badge__card">
        <div className="badge__qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="badge__link">
          <code>{url.replace(/^https?:\/\//, "")}</code>
          <button
            className="button button--quiet button--small"
            onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          >
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
        </div>
      </div>

      {isPrivateHost(location.hostname) && (
        <p className="badge__warn">
          Tu utilises Atlas via une adresse locale. Pour un badge qui marche partout, ouvre Atlas avec son adresse Tailscale (https://…ts.net), puis reviens ici.
        </p>
      )}

      {canWriteNfc ? (
        <div className="badge__nfc">
          <button className="button" onClick={writeNfc} disabled={nfc === "waiting"}>
            {nfc === "waiting" ? "Approche le badge du téléphone…" : nfc === "done" ? "Badge écrit" : "Écrire sur un badge NFC"}
          </button>
          {nfc === "error" && <p className="badge__warn">Le badge n'a pas pu être écrit. Réessaie en le tenant contre le haut du téléphone.</p>}
        </div>
      ) : (
        <ol className="badge__steps">
          <li>Installe l'app gratuite <strong>NFC Tools</strong> sur ton iPhone.</li>
          <li>
            Ouvre <em>Écrire</em> → <em>Ajouter un enregistrement</em> → <em>URL / URI</em>, et colle le lien.
          </li>
          <li>Touche <em>Écrire</em>, puis approche le badge du haut de l'iPhone. C'est fini : un simple contact ouvrira ce voyage.</li>
        </ol>
      )}
    </Sheet>
  );
}
