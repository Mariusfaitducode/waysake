import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api, type Media } from "../api.js";
import { useApi } from "../data.js";
import { count, monthLabel } from "../format.js";
import { Header } from "../components/Header.js";
import { EmptyState } from "../components/EmptyState.js";
import { PhotoGrid } from "../components/PhotoGrid.js";
import { Viewer } from "../components/Viewer.js";
import { useUpload } from "../shell/upload.js";
import "./Library.css";

type Section = { key: string; title: string; items: Media[] };

function sections(media: Media[]): Section[] {
  const map = new Map<string, Section>();
  for (const m of media) {
    const key = m.takenAtLocal?.slice(0, 7) ?? "undated";
    if (!map.has(key)) map.set(key, { key, title: m.takenAtLocal ? monthLabel(m.takenAtLocal) : "Sans date", items: [] });
    map.get(key)!.items.push(m);
  }
  // Le mois le plus récent en haut ; « Sans date » toujours en dernier.
  return [...map.values()].sort((a, b) => (a.key === "undated" ? 1 : b.key === "undated" ? -1 : b.key.localeCompare(a.key)));
}

export function Library() {
  const { data: media } = useApi(api.allMedia);
  const { data: unlocated } = useApi(api.unlocated);
  const { open: openUpload } = useUpload();
  const [open, setOpen] = useState<number | null>(null);
  const groups = useMemo(() => (media ? sections(media) : []), [media]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  return (
    <div className="library">
      <Header title="Photos" subtitle={media && media.length > 0 ? `${count(media.length, "photo", "photos et vidéos")}, de vous deux.` : undefined} />

      {unlocated && unlocated.total > 0 && (
        <Link to="/photos/a-localiser" className="library__locate">
          <span className="library__locate-pin" aria-hidden="true" />
          <span>
            <strong>{count(unlocated.total, "photo sans lieu", "photos sans lieu")}</strong>
            <small>Ajoute les lieux en quelques gestes : les voyages se rangeront tout seuls.</small>
          </span>
          <span className="library__locate-go" aria-hidden="true">›</span>
        </Link>
      )}

      {media?.length === 0 && (
        <EmptyState title="Le premier voyage commence ici." text="Ajoute les photos d'un voyage : Atlas les range toutes seules par date et par lieu.">
          <button className="button" onClick={openUpload}>
            Ajouter des photos
          </button>
        </EmptyState>
      )}

      {groups.map((g) => (
        <section key={g.key} className="library__section" aria-labelledby={`s-${g.key}`}>
          <h2 id={`s-${g.key}`} className="library__month">
            {g.title}
            <span>{g.items.length}</span>
          </h2>
          <PhotoGrid items={g.items} onOpen={(m) => setOpen(flat.indexOf(m))} />
        </section>
      ))}

      {open !== null && <Viewer items={flat} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}
