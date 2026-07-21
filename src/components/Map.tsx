"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";
import { FRANCE_BOUNDS, FRANCE_CENTER } from "@/lib/france";
import type { ToiletPin } from "@/lib/types";

export type FlyTarget = { lat: number; lng: number; zoom?: number; ts: number } | null;

type Props = {
  toilets: ToiletPin[];
  selectedId: number | null;
  placing: boolean;
  userPos: { lat: number; lng: number } | null;
  flyTarget: FlyTarget;
  onSelect: (id: number) => void;
  onPlace: (lat: number, lng: number) => void;
};

function pinColor(t: ToiletPin): string {
  if (t.mine) return "#2563eb";
  if (t.reviewCount === 0) return "#0e7c66";
  if (t.score < 2.5) return "#b91c1c";
  if (t.score < 4) return "#e58c6a";
  return "#0e7c66";
}

function makeIcon(t: ToiletPin, selected: boolean): L.DivIcon {
  const color = pinColor(t);
  const cls = `pin${selected ? " pin--selected" : ""}${t.mine ? " pin--pulse" : ""}`;
  const html = `<div class="${cls}" style="--pin:${color}">
      <div class="pin-head"><span>💩</span></div>
      ${t.reviewCount > 0 ? `<span class="pin-score">${t.score.toFixed(1)}</span>` : ""}
    </div>`;
  return L.divIcon({ html, className: "pin-wrap", iconSize: [46, 56], iconAnchor: [23, 54] });
}

function makeClusterIcon(count: number): L.DivIcon {
  const size = count < 50 ? 38 : count < 500 ? 46 : 54;
  const html = `<div class="cluster-badge" style="width:${size}px;height:${size}px">${count}</div>`;
  return L.divIcon({ html, className: "pin-wrap", iconSize: [size, size] });
}

const userIcon = L.divIcon({
  html: '<div class="user-dot"></div>',
  className: "pin-wrap",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/**
 * Rebuilding every marker's divIcon (HTML string + DOM element) on each render gets
 * expensive fast with thousands of OSM-seeded pins — and would otherwise happen on
 * *every* tap (selecting a marker changes `selectedId`, which used to be baked into
 * every single icon). This caches the unselected ("base") icon per toilet, keyed by
 * the fields that actually affect its look, and only recomputes it when one of those
 * changes — so tapping a pin recomputes exactly one icon (the newly selected one)
 * instead of the whole list, which is what keeps this smooth on older phones.
 */
function useBaseIcons(toilets: ToiletPin[]) {
  const cacheRef = useRef(new Map<number, { sig: string; icon: L.DivIcon }>());
  return useMemo(() => {
    const cache = cacheRef.current;
    const seen = new Set<number>();
    const icons = new Map<number, L.DivIcon>();
    for (const t of toilets) {
      seen.add(t.id);
      const sig = `${t.mine ? 1 : 0}|${t.reviewCount}|${t.score.toFixed(2)}`;
      const cached = cache.get(t.id);
      if (cached && cached.sig === sig) {
        icons.set(t.id, cached.icon);
      } else {
        const icon = makeIcon(t, false);
        cache.set(t.id, { sig, icon });
        icons.set(t.id, icon);
      }
    }
    // Drop entries for toilets no longer present so the cache doesn't grow unbounded.
    for (const id of cache.keys()) {
      if (!seen.has(id)) cache.delete(id);
    }
    return icons;
  }, [toilets]);
}

function ClickCatcher({ placing, onPlace }: { placing: boolean; onPlace: (lat: number, lng: number) => void }) {
  const map = useMapEvents({
    click(e) {
      if (placing) onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    map.getContainer().classList.toggle("placing", placing);
  }, [map, placing]);
  return null;
}

function FlyController({ target }: { target: FlyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 16, { duration: 1.1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.ts]);
  return null;
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

const CARTO_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/**
 * CARTO's free "Positron" vector style — the neutral, pastel basemap — but with every
 * `{name_en}` label token swapped for `{name_fr}`. CARTO's raw raster Positron tiles hardcode
 * English admin/place labels (Germany, Belgium…) baked into the pixels with no way to
 * relabel them; the vector style pulls from the same source data but exposes per-language
 * name fields, so we can just ask for the French one instead — same look, correct language.
 * Falls back to plain OSM France raster tiles if the style can't be fetched (offline, CDN down).
 */
function useFrenchPositronStyle() {
  const [style, setStyle] = useState<object | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(CARTO_STYLE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`CARTO style HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const frenchified = text.replace(/\{name_en\}/g, "{name_fr}");
        setStyle(JSON.parse(frenchified));
      })
      .catch((err) => {
        console.warn("[map] falling back to raster tiles:", err instanceof Error ? err.message : err);
        if (!cancelled) setStyle("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return style;
}

function Basemap() {
  const map = useMap();
  const style = useFrenchPositronStyle();

  useEffect(() => {
    if (!style || style === "error") return;
    const layer = L.maplibreGL({ style: style as never, attributionControl: false });
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, style]);

  if (style === "error") {
    return <TileLayer url="https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png" subdomains="abc" maxZoom={19} />;
  }
  return null;
}

/**
 * Memoized: at OSM-seeded scale (tens of thousands of markers) a full re-render here
 * is expensive enough to visibly stutter, so this must only re-render when one of its
 * own props actually changes — not whenever the parent re-renders for an unrelated
 * reason (opening a modal, toggling a filter). Relies on the parent passing stable
 * callback references (see `onMarkerSelect`/`onMapPlace` in page.tsx) and a memoized
 * `toilets` array.
 */
function PoopMap({ toilets, selectedId, placing, userPos, flyTarget, onSelect, onPlace }: Props) {
  const baseIcons = useBaseIcons(toilets);
  const selectedToilet = selectedId !== null ? toilets.find((t) => t.id === selectedId) : undefined;
  const selectedIcon = useMemo(() => (selectedToilet ? makeIcon(selectedToilet, true) : null), [selectedToilet]);

  // Memoized on [toilets, baseIcons] only — NOT selectedId — so selecting/deselecting
  // a pin reuses the exact same React elements for the other 35k+ markers instead of
  // just producing equal-by-value ones. That lets React bail out of reconciling this
  // list entirely on selection changes, rather than merely avoiding a Leaflet-level
  // rebuild (see the note on the cluster group below).
  const markers = useMemo(
    () =>
      toilets.map((t) => (
        <Marker key={t.id} position={[t.lat, t.lng]} icon={baseIcons.get(t.id)!} eventHandlers={{ click: () => onSelect(t.id) }} />
      )),
    [toilets, baseIcons, onSelect]
  );

  return (
    <MapContainer
      center={FRANCE_CENTER}
      zoom={6}
      minZoom={6}
      maxZoom={19}
      maxBounds={FRANCE_BOUNDS}
      maxBoundsViscosity={1.0}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <Basemap />
      <ResizeFix />
      <ClickCatcher placing={placing} onPlace={onPlace} />
      <FlyController target={flyTarget} />
      {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} interactive={false} />}
      {/* Clustered: thousands of OSM-seeded toilets can't render as individual DOM markers
          without freezing the tab. Splits back into real pins once zoomed in close enough
          to matter for someone actually looking for a toilet nearby.
          Deliberately NOT selection-aware: these props must stay 100% stable across
          selectedId changes. The clustering library rebuilds its whole spatial index
          whenever this children list changes at all, so if "selected" were baked into
          any of these markers, opening OR closing the detail panel would force a full
          re-cluster of tens of thousands of points every time — the selected-toilet
          highlight below is a separate, single marker specifically so that never happens. */}
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={70}
        disableClusteringAtZoom={16}
        spiderfyOnMaxZoom={false}
        iconCreateFunction={(cluster: L.MarkerCluster) => makeClusterIcon(cluster.getChildCount())}
      >
        {markers}
      </MarkerClusterGroup>
      {selectedToilet && selectedIcon && (
        <Marker
          position={[selectedToilet.lat, selectedToilet.lng]}
          icon={selectedIcon}
          zIndexOffset={1000}
          interactive={false}
        />
      )}
    </MapContainer>
  );
}

export default memo(PoopMap);
