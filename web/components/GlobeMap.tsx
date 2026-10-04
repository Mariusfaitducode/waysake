import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TripSummary, Wish } from "../api.js";
import { cluster, kmForPixels } from "../cluster.js";
import "./GlobeMap.css";

type Props = {
  trips: TripSummary[];
  wishes: Wish[];
  visited: string[];
  selected: string | null;
  onSelect: (slug: string) => void;
};

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const dark = () => matchMedia("(prefers-color-scheme: dark)").matches;

function palette() {
  return dark()
    ? { ocean: "#0b1416", land: "#1f2624", visited: css("--autostrada"), border: "#33403c", sky: "#050807", horizon: "#16302a" }
    : { ocean: "#dfe7e4", land: "#f7f6f2", visited: css("--autostrada"), border: "#c9d3cf", sky: "#ffffff", horizon: "#cfe3da" };
}

/**
 * Le globe d'Atlas : dessiné à partir des contours de pays servis par la tour (aucune tuile, aucun réseau),
 * pays visités en vert autoroute, une vignette photo par voyage, un anneau par envie.
 */
export function GlobeMap({ trips, wishes, visited, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const spinning = useRef(true);
  const [failed, setFailed] = useState(false);

  // Création de la carte (une seule fois).
  useEffect(() => {
    let m: MlMap;
    const p = palette();
    try {
      m = new maplibregl.Map({
        container: el.current!,
        attributionControl: false,
        center: [14, 38],
        zoom: window.innerWidth < 700 ? 0.9 : 1.6,
        renderWorldCopies: false,
        style: {
          version: 8,
          projection: { type: "globe" },
          sky: { "sky-color": p.sky, "horizon-color": p.horizon, "fog-color": p.sky, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 0.6, 7, 0] },
          sources: { countries: { type: "geojson", data: `${location.origin}/api/geo/countries.geojson` } },
          layers: [
            { id: "ocean", type: "background", paint: { "background-color": p.ocean } },
            { id: "land", type: "fill", source: "countries", paint: { "fill-color": p.land } },
            { id: "visited", type: "fill", source: "countries", filter: ["in", ["get", "code"], ["literal", []]], paint: { "fill-color": p.visited, "fill-opacity": 0.32 } },
            { id: "borders", type: "line", source: "countries", paint: { "line-color": p.border, "line-width": 0.6 } },
          ],
        },
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    m.touchPitch.disable();
    m.dragRotate.disable();

    // Rotation lente au repos ; le premier geste l'arrête pour de bon.
    const stop = () => (spinning.current = false);
    m.on("mousedown", stop);
    m.on("touchstart", stop);
    m.on("wheel", stop);
    let frame = 0;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spin = () => {
      if (spinning.current && !reduce && !m.isMoving()) {
        const c = m.getCenter();
        m.jumpTo({ center: [c.lng + 0.06, c.lat] });
      }
      frame = requestAnimationFrame(spin);
    };
    m.on("load", () => (frame = requestAnimationFrame(spin)));

    // Clair / sombre suit le système.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const retheme = () => {
      const q = palette();
      m.setPaintProperty("ocean", "background-color", q.ocean);
      m.setPaintProperty("land", "fill-color", q.land);
      m.setPaintProperty("visited", "fill-color", q.visited);
      m.setPaintProperty("borders", "line-color", q.border);
      m.setSky({ "sky-color": q.sky, "horizon-color": q.horizon, "fog-color": q.sky });
    };
    mq.addEventListener("change", retheme);
    return () => {
      cancelAnimationFrame(frame);
      mq.removeEventListener("change", retheme);
      m.remove();
      map.current = null;
    };
  }, []);

  // Pays visités.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => m.setFilter("visited", ["in", ["get", "code"], ["literal", visited]]);
    if (m.isStyleLoaded()) apply();
    else m.once("load", apply);
  }, [visited]);

  // Vignettes des voyages (regroupées quand elles se chevauchent) et anneaux des envies.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let lastKey = "";
    const draw = () => {
      const points = trips.map((t) => ({ id: t.slug, lat: t.centerLat, lon: t.centerLon, t }));
      const groups = cluster(points, kmForPixels(58, m.getZoom()));
      const key = groups.map((g) => g.map((p) => p.id).join("+")).join("|");
      if (key === lastKey) return;
      lastKey = key;
      for (const [id, mk] of markers.current) if (!id.startsWith("wish-")) (mk.remove(), markers.current.delete(id));
      for (const g of groups) {
        const lead = g[0].t;
        const total = g.reduce((n, p) => n + p.t.mediaCount, 0);
        // MapLibre place le marqueur avec un transform : l'animation se fait sur l'élément intérieur.
        const holder = document.createElement("div");
        const node = document.createElement("button");
        node.className = g.length > 1 ? "pin pin--group" : "pin";
        node.setAttribute("aria-label", g.length > 1 ? `${g.length} voyages : ${g.map((p) => p.t.title).join(", ")}` : `${lead.title}, ${lead.mediaCount} photos`);
        node.innerHTML = `${lead.cover ? `<img src="${lead.cover}" alt="" draggable="false">` : ""}<span>${g.length > 1 ? g.length : total}</span>`;
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          spinning.current = false;
          if (g.length === 1) return onSelect(lead.slug);
          const lons = g.map((p) => p.lon);
          const lats = g.map((p) => p.lat);
          m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 120, maxZoom: 6, duration: 1400 });
        });
        holder.appendChild(node);
        const id = g.length > 1 ? `group-${key}-${lead.slug}` : lead.slug;
        markers.current.set(id, new maplibregl.Marker({ element: holder, anchor: "bottom" }).setLngLat([lead.centerLon, lead.centerLat]).addTo(m));
      }
    };
    draw();
    m.on("zoomend", draw);

    for (const w of wishes) {
      if (w.done || w.lat === null || w.lon === null) continue;
      const node = document.createElement("span");
      node.className = "wish-pin";
      node.title = w.title;
      markers.current.set(`wish-${w.id}`, new maplibregl.Marker({ element: node }).setLngLat([w.lon, w.lat]).addTo(m));
    }
    return () => {
      m.off("zoomend", draw);
      for (const mk of markers.current.values()) mk.remove();
      markers.current.clear();
    };
  }, [trips, wishes, onSelect]);

  // Sélection : la caméra plonge vers le voyage.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [slug, mk] of markers.current) mk.getElement().firstElementChild?.classList.toggle("is-selected", slug === selected);
    const t = trips.find((x) => x.slug === selected);
    if (t) {
      spinning.current = false;
      m.flyTo({ center: [t.centerLon, t.centerLat], zoom: Math.max(m.getZoom(), 3.4), duration: 1800, essential: true, padding: { bottom: 180, top: 0, left: 0, right: 0 } });
    }
  }, [selected, trips]);

  if (failed) return null;
  return <div ref={el} className="globe-map" />;
}
