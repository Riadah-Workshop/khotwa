'use client';
// A small map on OpenStreetMap tiles with no library: drag to move, wheel / buttons / pinch to zoom, markers,
// a radius circle, and click-to-pick. It exists because the app cannot take a new dependency for one screen; it
// does only what the cafeteria screens need.
//
// The visible view is derived, not stored: unless the person has moved the map, it is "fit all markers". When
// `fitKey` changes (for example another cafeteria is chosen) a view the person set earlier no longer applies.
import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent} from 'react';
import {MAX_ZOOM, MIN_ZOOM, TILE_SIZE, clampZoom, fitBounds, metersPerPixel, project, unproject, type LatLng} from '../lib/fushati/location';
import './osm-map.css';

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: 'cafeteria' | 'agent' | 'agent-stale';
  label: string;
  /** Draws the arrival circle around the marker. */
  radiusM?: number;
};

export type OsmMapProps = {
  markers: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** A point the person chose (shown as a cross-hair marker). */
  picked?: LatLng | null;
  /** Makes the map clickable: called with the clicked point. */
  onPick?: (point: LatLng) => void;
  height?: number;
  fitKey?: string;
  labels: {map: string; zoomIn: string; zoomOut: string; fit: string; attribution: string};
};

type View = {center: LatLng; zoom: number};
type Gesture = {startX: number; startY: number; lastX: number; lastY: number; moved: boolean};

const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export default function OsmMap({markers, selectedId = null, onSelect, picked = null, onPick, height = 420, fitKey = '', labels}: OsmMapProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({w: 0, h: 0});
  const [moved, setMoved] = useState<(View & {key: string}) | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, {x: number; y: number}>());
  const pinch = useRef<{distance: number} | null>(null);

  const points: LatLng[] = markers.map((m) => ({lat: m.lat, lng: m.lng}));
  if (picked) points.push(picked);
  const fitted = fitBounds(points, size.w || 600, size.h || height);
  const view: View = moved && moved.key === fitKey ? moved : fitted;
  const zoom = clampZoom(Math.round(view.zoom));

  const latest = useRef({view, zoom, fitKey});

  // Gestures arrive faster than React renders, so each one starts from the view the previous one produced.
  function setView(next: View, key = latest.current.fitKey) {
    latest.current = {view: next, zoom: clampZoom(Math.round(next.zoom)), fitKey: key};
    setMoved({...next, key});
  }

  function zoomAt(delta: number, px: number, py: number) {
    const {view: current, zoom: z, fitKey: key} = latest.current;
    const next = clampZoom(z + delta);
    if (next === z) return;
    const rect = {w: root.current?.clientWidth ?? 0, h: root.current?.clientHeight ?? 0};
    const offset = {x: px - rect.w / 2, y: py - rect.h / 2};
    const centre = project(current.center, z);
    const under = unproject(centre.x + offset.x, centre.y + offset.y, z);
    const after = project(under, next);
    setView({center: unproject(after.x - offset.x, after.y - offset.y, next), zoom: next}, key);
  }

  function pan(dx: number, dy: number) {
    const {view: current, zoom: z} = latest.current;
    const centre = project(current.center, z);
    setView({center: unproject(centre.x - dx, centre.y - dy, z), zoom: z});
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {distance: Math.hypot(a.x - b.x, a.y - b.y)};
      gesture.current = null;
    } else {
      gesture.current = {startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false};
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = distance / Math.max(pinch.current.distance, 1);
      if (ratio > 1.6 || ratio < 0.62) {
        const rect = event.currentTarget.getBoundingClientRect();
        zoomAt(ratio > 1 ? 1 : -1, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        pinch.current = {distance};
      }
      return;
    }
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < 4) return;
    g.moved = true;
    pan(event.clientX - g.lastX, event.clientY - g.lastY);
    g.lastX = event.clientX;
    g.lastY = event.clientY;
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.moved || event.type === 'pointercancel') return;
    // A tap on the bare map: pick a point, or clear the selection.
    if ((event.target as HTMLElement).closest('[data-map-control]')) return;
    if (onPick) {
      const rect = event.currentTarget.getBoundingClientRect();
      const centre = project(view.center, zoom);
      onPick(unproject(centre.x + (event.clientX - rect.left - size.w / 2), centre.y + (event.clientY - rect.top - size.h / 2), zoom));
    } else onSelect?.(null);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = 80, mid = {x: size.w / 2, y: size.h / 2};
    switch (event.key) {
      case 'ArrowLeft': pan(step, 0); break;
      case 'ArrowRight': pan(-step, 0); break;
      case 'ArrowUp': pan(0, step); break;
      case 'ArrowDown': pan(0, -step); break;
      case '+': case '=': zoomAt(1, mid.x, mid.y); break;
      case '-': zoomAt(-1, mid.x, mid.y); break;
      default: return;
    }
    event.preventDefault();
  }

  // The wheel must not scroll the page while it zooms the map, which React's (passive) onWheel cannot prevent.
  useEffect(() => {
    latest.current = {view, zoom, fitKey};
  });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({w: Math.round(box.width), h: Math.round(box.height)});
    });
    observer.observe(el);
    let lastWheel = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const stamp = performance.now();
      if (stamp - lastWheel < 180) return;
      lastWheel = stamp;
      const rect = el.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1 : -1, event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
    // zoomAt reads everything through `latest`, so the listener never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiles covering the viewport.
  const centre = project(view.center, zoom);
  const left = centre.x - size.w / 2, top = centre.y - size.h / 2;
  const tiles: {key: string; x: number; y: number; src: string}[] = [];
  if (size.w > 0 && size.h > 0) {
    const count = 2 ** zoom;
    for (let ty = Math.max(0, Math.floor(top / TILE_SIZE)); ty <= Math.min(count - 1, Math.floor((top + size.h) / TILE_SIZE)); ty++) {
      for (let tx = Math.floor(left / TILE_SIZE); tx <= Math.floor((left + size.w) / TILE_SIZE); tx++) {
        const wrapped = ((tx % count) + count) % count;
        tiles.push({key: `${zoom}/${tx}/${ty}`, x: Math.round(tx * TILE_SIZE - left), y: Math.round(ty * TILE_SIZE - top), src: TILE_URL(zoom, wrapped, ty)});
      }
    }
  }
  const at = (point: LatLng) => {
    const p = project(point, zoom);
    return {x: p.x - left, y: p.y - top};
  };

  return (
    <div
      ref={root}
      className="osm-map"
      style={{height}}
      role="application"
      aria-label={labels.map}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      data-clickable={onPick ? 'true' : undefined}
    >
      <div className="osm-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          // Map tiles are third-party images drawn at exact pixel positions; next/image would only get in the way.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={tile.key} src={tile.src} alt="" draggable={false} width={TILE_SIZE} height={TILE_SIZE} style={{left: tile.x, top: tile.y}} />
        ))}
      </div>
      {markers.map((marker) => {
        const p = at(marker);
        const radiusPx = marker.radiusM ? marker.radiusM / metersPerPixel(marker.lat, zoom) : 0;
        return (
          <div key={marker.id} className="osm-anchor" style={{left: p.x, top: p.y}}>
            {radiusPx >= 6 && <span className="osm-radius" style={{width: radiusPx * 2, height: radiusPx * 2}} />}
            <button
              type="button"
              data-map-control
              className={`osm-marker osm-${marker.kind}`}
              data-selected={marker.id === selectedId ? 'true' : undefined}
              aria-label={marker.label}
              aria-pressed={marker.id === selectedId}
              title={marker.label}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSelect?.(marker.id === selectedId ? null : marker.id)}
            />
          </div>
        );
      })}
      {picked && (
        <div className="osm-anchor" style={{left: at(picked).x, top: at(picked).y}}>
          <span className="osm-picked" />
        </div>
      )}
      <div className="osm-controls" data-map-control onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => zoomAt(1, size.w / 2, size.h / 2)} aria-label={labels.zoomIn} disabled={zoom >= MAX_ZOOM}>+</button>
        <button type="button" onClick={() => zoomAt(-1, size.w / 2, size.h / 2)} aria-label={labels.zoomOut} disabled={zoom <= MIN_ZOOM}>−</button>
        <button type="button" onClick={() => setMoved(null)} aria-label={labels.fit} title={labels.fit}>⌖</button>
      </div>
      <a className="osm-attribution" data-map-control href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()}>
        {labels.attribution}
      </a>
    </div>
  );
}
