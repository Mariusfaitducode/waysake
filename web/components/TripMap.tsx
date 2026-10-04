import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
type Stop = { title: string; centerLat: number; centerLon: number };
import { locale, t } from "../i18n/index.js";
import "./TripMap.css";

const dark = () => matchMedia("(prefers-color-scheme: dark)").matches;
// Tuiles OpenFreeMap : gratuites, sans clé ni compte.
const styleUrl = () => `https://tiles.openfreemap.org/styles/${dark() ? "dark" : "positron"}`;

/** L'itinéraire : la route jour par jour en vert autoroute, les étapes en panneaux numérotés. */
export function TripMap({ route, chapters, onChapter, compact }: { route: [number, number][]; chapters: Stop[]; onChapter?: (index: number) => void; compact?: boolean }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: el.current!,
        style: styleUrl(),
        attributionControl: false,
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        bounds: bounds(route, chapters),
        fitBoundsOptions: { padding: 48, maxZoom: 9 },
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": t("map.zoomWindows"),
          "CooperativeGesturesHandler.MacHelpText": t("map.zoomMac"),
          "CooperativeGesturesHandler.MobileHelpText": t("map.twoFingers"),
        },
      });
    } catch {
      return;
    }
    // Crédits OpenStreetMap obligatoires, mais repliés en un petit « i ».
    const credits = new maplibregl.AttributionControl({ compact: true });
    m.addControl(credits, "bottom-right");
    m.once("load", () => m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    // Noms de lieux dans la langue de l'interface quand ils existent.
    m.once("styledata", () => {
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field") !== undefined)
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", `name:${locale()}`], ["get", "name"]]);
      }
    });
    const color = getComputedStyle(document.documentElement).getPropertyValue("--autostrada").trim() || "#0b7a4b";
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } } });
      m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": dark() ? 0.15 : 0.9 } });
      m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": color, "line-width": 3.5 } });
    });
    chapters.forEach((c, i) => {
      const holder = document.createElement("div");
      const node = document.createElement("button");
      holder.appendChild(node);
      node.className = "stop";
      node.setAttribute("aria-label", t("map.stop", { n: i + 1, title: c.title }));
      node.innerHTML = `<span>${i + 1}</span>`;
      node.addEventListener("click", () => onChapter?.(i));
      new maplibregl.Marker({ element: holder }).setLngLat([c.centerLon, c.centerLat]).addTo(m);
    });
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(route), chapters.length]);

  return <div ref={el} className={`trip-map${compact ? " trip-map--compact" : ""}`} />;
}

function bounds(route: [number, number][], chapters: Stop[]): [[number, number], [number, number]] {
  const pts: [number, number][] = [...route, ...chapters.map((c) => [c.centerLon, c.centerLat] as [number, number])];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const pad = 0.05;
  return [
    [Math.min(...lons) - pad, Math.min(...lats) - pad],
    [Math.max(...lons) + pad, Math.max(...lats) + pad],
  ];
}
