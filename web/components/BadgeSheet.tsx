import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Sheet } from "./Sheet.js";
import { t } from "../i18n/index.js";
import { rich } from "../i18n/rich.js";
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
    <Sheet title={t("badge.title")} onClose={onClose}>
      <p className="badge__lead">{rich(t("badge.lead", { title }))}</p>
      <div className="badge__card">
        <div className="badge__qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="badge__link">
          <code>{url.replace(/^https?:\/\//, "")}</code>
          <button className="button button--quiet button--small" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}>
            {copied ? t("badge.copied") : t("badge.copy")}
          </button>
        </div>
      </div>

      {isPrivateHost(location.hostname) && <p className="badge__warn">{t("badge.localAddress")}</p>}

      {canWriteNfc ? (
        <div className="badge__nfc">
          <button className="button" onClick={writeNfc} disabled={nfc === "waiting"}>
            {nfc === "waiting" ? t("badge.nfc.waiting") : nfc === "done" ? t("badge.nfc.done") : t("badge.nfc.write")}
          </button>
          {nfc === "error" && <p className="badge__warn">{t("badge.nfc.error")}</p>}
        </div>
      ) : (
        <ol className="badge__steps">
          <li>{rich(t("badge.ios.step1"))}</li>
          <li>{rich(t("badge.ios.step2"))}</li>
          <li>{rich(t("badge.ios.step3"))}</li>
        </ol>
      )}
    </Sheet>
  );
}
