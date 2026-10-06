import { isDarkTheme, tripColorHex, type TripColorId } from "../trip-colors.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { locale, t } from "../i18n/index.js";
import { declutter, geometryKey, markersKey, type CityPin } from "../trip-map.js";
import { orbit } from "../globe-stops.js";
import { IconClose, IconExpand } from "../shell/icons.js";
import "./TripMap.css";
import "./MapPhotos.css";

type Stop = { title: string; centerLat: number; centerLon: number };

// Thème effectif (data-theme d'abord, sinon le système).
const dark = isDarkTheme;
// Tuiles OpenFreeMap : gratuites, sans clé ni compte.
const styleUrl = () => `https://tiles.openfreemap.org/styles/${dark() ? "dark" : "positron"}`;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const FIT = { padding: 48, maxZoom: 9 };

/** Écart minimal (px) entre deux villes montrées avec leurs miniatures : une seule vignette, ou l'éventail de trois (~100 px). */
const cityGap = (perCity: number) => (perCity > 1 ? 88 : 56);

const line = (route: [number, number][]): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } });
const points = (cities: CityPin[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: cities.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })) });
/** Ligne d'itinéraire : couleur du voyage (MapLibre ne lit pas le CSS), sinon Encre. */
const lineColor = (color?: TripColorId) => (color ? tripColorHex(color, dark()) : getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());

type Props = {
  route: [number, number][];
  chapters: Stop[];
  /** Villes du voyage (trip-map.ts : cityPins). */
  cities?: CityPin[];
  onChapter?: (index: number) => void;
  /** Toucher les miniatures d'une ville. */
  onCity?: (city: CityPin) => void;
  color?: TripColorId;
};

/**
 * L'itinéraire : la route jour par jour à la couleur du voyage, les étapes en pastilles numérotées, et les villes
 * (sous-étapes) en petits points avec leurs miniatures, tant qu'elles ne se chevauchent pas au zoom courant.
 * Un bouton l'ouvre en grand (dialog natif plein écran : Échap ou le geste retour d'Android la ferment) ;
 * y toucher une étape ou une ville referme la carte puis défile jusqu'à elle.
 */
export function TripMap({ compact, onChapter, onCity, ...props }: Props & { compact?: boolean }) {
  const [full, setFull] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  // Action à faire une fois la carte en grand refermée (défiler jusqu'à l'étape touchée).
  const after = useRef<(() => void) | null>(null);
  // Avant les effets des enfants : la carte en grand naît dans un dialog déjà ouvert, donc à sa vraie taille.
  useLayoutEffect(() => {
    if (full && !dialog.current?.open) dialog.current?.showModal();
  }, [full]);
  const thenClose = (go: () => void) => {
    after.current = go;
    dialog.current?.close();
  };
  return (
    <div className={`trip-map${compact ? " trip-map--compact" : ""}`}>
      <MapView {...props} onChapter={onChapter} onCity={onCity} />
      {!compact && (
        <button type="button" className="icon-button trip-map__button trip-map__expand" onClick={() => setFull(true)} aria-label={t("map.expand")} title={t("map.expand")}>
          <IconExpand />
        </button>
      )}
      {full && (
        <dialog
          ref={dialog}
          className="trip-map-full"
          aria-label={t("map.full")}
          onClose={(e) => {
            if (e.target !== e.currentTarget) return;
            setFull(false);
            const go = after.current;
            after.current = null;
            // Après le retour du focus sur le bouton « Agrandir » (qui ramènerait la page à la carte).
            if (go) requestAnimationFrame(go);
          }}
        >
          <MapView {...props} full onChapter={onChapter && ((i) => thenClose(() => onChapter(i)))} onCity={onCity && ((c) => thenClose(() => onCity(c)))} />
          <button type="button" className="icon-button trip-map__button trip-map-full__close" onClick={() => dialog.current?.close()} aria-label={t("common.close")} title={t("common.close")}>
            <IconClose />
          </button>
        </dialog>
      )}
    </div>
  );
}

/**
 * Une carte MapLibre de l'itinéraire. Créée une seule fois ; route, pastilles et couleur sont mises à jour sur
 * place quand le voyage change (photos déplacées, étapes renommées…), et elle se recadre seulement si la
 * géométrie a bougé. En grand (`full`) : gestes libres (sans Ctrl ni deux doigts), boutons de zoom, jusqu'à
 * trois miniatures par ville ; sur la page, une seule, pour rester lisible.
 */
function MapView({ route, chapters, cities = [], onChapter, onCity, color, full = false }: Props & { full?: boolean }) {
  const perCity = full ? 3 : 1;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  // Dernières valeurs, pour les écouteurs posés une fois.
  const live = useRef({ route, chapters, cities, onChapter, onCity, color });
  live.current = { route, chapters, cities, onChapter, onCity, color };
  const geo = geometryKey(route, chapters, cities);
  const citiesKey = JSON.stringify(cities.map((c) => [c.key, c.chapter, c.place, c.lat, c.lon, c.count, c.thumbs]));
  const marks = markersKey(chapters, color);

  // Création (une seule fois), cadrée sur l'itinéraire du moment.
  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: el.current!,
        style: styleUrl(),
        attributionControl: false,
        cooperativeGestures: !full,
        dragRotate: false,
        pitchWithRotate: false,
        bounds: frame(live.current.route, live.current.chapters, live.current.cities),
        fitBoundsOptions: FIT,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": t("map.zoomWindows"),
          "CooperativeGesturesHandler.MacHelpText": t("map.zoomMac"),
          "CooperativeGesturesHandler.MobileHelpText": t("map.twoFingers"),
        },
      });
    } catch {
      return;
    }
    map.current = m;
    // Crédits OpenStreetMap obligatoires, mais repliés en un petit « i ».
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    if (full) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.once("load", () => m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    // Noms de lieux dans la langue de l'interface quand ils existent.
    m.once("styledata", () => {
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field") !== undefined)
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", `name:${locale()}`], ["get", "name"]]);
      }
    });
    // Liseré de la ligne : la couleur de fond (--bg), comme sur le globe.
    const casing = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#ffffff";
    m.on("load", () => {
      const { route, cities, color } = live.current;
      m.addSource("route", { type: "geojson", data: line(route) });
      m.addSource("cities", { type: "geojson", data: points(cities) });
      m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": casing, "line-width": 7.5, "line-opacity": 0.9 } });
      m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": lineColor(color), "line-width": 3.5 } });
      // Les villes : un petit point à la couleur du voyage, cerclé de la couleur de page, au-dessus de la route.
      m.addLayer({ id: "cities", type: "circle", source: "cities", paint: { "circle-color": lineColor(color), "circle-radius": 3.5, "circle-stroke-color": casing, "circle-stroke-width": 2 } });
      setReady(true);
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Route et couleur, sur place.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("route") as GeoJSONSource | undefined)?.setData(line(route));
    (m.getSource("cities") as GeoJSONSource | undefined)?.setData(points(cities));
    m.setPaintProperty("route", "line-color", lineColor(color));
    m.setPaintProperty("cities", "circle-color", lineColor(color));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, geo, color]);

  // Recadrage quand la géométrie change (pas au premier rendu : la carte est née cadrée).
  const framed = useRef(geo);
  useEffect(() => {
    const m = map.current;
    if (!m || framed.current === geo) return;
    framed.current = geo;
    m.fitBounds(frame(route, chapters, cities), { ...FIT, duration: reduceMotion() ? 0 : 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  // Pastilles numérotées des étapes (DOM : elles n'attendent pas le style), redessinées quand elles changent.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const markers = chapters.map((c, i) => {
      const holder = document.createElement("div");
      const node = document.createElement("button");
      holder.appendChild(node);
      holder.className = "trip-map__stop"; // au-dessus des miniatures des villes
      node.type = "button";
      node.className = "stop";
      node.setAttribute("aria-label", t("map.stop", { n: i + 1, title: c.title }));
      node.appendChild(document.createElement("span")).textContent = String(i + 1);
      node.addEventListener("click", () => live.current.onChapter?.(i));
      return new maplibregl.Marker({ element: holder }).setLngLat([c.centerLon, c.centerLat]).addTo(m);
    });
    return () => markers.forEach((mk) => mk.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks]);

  // Miniatures des villes : recalculées à la fin de chaque mouvement (elles suivent la carte pendant le geste),
  // la plus fournie d'abord ; une ville trop proche d'une autre déjà montrée garde son seul point.
  useEffect(() => {
    const m = map.current;
    if (!m || !cities.some((c) => c.thumbs.length)) return;
    const shown = new Map<string, Marker>();
    const create = (c: CityPin) => {
      const holder = document.createElement("div");
      holder.className = "stop-photos";
      const thumbs = c.thumbs.slice(0, perCity);
      orbit(thumbs.length).forEach(([x, y], i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "stop-photo";
        b.style.setProperty("--x", `${x}px`);
        b.style.setProperty("--y", `${y}px`);
        b.style.setProperty("--i", String(i));
        b.setAttribute("aria-label", t("map.cityPhotos", { place: c.place ?? t("substop.unknown") }));
        b.addEventListener("click", (e) => (e.stopPropagation(), live.current.onCity?.(c)));
        const img = document.createElement("img");
        img.src = thumbs[i];
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.draggable = false;
        b.appendChild(img);
        holder.appendChild(b);
      });
      return new maplibregl.Marker({ element: holder }).setLngLat([c.lon, c.lat]).addTo(m);
    };
    const update = () => {
      const box = m.getContainer();
      const candidates = cities
        .filter((c) => c.thumbs.length)
        .map((c) => {
          const p = m.project([c.lon, c.lat]);
          return { item: c, x: p.x, y: p.y, weight: c.count };
        });
      const keep = new Set(declutter(candidates, { width: box.clientWidth, height: box.clientHeight }, { minGap: cityGap(perCity) }).map((c) => c.key));
      for (const [key, mk] of shown) if (!keep.has(key)) (mk.remove(), shown.delete(key));
      for (const c of cities) if (keep.has(c.key) && !shown.has(c.key)) shown.set(c.key, create(c));
    };
    update();
    m.on("moveend", update);
    return () => {
      m.off("moveend", update);
      for (const mk of shown.values()) mk.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citiesKey, perCity]);

  // Le conteneur MapLibre garde ses propres classes : la forme est portée par l'enveloppe (.trip-map, le dialog).
  return <div ref={el} className="trip-map__canvas" />;
}

/** Cadre de la carte : la route, les centres d'étapes et les villes. */
const frame = (route: [number, number][], chapters: Stop[], cities: CityPin[]) => bounds(route, [...chapters, ...cities.map((c) => ({ title: c.place ?? "", centerLat: c.lat, centerLon: c.lon }))]);

export function bounds(route: [number, number][], chapters: Stop[]): [[number, number], [number, number]] {
  const pts: [number, number][] = [...route, ...chapters.map((c) => [c.centerLon, c.centerLat] as [number, number])];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const pad = 0.05;
  return [
    [Math.min(...lons) - pad, Math.min(...lats) - pad],
    [Math.max(...lons) + pad, Math.max(...lats) + pad],
  ];
}
