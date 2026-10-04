import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { locale, t } from "../i18n/index.js";
import { isDarkTheme } from "../trip-colors.js";
import "./PinMap.css";

// Thème effectif : l'attribut data-theme d'abord (choix forcé), sinon le système.
const dark = isDarkTheme;
const styleUrl = () => `https://tiles.openfreemap.org/styles/${dark() ? "dark" : "positron"}`;

/**
 * Pointer un lieu précis : un tap pose l'épingle, on peut aussi la faire glisser. Les petits villages et les
 * chemins sont sur la carte même quand la recherche ne les connaît pas.
 */
export function PinMap({ pin, center, zoom, onPick }: { pin: { lat: number; lon: number } | null; center: [number, number]; zoom: number; onPick: (lat: number, lon: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({ container: el.current!, style: styleUrl(), center, zoom, attributionControl: false, dragRotate: false, pitchWithRotate: false });
    } catch {
      return;
    }
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.once("styledata", () => {
      for (const layer of m.getStyle().layers ?? [])
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field") !== undefined)
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", `name:${locale()}`], ["get", "name"]]);
    });
    m.on("click", (e) => pick.current(Math.round(e.lngLat.lat * 1e5) / 1e5, Math.round(e.lngLat.lng * 1e5) / 1e5));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recentrer quand on arrive d'une recherche (nouveau centre), sans bouger quand on ajuste l'épingle.
  useEffect(() => {
    map.current?.flyTo({ center, zoom, duration: 700 });
  }, [center[0], center[1], zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const node = document.createElement("div");
      node.className = "pin-map__pin";
      node.innerHTML = "<span></span>";
      marker.current = new maplibregl.Marker({ element: node, anchor: "bottom", draggable: true }).setLngLat([pin.lon, pin.lat]).addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current!.getLngLat();
        pick.current(Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5);
      });
    } else marker.current.setLngLat([pin.lon, pin.lat]);
  }, [pin?.lat, pin?.lon]);

  // MapLibre ajoute ses classes au conteneur : React ne touche qu'à l'enveloppe.
  return (
    <div className="pin-map" role="application" aria-label={t("place.mapLabel")}>
      <div ref={el} className="pin-map__canvas" />
    </div>
  );
}
