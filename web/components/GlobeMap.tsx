import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, Marker, PaddingOptions, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { resourceUrl, type Wish } from "../api.js";
import { tripColorHex, type TripColorId } from "../trip-colors.js";
import "./GlobeMap.css";

/** Un voyage tel que le globe le dessine : ses étapes dans l'ordre, [lon, lat]. */
export type GlobeTrip = { slug: string; name: string; color: TripColorId; stops: [number, number][] };

type Props = {
  trips: GlobeTrip[];
  wishes: Wish[];
  visited: string[];
  /** Voyage choisi (la caméra s'y pose). */
  selected: string | null;
  /** Voyage mis en avant (survol de la légende ou du tracé, sinon le voyage choisi) : les autres s'estompent. */
  focus: string | null;
  /** Marges occupées par l'interface posée sur le globe (légende, cartes du bas). */
  padding: PaddingOptions;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
};

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Couleurs du globe : jetons --globe-* et --bg de web/styles/tokens.css, lus à l'exécution (MapLibre ne lit pas le CSS). */
function palette() {
  return {
    ocean: css("--globe-ocean"),
    land: css("--globe-land"),
    visited: css("--globe-visited"),
    border: css("--globe-border"),
    sky: css("--globe-sky"),
    horizon: css("--globe-horizon"),
    halo: css("--bg"),
  };
}

/** Itinéraires (une ligne par voyage) et étapes (la dernière marquée), colorés pour le thème courant. */
function tripFeatures(trips: GlobeTrip[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const trip of trips) {
    const color = tripColorHex(trip.color);
    if (trip.stops.length > 1) features.push({ type: "Feature", properties: { slug: trip.slug, color }, geometry: { type: "LineString", coordinates: trip.stops } });
    trip.stops.forEach((p, i) => features.push({ type: "Feature", properties: { slug: trip.slug, color, last: i === trip.stops.length - 1 }, geometry: { type: "Point", coordinates: p } }));
  }
  return { type: "FeatureCollection", features };
}

/** Opacité d'un élément de voyage : pleine pour le voyage mis en avant (ou pour tous), estompée pour les autres. */
const dim = (focus: string | null, full: number, faded: number) => (focus ? ["case", ["==", ["get", "slug"], focus], full, faded] : full) as never;
const lines = ["==", ["geometry-type"], "LineString"] as never;
const points = ["==", ["geometry-type"], "Point"] as never;
const last = ["boolean", ["get", "last"], false] as never;

/** Style complet du globe. Reconstruit au changement de thème (setStyle en mode diff : seules les couleurs changent). */
function buildStyle(trips: GlobeTrip[], visited: string[], focus: string | null): StyleSpecification {
  const p = palette();
  return {
    version: 8,
    projection: { type: "globe" },
    sky: { "sky-color": p.sky, "horizon-color": p.horizon, "fog-color": p.sky, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 0.6, 7, 0] },
    sources: {
      countries: { type: "geojson", data: new URL(resourceUrl("/api/geo/countries.geojson"), location.href).href },
      trips: { type: "geojson", data: tripFeatures(trips) },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": p.ocean } },
      { id: "land", type: "fill", source: "countries", paint: { "fill-color": p.land } },
      { id: "visited", type: "fill", source: "countries", filter: ["in", ["get", "code"], ["literal", visited]], paint: { "fill-color": p.visited } },
      { id: "borders", type: "line", source: "countries", paint: { "line-color": p.border, "line-width": 0.6 } },
      // Liseré couleur de page sous chaque itinéraire : il se détache des frontières et des autres voyages.
      { id: "route-casing", type: "line", source: "trips", filter: lines, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.halo, "line-opacity": dim(focus, 0.9, 0.35), "line-width": ["interpolate", ["linear"], ["zoom"], 1, 4.5, 5, 7] } },
      { id: "route", type: "line", source: "trips", filter: lines, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-opacity": dim(focus, 1, 0.3), "line-width": ["interpolate", ["linear"], ["zoom"], 1, 2, 5, 3.2] } },
      { id: "stop-halo", type: "circle", source: "trips", filter: points, paint: { "circle-color": p.halo, "circle-opacity": dim(focus, 1, 0.35), "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", last, 5, 3.4], 5, ["case", last, 7.5, 5.6]], "circle-pitch-alignment": "map" } },
      { id: "stop", type: "circle", source: "trips", filter: points, paint: { "circle-color": ["get", "color"], "circle-opacity": dim(focus, 1, 0.3), "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", last, 3.6, 2.2], 5, ["case", last, 5.6, 3.8]], "circle-pitch-alignment": "map" } },
      // Zone de clic plus large que le trait (invisible).
      { id: "route-hit", type: "line", source: "trips", filter: lines, paint: { "line-color": "#000", "line-opacity": 0, "line-width": 16 } },
      { id: "stop-hit", type: "circle", source: "trips", filter: points, paint: { "circle-color": "#000", "circle-opacity": 0, "circle-radius": 11 } },
    ],
  };
}

/** Distance angulaire (degrés) entre deux points : au-delà de ~80° du centre, un point est de l'autre côté du globe. */
function arc([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const r = Math.PI / 180;
  const c = Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}

function boundsOf(stops: [number, number][]): [[number, number], [number, number]] {
  const lons = stops.map((s) => s[0]);
  const lats = stops.map((s) => s[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

/**
 * Le globe de Waysake : gris neutre dessiné à partir des contours de pays servis par la tour (aucune tuile,
 * aucun réseau), pays visités en gris plus soutenu, l'itinéraire de chaque voyage dans sa couleur (ligne sur
 * un liseré, points d'étape, le dernier plus gros), le nom du voyage au bout, un anneau par envie.
 */
export function GlobeMap({ trips, wishes, visited, selected, focus, padding, onSelect, onHover }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Dernières valeurs, pour reconstruire le style au changement de thème et pour les écouteurs MapLibre.
  const live = useRef({ trips, visited, focus, padding, onSelect, onHover });
  live.current = { trips, visited, focus, padding, onSelect, onHover };
  const labels = useRef<Map<string, Marker>>(new Map());
  const framed = useRef(false);

  // Création de la carte (une seule fois).
  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: el.current!,
        attributionControl: false,
        center: [12, 40],
        zoom: window.innerWidth < 700 ? 0.9 : 1.5,
        renderWorldCopies: false,
        style: buildStyle(live.current.trips, live.current.visited, live.current.focus),
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    m.touchPitch.disable();
    m.dragRotate.disable();
    m.keyboard.disableRotation();
    m.on("load", () => setReady(true));

    // Survol et clic sur un tracé ou une étape.
    const hit = ["route-hit", "stop-hit"];
    let hovered: string | null = null;
    m.on("mousemove", hit, (e) => {
      const slug = (e.features?.[0]?.properties?.slug as string) ?? null;
      m.getCanvas().style.cursor = "pointer";
      if (slug !== hovered) live.current.onHover((hovered = slug));
    });
    m.on("mouseleave", hit, () => {
      m.getCanvas().style.cursor = "";
      live.current.onHover((hovered = null));
    });
    m.on("click", (e) => {
      const f = m.queryRenderedFeatures(e.point, { layers: hit })[0];
      live.current.onSelect((f?.properties?.slug as string) ?? null);
    });

    // Rotation lente tant qu'il n'y a aucun voyage à montrer ; le premier geste l'arrête.
    let spinning = true;
    const stop = () => (spinning = false);
    m.on("mousedown", stop);
    m.on("touchstart", stop);
    m.on("wheel", stop);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const spin = () => {
      if (spinning && !reduce && live.current.trips.length === 0 && !m.isMoving()) {
        const c = m.getCenter();
        m.jumpTo({ center: [c.lng + 0.06, c.lat] });
      }
      frame = requestAnimationFrame(spin);
    };
    m.on("load", () => (frame = requestAnimationFrame(spin)));

    // Clair / sombre : système ou attribut data-theme. Le style est recalculé avec les jetons du nouveau thème.
    const retheme = () => {
      const { trips, visited, focus } = live.current;
      m.setStyle(buildStyle(trips, visited, focus), { diff: true });
    };
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);
    const watch = new MutationObserver(retheme);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelAnimationFrame(frame);
      mq.removeEventListener("change", retheme);
      watch.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Pays visités.
  useEffect(() => {
    const m = map.current;
    if (m && ready) m.setFilter("visited", ["in", ["get", "code"], ["literal", visited]]);
  }, [visited, ready]);

  // Itinéraires et étapes, plus le nom de chaque voyage au bout de sa route.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("trips") as GeoJSONSource | undefined)?.setData(tripFeatures(trips));

    for (const mk of labels.current.values()) mk.remove();
    labels.current.clear();
    for (const trip of trips) {
      const end = trip.stops[trip.stops.length - 1];
      if (!end) continue;
      const holder = document.createElement("div");
      const node = document.createElement("button");
      node.type = "button";
      node.className = "globe-label";
      node.textContent = trip.name;
      node.tabIndex = -1; // la légende et les cartes du bas portent la navigation au clavier
      node.addEventListener("click", (e) => (e.stopPropagation(), live.current.onSelect(trip.slug)));
      node.addEventListener("pointerenter", () => live.current.onHover(trip.slug));
      node.addEventListener("pointerleave", () => live.current.onHover(null));
      holder.appendChild(node);
      labels.current.set(trip.slug, new maplibregl.Marker({ element: holder, anchor: "left", offset: [9, 0] }).setLngLat(end).addTo(m));
    }

    // Les noms ne se chevauchent jamais : priorité au voyage mis en avant, puis au plus récent.
    const layout = () => {
      const center = m.getCenter().toArray() as [number, number];
      const { focus, trips } = live.current;
      const order = [...trips].sort((a, b) => Number(b.slug === focus) - Number(a.slug === focus));
      const taken: DOMRect[] = [];
      for (const trip of order) {
        const mk = labels.current.get(trip.slug);
        const node = mk?.getElement().firstElementChild as HTMLElement | undefined;
        if (!mk || !node) continue;
        const end = trip.stops[trip.stops.length - 1];
        const p = m.project(end);
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        // À droite du point si possible, sinon à gauche (bord de l'écran ou nom voisin), sinon caché.
        const width = m.getContainer().clientWidth;
        const boxAt = (left: boolean) => new DOMRect(left ? p.x - 9 - w : p.x + 9, p.y - h / 2, w, h);
        const fits = (b: DOMRect) => b.left >= 8 && b.right <= width - 8 && !taken.some((r) => b.left < r.right + 4 && b.right + 4 > r.left && b.top < r.bottom && b.bottom > r.top);
        const flip = !fits(boxAt(false)) && fits(boxAt(true));
        const box = boxAt(flip);
        node.classList.toggle("is-flip", flip);
        const hidden = !fits(box) || arc(center, end) > 78 || m.getZoom() < 1.1;
        node.classList.toggle("is-hidden", hidden);
        node.classList.toggle("is-dim", !!focus && focus !== trip.slug);
        if (!hidden) taken.push(box);
      }
    };
    layout();
    m.on("moveend", layout);
    m.on("zoomend", layout);
    return () => {
      m.off("moveend", layout);
      m.off("zoomend", layout);
    };
  }, [trips, ready]);

  // Premier cadrage : tous les voyages d'un coup d'œil (une fois les étapes connues, sans animation).
  useEffect(() => {
    const m = map.current;
    const stops = trips.flatMap((t) => t.stops);
    if (!m || !ready || framed.current || stops.length === 0) return;
    framed.current = true;
    m.fitBounds(boundsOf(stops), { padding: live.current.padding, maxZoom: 4.2, duration: 0 });
  }, [trips, ready]);

  // Voyage mis en avant : les autres s'estompent (tracés et noms).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setPaintProperty("route-casing", "line-opacity", dim(focus, 0.9, 0.35));
    m.setPaintProperty("route", "line-opacity", dim(focus, 1, 0.3));
    m.setPaintProperty("stop-halo", "circle-opacity", dim(focus, 1, 0.35));
    m.setPaintProperty("stop", "circle-opacity", dim(focus, 1, 0.3));
    for (const [slug, mk] of labels.current) mk.getElement().firstElementChild?.classList.toggle("is-dim", !!focus && focus !== slug);
    // Le nom du voyage mis en avant passe devant les autres.
    for (const [slug, mk] of labels.current) mk.getElement().classList.toggle("is-front", slug === focus);
  }, [focus, ready]);

  // Voyage choisi : la caméra cadre son itinéraire.
  useEffect(() => {
    const m = map.current;
    const trip = live.current.trips.find((x) => x.slug === selected);
    if (!m || !ready || !trip || trip.stops.length === 0) return;
    m.fitBounds(boundsOf(trip.stops), { padding: live.current.padding, maxZoom: 6, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1400 });
  }, [selected, ready]);

  // Envies : un anneau.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const rings: Marker[] = [];
    for (const w of wishes) {
      if (w.done || w.lat === null || w.lon === null) continue;
      const node = document.createElement("span");
      node.className = "wish-pin";
      node.title = w.title;
      rings.push(new maplibregl.Marker({ element: node }).setLngLat([w.lon, w.lat]).addTo(m));
    }
    return () => rings.forEach((r) => r.remove());
  }, [wishes]);

  if (failed) return null;
  return (
    <div className="globe-map">
      <div ref={el} className="globe-map__canvas" />
    </div>
  );
}
