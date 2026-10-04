import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api.js";
import { useDataVersion } from "../data.js";
import { createUploadQueue, type UploadQueue } from "../upload-queue.js";
import { UploadSheet } from "../components/UploadSheet.js";
import { inApp, tellApp } from "../native.js";

/**
 * L'envoi vit au niveau de l'application : on peut changer d'écran pendant qu'un lot part,
 * et déposer des fichiers n'importe où sur la fenêtre.
 */
const UploadCtx = createContext<{ open: () => void; queue: UploadQueue | null }>({ open: () => {}, queue: null });
export const useUpload = () => useContext(UploadCtx);

export function UploadProvider({ children }: { children: ReactNode }) {
  const { bump } = useDataVersion();
  // Chaque lot passe par le sas : une session d'import, puis l'écran de validation.
  const session = useRef<Promise<number> | null>(null);
  const [importId, setImportId] = useState<number | null>(null);
  const queue = useMemo(
    () =>
      createUploadQueue({
        concurrency: 3,
        upload: async (f) => api.upload(f, await session.current!),
      }),
    [],
  );
  const [visible, setVisible] = useState(false);

  const send = useCallback(
    (files: File[]) => {
      setVisible(true);
      session.current ??= api.newImport().then((r) => {
        setImportId(r.id);
        return r.id;
      });
      queue.add(files).then(bump);
    },
    [queue, bump],
  );

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      send([...e.dataTransfer.files]);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [send]);

  return (
    <UploadCtx.Provider value={{ open: () => (inApp() ? tellApp({ type: "import" }) : setVisible(true)), queue }}>
      {children}
      {visible && (
        <UploadSheet
          queue={queue}
          importId={importId}
          onSend={send}
          onRetry={() => queue.retryFailed().then(bump)}
          onClose={() => {
            queue.reset();
            session.current = null;
            setImportId(null);
            setVisible(false);
          }}
        />
      )}
    </UploadCtx.Provider>
  );
}
