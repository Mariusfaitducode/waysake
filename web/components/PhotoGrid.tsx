import { useLayoutEffect, useRef, useState } from "react";
type GridItem = { id: number; width: number | null; height: number | null; hasThumbs: boolean; thumb: string; kind?: string; reactions?: Partial<Record<string, string[]>> };
import { justify } from "../justify.js";
import { t } from "../i18n/index.js";
import "./PhotoGrid.css";

/** Pastille discrète : les réactions reçues (deux au plus) et leur nombre total. */
function ReactionBadge({ reactions }: { reactions?: GridItem["reactions"] }) {
  const entries = Object.entries(reactions ?? {}).filter(([, who]) => who && who.length > 0) as [string, string[]][];
  if (!entries.length) return null;
  const total = entries.reduce((n, [, who]) => n + who.length, 0);
  return (
    <span className="grid__reactions" aria-hidden="true">
      {entries.slice(0, 2).map(([emoji]) => emoji).join("")}
      {total > 1 && <b>{total}</b>}
    </span>
  );
}

const ratio = (m: GridItem) => (m.width && m.height ? m.width / m.height : 1);

/** Grille justifiée. En mode sélection, un tap coche/décoche au lieu d'ouvrir la photo. */
export function PhotoGrid<T extends GridItem>({
  items,
  onOpen,
  selected,
}: {
  items: T[];
  onOpen: (m: T) => void;
  selected?: (m: T) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grille fine façon Photos : des joints de 2 px sur téléphone, 4 px sur grand écran.
  const gap = width < 600 ? 2 : 4;
  const targetHeight = width < 600 ? 118 : width < 1100 ? 190 : 230;
  const rows = width ? justify(items.map(ratio), { width, targetHeight, gap }) : [];

  return (
    <div ref={ref} className="grid" style={{ "--gap": `${gap}px` } as React.CSSProperties}>
      {rows.map((row, r) => (
        <div key={r} className="grid__row" style={{ height: row.height }}>
          {row.items.map(({ index, width: w }) => {
            const m = items[index];
            return (
              <button
                key={m.id}
                className={`grid__cell${selected ? " is-selectable" : ""}${selected && !selected(m) ? " is-off" : ""}`}
                style={{ width: w }}
                onClick={() => onOpen(m)}
                aria-pressed={selected ? selected(m) : undefined}
              >
                {m.hasThumbs ? (
                  <img
                    src={m.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
                  />
                ) : (
                  <span className="grid__placeholder" aria-hidden="true" />
                )}
                {m.kind === "video" && (
                  <span className="grid__video" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="12" height="12"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
                  </span>
                )}
                {!selected && <ReactionBadge reactions={m.reactions} />}
                {selected && <span className="grid__check" aria-hidden="true" />}
                <span className="sr-only">{selected ? t("grid.keep") : t("grid.open")}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
