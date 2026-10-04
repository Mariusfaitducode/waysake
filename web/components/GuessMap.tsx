import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { locale, t } from "../i18n/index.js";
import "./GuessMap.css";

export type Pin = { lat: number; lon: number; color: string; label: string; kind?: "answer" | "guess" };

const dark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const styleUrl = () => `https://tiles.openfreemap.org/styles/${dark() ? "dark" : "positron"}`;
const EUROPE: [number, number] = [12, 46];

/**
 * Carte du jeu : un tap pose (ou déplace) son épingle ; une fois la manche révélée, toutes les épingles et le bon
 * lieu s'affichent, reliés par un trait, et la carte cadre l'ensemble.
 */
export function GuessMap({ pin, pins, onPick, start, round }: { pin: { lat: number; lon: number } | null; pins: Pin[]; onPick?: (lat: number, lon: number) => void; start?: [number, number]; round?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({ container: el.current!, style: styleUrl(), center: start ?? EUROPE, zoom: 3.6, attributionControl: false, dragRotate: false, pitchWithRotate: false });
    } catch {
      return;
    }
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.once("styledata", () => {
      for (const layer of m.getStyle().layers ?? [])
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field") !== undefined)
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", `name:${locale()}`], ["get", "name"]]);
    });
    m.on("click", (e) => pick.current?.(e.lngLat.lat, e.lngLat.lng));
    m.on("load", () => {
      m.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // MapLibre ne lit pas le CSS : le trait reprend le jeton --text, lu à l'instant.
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#141416";
      m.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": ink, "line-width": 1.6, "line-dasharray": [2, 2], "line-opacity": 0.55 } });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Nouvelle manche : retour à la vue d'ensemble (le cadrage précédent serait un indice).
  useEffect(() => {
    map.current?.jumpTo({ center: start ?? EUROPE, zoom: 3.6 });
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Épingles : la mienne (en attente) et, après révélation, toutes les autres et le bon lieu.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of markers.current) mk.remove();
    markers.current = [];
    const all: Pin[] = [...pins, ...(pin ? [{ ...pin, color: "var(--accent)", label: t("game.myPin") }] : [])];
    for (const p of all) {
      const node = document.createElement("div");
      node.className = `guess-pin${p.kind === "answer" ? " is-answer" : ""}`;
      node.style.setProperty("--c", p.color);
      // Texte de l'étiquette : sur l'Encre, la couleur prévue pour l'Encre ; sur le gris des joueurs, celle du fond.
      node.style.setProperty("--on", p.color === "var(--accent)" ? "var(--on-accent)" : "var(--bg)");
      node.innerHTML = `<span></span><b></b>`;
      node.querySelector("b")!.textContent = p.label;
      markers.current.push(new maplibregl.Marker({ element: node, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(m));
    }
    const answer = pins.find((p) => p.kind === "answer");
    const draw = () => {
      const src = m.getSource("lines") as maplibregl.GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: answer
          ? pins.filter((p) => p.kind !== "answer").map((p) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[p.lon, p.lat], [answer.lon, answer.lat]] } }))
          : [],
      });
    };
    if (m.isStyleLoaded()) draw();
    else m.once("load", draw);
  }, [pin?.lat, pin?.lon, JSON.stringify(pins)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cadrage sur les épingles révélées (ou la proposition de l'autre) ; jamais quand on pose la sienne.
  useEffect(() => {
    const m = map.current;
    if (!m || !pins.length) return;
    const lons = pins.map((p) => p.lon);
    const lats = pins.map((p) => p.lat);
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 70, maxZoom: 9, duration: 900 });
  }, [JSON.stringify(pins)]); // eslint-disable-line react-hooks/exhaustive-deps

  // MapLibre ajoute ses propres classes au conteneur : React ne doit jamais réécrire son attribut class.
  return (
    <div className={`guess-map${onPick ? " is-picking" : ""}`} aria-label={t("game.mapLabel")} role="application">
      <div ref={el} className="guess-map__canvas" />
    </div>
  );
}
