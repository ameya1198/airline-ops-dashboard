"use client"

import { Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { ChevronRight, RotateCw } from "lucide-react"

import { loadOutlineCodes, type Airport } from "@/lib/data"
import { loadStates, stateBounds, type StateCollection } from "@/lib/us-states"
import { cn } from "@/lib/utils"
import { RunwayCallout, type AirportCallout } from "./runway-callout"

// OpenFreeMap "Liberty": a colourful basemap (blue water, green land cover, coloured roads).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"
// Continental US; the flat (Mercator) view fills the wide map box.
const HOME: LngLatBoundsLike = [[-125, 24], [-66.5, 49.6]]

const INK = "#0f1b28"
const AA_BLUE = "#0078d2"
const PIN_ICON = "/icons/airport-pin.png"
// The pin's tip sits 60 px above the bottom of its 512 px image; offset so the tip marks the airport.
const PIN_TIP_OFFSET: [number, number] = [0, 60]

const STATE_MS = 1600
const FLY_MS = 3200
// High-drone camera: 65 degrees from straight down, starting from a quarter view.
const TILT = 65
const START_BEARING = -35
// Headings tried for each airport's resting view; the one that frames its terminals largest wins.
const BEARINGS = Array.from({ length: 12 }, (_, i) => -90 + i * 15)
const BUILDING_COLOR = "#d7dbdf" // neutral grey massing model
const RISE_MS = 2600
// Buildings rise as a wave from the terminals outward: each starts when the rise passes its
// delay (0 at the terminal core, RISE_SPREAD at the farthest building).
const RISE_SPREAD = 0.8
const BUBBLE_STEM = 56 // px; lifts a bubble clear of the terminal roof it stands on
// Bubble width (px) for keeping neighbours apart; a bubble may slide sideways over its stem
// by up to MAX_SHIFT while the stem still meets its underside.
const BUBBLE_W = 124
const BUBBLE_GAP = 14
const MAX_SHIFT = BUBBLE_W / 2 - 18
// Closest drone zoom; small airports with one compact terminal reach it.
const DRONE_MAX_ZOOM = 17
// Room on the left for the state's airport list, so the state isn't framed underneath it.
const STATE_PADDING = { top: 70, bottom: 40, left: 310, right: 50 }
// The airport view flies with padding, which MapLibre keeps; other views reset it.
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 }

export type AirportStats = {
  code: string
  name: string
  period: string
  onTime: number | null
  networkOnTime: number | null
  /** Big-number callouts, in order: pinned to the west, east, then south runway. */
  callouts: AirportCallout[]
}

/** The map is the dashboard's place filter: the whole network, a state, or an airport in it. */
export type Place = { state: string | null; airport: string | null }

export type NetworkMapHandle = { goHome: () => void }

type Props = {
  airports: Airport[]
  /** Numbers for the callouts shown when an airport's outline settles. */
  statsFor: (code: string) => AirportStats | null
  /** Departures per airport for the selected period (null while loading), for the list and tooltips. */
  departures: Map<string, number> | null
  onPlaceChange: (place: Place) => void
  /** Sizing from the page layout (the map fills whatever box it is given). */
  className?: string
  ref?: React.Ref<NetworkMapHandle>
}

// network -> toState -> state -> flying -> airport; "leaving" goes airport -> state,
// "returning" goes anywhere -> network.
type Phase = "network" | "toState" | "state" | "flying" | "airport" | "leaving" | "returning"

type OutlineCollection = GeoJSON.FeatureCollection & {
  properties: { code: string; name: string; bbox: [number, number, number, number]; center: [number, number] }
}

type Anchor = {
  ref: string
  lngLat: [number, number]
  side: "up" | "down"
  stem?: number
  shift?: number
  /** One card carries every callout (a compact terminal with no room for three bubbles). */
  combined?: boolean
}

/**
 * The airport's terminal area, from its 3D buildings: where the jet bridges are. Null for airports
 * whose outline has no building footprints yet (they keep the whole-airport view).
 */
type BBox = [[number, number], [number, number]]
type Core = {
  centre: [number, number]
  /** The terminal core: where the jet bridges are. */
  bbox: BBox
  /** The terminal core with a margin: what the drone view fits, so the framing scales with the airport. */
  extent: BBox
  candidates: [number, number][]
}

const ringCentroid = (ring: number[][]): [number, number] => [
  ring.reduce((a, c) => a + c[0], 0) / ring.length,
  ring.reduce((a, c) => a + c[1], 0) / ring.length,
]

/** Find the terminal core and give every building its rise delay `d` (mutates the features). */
function prepareBuildings(fc: OutlineCollection): Core | null {
  const buildings = fc.features.filter((f) => f.properties?.kind === "building" && f.geometry.type === "Polygon")
  const ring = (f: GeoJSON.Feature) => (f.geometry as GeoJSON.Polygon).coordinates[0]
  const jetBridges = buildings.filter((f) => f.properties!.base === 3)
  if (!jetBridges.length) return null
  const pts = jetBridges.flatMap(ring)
  const centre = ringCentroid(pts)
  const xs = pts.map((c) => c[0]), ys = pts.map((c) => c[1])
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const kx = Math.cos((centre[1] * Math.PI) / 180)
  const dist = ([x, y]: [number, number]) => Math.hypot((x - centre[0]) * kx, y - centre[1])
  const far = Math.max(...buildings.map((f) => dist(ringCentroid(ring(f))))) || 1
  for (const f of buildings) f.properties!.d = (dist(ringCentroid(ring(f))) / far) * RISE_SPREAD
  // Bubble candidates: points on the roofs of the larger buildings inside the terminal core
  // (terminals, garages): each centroid plus its corners pulled a little inward, so even a single
  // compact terminal offers anchors across its whole width.
  const area = (r: number[][]) => Math.abs(r.slice(0, -1).reduce((a, c, i) => a + c[0] * r[i + 1][1] - r[i + 1][0] * c[1], 0) / 2)
  const candidates = buildings
    .filter((f) => f.properties!.base === 0 && f.properties!.h >= 12)
    .map((f) => ({ r: ring(f), c: ringCentroid(ring(f)), a: area(ring(f)) }))
    .filter(({ c }) => c[0] >= w && c[0] <= e && c[1] >= s && c[1] <= n)
    .sort((p, q) => q.a - p.a)
    .slice(0, 12)
    .flatMap(({ r, c }) => [c, ...r.slice(0, -1).map(([x, y]) => [c[0] + (x - c[0]) * 0.85, c[1] + (y - c[1]) * 0.85] as [number, number])])
  // The terminal core plus a 10% margin each side. (All of an airport's buildings was tried and spans
  // cargo areas and hangars kilometres away, which shrank the terminals to specks at big hubs.)
  const mx = (e - w) * 0.1, my = (n - s) * 0.1
  const extent: BBox = [[w - mx, s - my], [e + mx, n + my]]
  return { centre, bbox: [[w, s], [e, n]], extent, candidates }
}

/**
 * The closest zoom at which `bbox` fits inside the padded map at a given tilt and bearing.
 * MapLibre's cameraForBounds ignores pitch, so this tries zooms on the real camera (inside one
 * synchronous block, restored before the next frame is drawn) and checks where the box's corners land.
 */
function tiltedZoom(
  map: maplibregl.Map,
  bbox: BBox,
  { center, pitch, bearing, padding, min, max }: {
    center: [number, number]; pitch: number; bearing: number
    padding: { top: number; bottom: number; left: number; right: number }; min: number; max: number
  },
): number {
  const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding() }
  const W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight
  const [[w, s], [e, n]] = bbox
  const corners: [number, number][] = [[w, s], [w, n], [e, s], [e, n]]
  const fits = (zoom: number) => {
    map.jumpTo({ center, zoom, pitch, bearing, padding })
    return corners.every((c) => {
      const p = map.project(c)
      return p.x >= padding.left && p.x <= W - padding.right && p.y >= padding.top && p.y <= H - padding.bottom
    })
  }
  let lo = min, hi = max
  if (fits(hi)) lo = hi
  else for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  map.jumpTo(saved)
  return lo
}

/**
 * Three terminals that are on screen at the current camera, in a safe zone with room above each for
 * its bubble and clear of the title chip on the left: the leftmost, the one nearest the middle, and
 * the rightmost. Left to right, so the bubbles never cross.
 */
function terminalAnchors(map: maplibregl.Map, core: Core): Anchor[] {
  const W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight
  const onScreen = (x0: number, x1: number, y0: number, y1: number) =>
    core.candidates
      .map((ll) => ({ ll, p: map.project(ll) }))
      .filter(({ p }) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1)
  let pts = onScreen(Math.max(W * 0.12, 300), W * 0.9, H * 0.38, H * 0.92)
  if (pts.length < 3) pts = onScreen(W * 0.05, W * 0.95, H * 0.2, H * 0.97)
  pts.sort((a, b) => a.p.x - b.p.x)
  let picks = pts
  if (pts.length > 3) {
    const left = pts[0], right = pts.at(-1)!, midX = (left.p.x + right.p.x) / 2
    const middle = pts.slice(1, -1).reduce((b, x) => (Math.abs(x.p.x - midX) < Math.abs(b.p.x - midX) ? x : b))
    picks = [left, middle, right]
  }
  // Keep the bubbles apart by sliding them sideways over their stems. A compact terminal has no
  // room for three side by side, so one card on the middle point carries all the numbers.
  const shifts = spreadBubbles(picks.map(({ p }) => p.x))
  if (!shifts || picks.length < 3) {
    const ll = picks[Math.floor(picks.length / 2)]?.ll ?? core.candidates[0]
    return ll ? [{ ref: "", lngLat: ll, side: "up", stem: BUBBLE_STEM, combined: true }] : []
  }
  return picks.map(({ ll }, i) => ({ ref: "", lngLat: ll, side: "up", stem: BUBBLE_STEM, shift: shifts[i] }))
}

/**
 * Sideways offsets (px) for bubbles whose stems stand at screen x positions `xs` (left to right) so
 * that neighbours don't overlap, keeping the largest offset as small as possible. Null when that
 * would need an offset beyond `limit`.
 */
function spreadBubbles(xs: number[], limit = MAX_SHIFT): number[] | null {
  const centres = [...xs]
  for (let i = 1; i < centres.length; i++) centres[i] = Math.max(centres[i], centres[i - 1] + BUBBLE_W + BUBBLE_GAP)
  const raw = centres.map((c, i) => c - xs[i])
  const mid = (Math.max(...raw) + Math.min(...raw)) / 2
  const shifts = raw.map((v) => Math.round(v - mid))
  return shifts.every((v) => Math.abs(v) <= limit) ? shifts : null
}
type Camera = { center: maplibregl.LngLatLike; zoom: number }

/**
 * Where the callouts attach, spread as far apart as the runways allow so the bubbles don't overlap
 * whatever the airport's layout: the westernmost runway end (bubble above), the easternmost end of
 * another runway (bubble above), and the southernmost end of a third (bubble below).
 */
function runwayAnchors(fc: OutlineCollection): Anchor[] {
  const ends = fc.features
    .filter((f) => f.properties?.kind === "runway" && f.geometry.type === "LineString")
    .flatMap((f) => {
      const pts = (f.geometry as GeoJSON.LineString).coordinates as [number, number][]
      const ref = String(f.properties!.ref)
      return [{ ref, pt: pts[0] }, { ref, pt: pts.at(-1)! }]
    })
  if (!ends.length) {
    // No named runways mapped: pin to the airport's west, east and south edges instead.
    const [w, s, e, n] = fc.properties.bbox
    const midLat = (s + n) / 2, midLon = (w + e) / 2
    return [
      { ref: "", lngLat: [w + (e - w) * 0.2, midLat], side: "up" },
      { ref: "", lngLat: [e - (e - w) * 0.2, midLat], side: "up" },
      { ref: "", lngLat: [midLon, s + (n - s) * 0.2], side: "down" },
    ]
  }
  // Prefer a runway not used yet, so each bubble points at a different runway when there are several.
  const pick = (score: (pt: [number, number]) => number, used: Set<string>) => {
    const fresh = ends.filter((x) => !used.has(x.ref))
    return (fresh.length ? fresh : ends).reduce((best, x) => (score(x.pt) < score(best.pt) ? x : best))
  }
  const used = new Set<string>()
  const west = pick((p) => p[0], used)
  used.add(west.ref)
  const east = pick((p) => -p[0], used)
  used.add(east.ref)
  // With one or two runways every end may already carry a bubble; then the south bubble hangs
  // below the middle of the west and east points instead of stacking on one of them.
  const freeEnds = ends.filter((x) => x.pt !== west.pt && x.pt !== east.pt && !used.has(x.ref))
  const south = freeEnds.length
    ? freeEnds.reduce((lo, x) => (x.pt[1] < lo.pt[1] ? x : lo))
    : { ref: west.ref, pt: [(west.pt[0] + east.pt[0]) / 2, (west.pt[1] + east.pt[1]) / 2] as [number, number] }
  return [
    { ref: west.ref, lngLat: west.pt, side: "up" },
    { ref: east.ref, lngLat: east.pt, side: "up" },
    { ref: south.ref, lngLat: south.pt, side: "down" },
  ]
}

/** Add a fade transition to a paint object. MapLibre supports `*-transition` keys at runtime; its types omit them. */
function withFade<T extends object>(paint: T, prop: string, ms = 700): T {
  return { ...paint, [`${prop}-transition`]: { duration: ms, delay: 0 } } as T
}

/**
 * Resolve once the camera has actually arrived at `zoom`. Every jumpTo/easeTo also fires
 * "moveend", so a bare once("moveend") can fire early on an unrelated camera move.
 */
function arrived(map: maplibregl.Map, zoom: number): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (Math.abs(map.getZoom() - zoom) < 0.05 && !map.isMoving()) {
        map.off("moveend", check)
        resolve()
      }
    }
    map.on("moveend", check)
  })
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

export function NetworkMap({ airports, statsFor, departures, onPlaceChange, className, ref }: Props) {
  const onPlaceChangeRef = useRef(onPlaceChange)
  const departuresRef = useRef(departures)
  useEffect(() => {
    onPlaceChangeRef.current = onPlaceChange
    departuresRef.current = departures
  }, [onPlaceChange, departures])

  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const outlines = useRef(new Map<string, OutlineCollection>())
  const cores = useRef(new Map<string, Core | null>())
  const coreRef = useRef<Core | null>(null)
  const homeCamera = useRef<Camera | null>(null)
  const stateCamera = useRef<Camera | null>(null)
  const states = useMemo<StateCollection>(() => loadStates(), [])
  const [outlineCodes, setOutlineCodes] = useState<Set<string>>(new Set())
  const outlineCodesRef = useRef(outlineCodes)
  useEffect(() => {
    loadOutlineCodes()
      .then((codes) => {
        outlineCodesRef.current = codes
        setOutlineCodes(codes)
      })
      .catch(() => undefined) // no index yet: every airport shows "coming soon"
  }, [])

  const [phase, setPhase] = useState<Phase>("network")
  const [selState, setSelState] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // The state and airport layers are added after the style loads; nothing may select a state before.
  const [layersReady, setLayersReady] = useState(false)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [bubbleEls, setBubbleEls] = useState<HTMLElement[]>([])
  const phaseRef = useRef<Phase>("network")
  const selStateRef = useRef<string | null>(null)
  // Read through a function: the phase changes across awaits, which TypeScript can't see.
  const phaseNow = () => phaseRef.current
  const setP = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }

  const airportsByState = useMemo(() => {
    const m = new Map<string, Airport[]>()
    for (const a of [...airports].sort((x, y) => y.departures - x.departures)) {
      if (!m.has(a.state)) m.set(a.state, [])
      m.get(a.state)!.push(a)
    }
    return m
  }, [airports])
  const stateName = useCallback(
    (postal: string | null) => states.features.find((f) => f.properties.postal === postal)?.properties.name ?? postal ?? "",
    [states],
  )

  // ---- map setup -------------------------------------------------------------------------
  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      bounds: HOME,
      fitBoundsOptions: { padding: 16 },
      renderWorldCopies: false,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 70,
    })
    mapRef.current = map
    // Handle for debugging in development only.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __aaMap?: maplibregl.Map }).__aaMap = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    // Frame the continental US for the box's current size, and remember that view so going back
    // to the network returns to exactly the same framing.
    const frameHome = () => {
      map.fitBounds(HOME, { padding: 16, duration: 0 })
      homeCamera.current = { center: map.getCenter(), zoom: map.getZoom() }
    }
    map.on("load", async () => {
      frameHome()
      // The basemap extrudes its own buildings; ours (from OpenStreetMap, with estimated heights)
      // replace them at airports, so the basemap's are hidden to avoid doubled-up blocks.
      for (const l of map.getStyle().layers) if (l.type === "fill-extrusion") map.setLayoutProperty(l.id, "visibility", "none")
      const pin = await map.loadImage(PIN_ICON)
      if (!map.hasImage("airport-pin")) map.addImage("airport-pin", pin.data)
      map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.5, position: [1.3, 210, 30] })
      // Soft sky and haze where the horizon comes into view at drone angles.
      map.setSky({
        "sky-color": "#e9f0f6", "horizon-color": "#f4f6f8", "fog-color": "#f4f6f8",
        "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.75,
      })
      setReady(true)
    })
    // The box settles to its final height after first paint (and changes with the window).
    // Re-measure the canvas whenever the container changes size, then re-frame the US.
    map.on("resize", () => phaseRef.current === "network" && frameHome())
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---- states and airport pins -----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !airports.length || map.getSource("states")) return

    const withAirports = new Set(airports.map((a) => a.state))
    map.addSource("states", {
      type: "geojson",
      promoteId: "postal",
      data: {
        ...states,
        features: states.features.map((f) => ({ ...f, properties: { ...f.properties, airports: airportsByState.get(f.properties.postal)?.length ?? 0 } })),
      },
    })
    map.addLayer({
      id: "states-fill",
      type: "fill",
      source: "states",
      paint: {
        "fill-color": AA_BLUE,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false], 0.05,
          ["boolean", ["feature-state", "hover"], false], 0.12,
          0,
        ],
      },
    })
    map.addLayer({
      id: "states-line",
      type: "line",
      source: "states",
      paint: withFade<NonNullable<maplibregl.LineLayerSpecification["paint"]>>({
        "line-color": ["case", ["boolean", ["feature-state", "selected"], false], AA_BLUE, "#8796a3"],
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 1.6, 0.6],
        "line-opacity": 1,
      }, "line-opacity", 500),
    })

    map.addSource("airports", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: airports.map((a) => ({
          type: "Feature",
          properties: { code: a.code, city: a.city, state: a.state },
          geometry: { type: "Point", coordinates: [a.lon, a.lat] },
        })),
      },
    })
    // Pins only for the selected state's airports.
    map.addLayer({
      id: "airports-pin",
      type: "symbol",
      source: "airports",
      filter: ["==", ["get", "state"], ""],
      layout: {
        "icon-image": "airport-pin",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.055, 8, 0.075],
        "icon-anchor": "bottom",
        "icon-offset": PIN_TIP_OFFSET,
        "icon-allow-overlap": true,
        "text-field": ["get", "code"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.25],
        "text-optional": true,
      },
      paint: withFade(
        withFade<NonNullable<maplibregl.SymbolLayerSpecification["paint"]>>(
          { "text-color": INK, "text-halo-color": "#ffffff", "text-halo-width": 1.5, "icon-opacity": 1, "text-opacity": 1 },
          "icon-opacity", 400,
        ),
        "text-opacity", 400,
      ),
    })

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "airport-popup" })
    let hovered: string | null = null
    const setHover = (postal: string | null) => {
      if (hovered) map.setFeatureState({ source: "states", id: hovered }, { hover: false })
      hovered = postal
      if (postal) map.setFeatureState({ source: "states", id: postal }, { hover: true })
    }

    map.on("mousemove", "states-fill", (e) => {
      const p = phaseRef.current
      if (p !== "network" && p !== "state") return
      if (map.queryRenderedFeatures(e.point, { layers: ["airports-pin"] }).length) return
      const f = e.features?.[0]
      const postal = f?.properties?.postal as string | undefined
      if (!postal || postal === selStateRef.current) {
        setHover(null)
        popup.remove()
        map.getCanvas().style.cursor = ""
        return
      }
      const n = withAirports.has(postal) ? airportsByState.get(postal)!.length : 0
      setHover(n ? postal : null)
      map.getCanvas().style.cursor = n ? "pointer" : ""
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-[13px] font-medium">${escapeHtml(String(f!.properties!.name))}</div>` +
            `<div class="text-xs text-muted-foreground">${n ? `${n} AA airport${n > 1 ? "s" : ""} · click to zoom in` : "No AA mainline airports"}</div>`,
        )
        .addTo(map)
    })
    map.on("mouseleave", "states-fill", () => {
      setHover(null)
      popup.remove()
      map.getCanvas().style.cursor = ""
    })
    map.on("click", "states-fill", (e) => {
      const p = phaseRef.current
      if (p !== "network" && p !== "state") return
      if (map.queryRenderedFeatures(e.point, { layers: ["airports-pin"] }).length) return
      const postal = e.features?.[0]?.properties?.postal as string | undefined
      if (postal && withAirports.has(postal) && postal !== selStateRef.current) {
        setHover(null)
        popup.remove()
        void openState(postal)
      }
    })

    map.on("mousemove", "airports-pin", (e) => {
      if (phaseRef.current !== "state") return
      const f = e.features?.[0]
      if (!f) return
      setHover(null)
      map.getCanvas().style.cursor = "pointer"
      const { code, city } = f.properties as { code: string; city: string }
      const deps = departuresRef.current?.get(code)
      const hint = outlineCodesRef.current.has(code) ? "Click to view the airport" : "Airport view coming soon"
      popup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div class="font-mono text-[13px] font-medium">${code}</div>` +
            `<div class="text-xs text-muted-foreground">${escapeHtml(city)}</div>` +
            (deps === undefined ? "" : `<div class="mt-1 font-mono text-xs tabular-nums">${deps.toLocaleString()} departures</div>`) +
            `<div class="mt-1 text-[11px] text-muted-foreground">${hint}</div>`,
        )
        .addTo(map)
    })
    map.on("mouseleave", "airports-pin", () => {
      map.getCanvas().style.cursor = ""
      popup.remove()
    })
    map.on("click", "airports-pin", (e) => {
      const code = e.features?.[0]?.properties?.code as string | undefined
      if (code && outlineCodesRef.current.has(code) && phaseRef.current === "state") {
        popup.remove()
        void openAirport(code)
      }
    })
    setLayersReady(true)
    // openState/openAirport are stable (useCallback with refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, airports, states, airportsByState])

  // ---- outline layers --------------------------------------------------------------------
  const ensureOutline = useCallback(async (code: string) => {
    const map = mapRef.current!
    let fc = outlines.current.get(code)
    if (!fc) {
      const res = await fetch(`/data/outlines/${code}.geojson`)
      if (!res.ok) throw new Error(`Couldn't load the ${code} outline`)
      fc = (await res.json()) as OutlineCollection
      cores.current.set(code, prepareBuildings(fc))
      outlines.current.set(code, fc)
    }
    const src = map.getSource("outline") as GeoJSONSource | undefined
    if (src) src.setData(fc)
    else map.addSource("outline", { type: "geojson", data: fc, attribution: "Airport buildings © OpenStreetMap contributors · heights partly estimated" })

    // No outline lines: the colourful basemap already draws runways, taxiways and aprons, and the
    // 3D buildings carry the airport.
    if (!map.getLayer("ol-buildings")) {
      // The runway a hovered callout belongs to, traced in AA blue.
      map.addLayer({
        id: "ol-runway-hi", type: "line", source: "outline", filter: ["==", ["get", "ref"], ""],
        layout: { "line-cap": "round" },
        paint: withFade({ "line-color": AA_BLUE, "line-width": 4, "line-opacity": 0 }, "line-opacity", 200),
      })
      // Buildings as a neutral massing model: each footprint extruded from its base to its height.
      // Heights are scaled by a growth factor so they rise out of the ground when the view opens.
      map.addLayer({
        id: "ol-buildings", type: "fill-extrusion", source: "outline", filter: ["==", ["get", "kind"], "building"],
        paint: withFade<NonNullable<maplibregl.FillExtrusionLayerSpecification["paint"]>>({
          "fill-extrusion-color": BUILDING_COLOR,
          "fill-extrusion-height": 0,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0,
          "fill-extrusion-vertical-gradient": true,
        }, "fill-extrusion-opacity", 500),
      })
    }
    coreRef.current = cores.current.get(code) ?? null
    // Airports with 3D buildings pick terminal anchors once the camera settles; others use runways.
    setAnchors(coreRef.current ? [] : runwayAnchors(fc))
    return fc
  }, [])

  const growRaf = useRef(0)
  /** Rise progress p from 0 (flat) to 1 + RISE_SPREAD (every building at full height). */
  const setRise = (p: number) => {
    const map = mapRef.current
    if (!map?.getLayer("ol-buildings")) return
    const k: maplibregl.ExpressionSpecification = ["min", 1, ["max", 0, ["-", p, ["coalesce", ["get", "d"], 0]]]]
    const smooth: maplibregl.ExpressionSpecification = ["*", k, ["*", k, ["-", 3, ["*", 2, k]]]] // ease each building in and out
    map.setPaintProperty("ol-buildings", "fill-extrusion-height", ["*", ["get", "h"], smooth])
    map.setPaintProperty("ol-buildings", "fill-extrusion-base", ["*", ["get", "base"], smooth])
  }
  /**
   * Buildings rise in a wave from the terminals outward (or sink back). Driven frame by frame because
   * MapLibre doesn't animate heights that differ per building. Resolves when done.
   */
  const growBuildings = (up: boolean) =>
    new Promise<void>((resolve) => {
      const map = mapRef.current
      cancelAnimationFrame(growRaf.current)
      if (!map?.getLayer("ol-buildings")) return resolve()
      map.setPaintProperty("ol-buildings", "fill-extrusion-opacity", up ? 0.96 : 0)
      const full = 1 + RISE_SPREAD
      if (prefersReducedMotion()) {
        setRise(up ? full : 0)
        return resolve()
      }
      const start = performance.now()
      const ms = up ? RISE_MS : 400
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms)
        setRise(up ? t * full : (1 - t) * full)
        if (t < 1) growRaf.current = requestAnimationFrame(step)
        else resolve()
      }
      growRaf.current = requestAnimationFrame(step)
    })

  /**
   * Airport view on/off: the ground outline fades in (buildings rise separately, once the camera has
   * arrived); pins and state borders step aside. Turning off also sinks the buildings.
   */
  const setOutlineVisible = (on: boolean) => {
    const map = mapRef.current!
    if (!on) void growBuildings(false)
    map.setPaintProperty("airports-pin", "icon-opacity", on ? 0 : 1)
    map.setPaintProperty("airports-pin", "text-opacity", on ? 0 : 1)
    map.setPaintProperty("states-line", "line-opacity", on ? 0 : 1)
  }

  const markState = (postal: string | null) => {
    const map = mapRef.current!
    const prev = selStateRef.current
    if (prev) map.setFeatureState({ source: "states", id: prev }, { selected: false })
    if (postal) map.setFeatureState({ source: "states", id: postal }, { selected: true })
    selStateRef.current = postal
    setSelState(postal)
    map.setFilter("airports-pin", ["==", ["get", "state"], postal ?? ""])
  }

  // ---- camera sequence -------------------------------------------------------------------
  const openState = useCallback(async (postal: string) => {
    const map = mapRef.current
    const f = states.features.find((x) => x.properties.postal === postal)
    if (!map || !f || !map.getSource("states")) return
    markState(postal)
    setP("toState")
    map.setPadding(NO_PADDING)
    onPlaceChangeRef.current({ state: postal, airport: null })
    const cam = map.cameraForBounds(stateBounds(f), { padding: STATE_PADDING, maxZoom: 9 })!
    const zoom = cam.zoom ?? map.getZoom()
    stateCamera.current = { center: cam.center!, zoom }
    map.flyTo({ center: cam.center, zoom, pitch: 0, bearing: 0, padding: NO_PADDING, duration: prefersReducedMotion() ? 0 : STATE_MS, curve: 1.4, essential: true })
    await arrived(map, zoom)
    if (phaseNow() === "toState") setP("state")
    // markState is stable in effect (refs only).
  }, [states])

  /** Once the camera rests: terminal anchors chosen from what's on screen (3D airports only). */
  const settle = () => {
    const map = mapRef.current!
    if (coreRef.current) setAnchors(terminalAnchors(map, coreRef.current))
    setP("airport")
  }

  /** Replay the arrival: buildings sink and rise again, then the numbers pop back. */
  const replay = useCallback(async () => {
    if (phaseRef.current !== "airport") return
    setP("flying")
    setAnchors([])
    await growBuildings(false)
    if (phaseNow() !== "flying") return
    await growBuildings(true)
    if (phaseNow() === "flying") settle()
    // growBuildings and settle only touch refs, state setters and the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openAirport = useCallback(
    async (code: string) => {
      const map = mapRef.current
      if (!map || phaseRef.current !== "state") return
      setActive(code)
      setP("flying")
      onPlaceChangeRef.current({ state: selStateRef.current, airport: code })
      const fc = await ensureOutline(code)
      const core = coreRef.current
      const reduce = prefersReducedMotion()
      // Leave room on the left for the title chip. 3D airports frame their terminals from a high
      // drone angle; airports without buildings yet frame the whole site.
      // Room on the left for the title chip and at the top for the bubbles that stand on the far terminals.
      const padding = core ? { top: 100, bottom: 20, left: 260, right: 40 } : { top: 110, bottom: 40, left: 280, right: 60 }
      // Sized to the airport: its whole terminal area is fitted at the final drone angle, so a big hub
      // pulls back to show all of its concourses while a one-terminal airport comes in close.
      const [bw, bs, be, bn] = fc.properties.bbox
      const [[fw, fs], [fe, fn]]: BBox = core ? core.extent : [[bw, bs], [be, bn]]
      const center: [number, number] = [(fw + fe) / 2, (fs + fn) / 2]
      // The heading is chosen per airport too: whichever lays its terminals along the wide map frames
      // them largest (DFW's north-south row runs across the screen instead of up it). Ties go to the
      // classic quarter view.
      const fit = (b: number) => tiltedZoom(map, [[fw, fs], [fe, fn]], { center, pitch: TILT, bearing: b, padding, min: 12, max: DRONE_MAX_ZOOM })
      const [bearing, zoom] = core
        ? BEARINGS.map((b) => [b, fit(b)] as const).reduce((best, c) =>
            c[1] - Math.abs(c[0] - START_BEARING) / 900 > best[1] - Math.abs(best[0] - START_BEARING) / 900 ? c : best)
        : [0, fit(0)]
      map.flyTo({
        center, zoom, pitch: TILT, bearing, padding,
        duration: reduce ? 0 : FLY_MS, curve: 1.6, essential: true,
      })
      // The ground outline fades in on approach; buildings rise once the camera has arrived.
      window.setTimeout(() => phaseNow() === "flying" && setOutlineVisible(true), reduce ? 0 : FLY_MS * 0.6)
      await arrived(map, zoom)
      if (phaseNow() !== "flying") return
      await growBuildings(true)
      // No spin: once the buildings are up, the numbers appear.
      if (phaseNow() === "flying") settle()
    },
    // setOutlineVisible only touches refs and the map, so it's safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensureOutline],
  )

  /** Airport -> its state. */
  const backToState = useCallback(() => {
    const map = mapRef.current
    const p = phaseRef.current
    if (!map || !stateCamera.current || (p !== "flying" && p !== "airport")) return
    setP("leaving")
    onPlaceChangeRef.current({ state: selStateRef.current, airport: null })
    setOutlineVisible(false)
    map.stop()
    const cam = stateCamera.current
    map.flyTo({ ...cam, pitch: 0, bearing: 0, padding: NO_PADDING, duration: prefersReducedMotion() ? 0 : 2000, curve: 1.5, essential: true })
    void arrived(map, cam.zoom).then(() => {
      setActive(null)
      if (phaseNow() === "leaving") setP("state")
    })
  // setOutlineVisible only touches refs and the map, so it's safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Anywhere -> the whole network. */
  const goHome = useCallback(() => {
    const map = mapRef.current
    if (!map || phaseRef.current === "network" || phaseRef.current === "returning") return
    setP("returning")
    onPlaceChangeRef.current({ state: null, airport: null })
    setOutlineVisible(false)
    markState(null)
    const cam = homeCamera.current ?? map.cameraForBounds(HOME, { padding: 16 })!
    map.stop()
    map.flyTo({ ...cam, pitch: 0, bearing: 0, padding: NO_PADDING, duration: prefersReducedMotion() ? 0 : 2200, curve: 1.5, essential: true })
    void arrived(map, cam.zoom ?? map.getZoom()).then(() => {
      setActive(null)
      if (phaseNow() === "returning") setP("network")
    })
  // setOutlineVisible only touches refs and the map, so it's safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({ goHome }), [goHome])

  // Esc goes up one level: airport -> state -> network.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const p = phaseRef.current
      if (p === "flying" || p === "airport") backToState()
      else if (p === "state" || p === "toState") goHome()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goHome, backToState])

  // Memoised: statsFor builds a new object each call, and the callout markers re-pin whenever it changes.
  const stats = useMemo(() => (active ? statsFor(active) : null), [active, statsFor])
  const callouts = useMemo(() => stats?.callouts ?? [], [stats])
  const inAirport = phase === "flying" || phase === "airport"
  const inState = phase === "toState" || phase === "state"
  // Busiest first for the selected period (falls back to all-time order while the period's counts load).
  const stateAirports = useMemo(() => {
    const list = selState ? [...(airportsByState.get(selState) ?? [])] : []
    return departures ? list.sort((a, b) => (departures.get(b.code) ?? 0) - (departures.get(a.code) ?? 0)) : list
  }, [selState, airportsByState, departures])

  // Pin one bubble per callout to its runway once the buildings are up. Markers move with the map,
  // so the bubbles stay on their runways when the user pans or zooms.
  useEffect(() => {
    const map = mapRef.current
    if (!map || phase !== "airport" || !anchors.length || !callouts.length) return
    const pairs = callouts.slice(0, anchors.length).map((c, i) => ({ c, a: anchors[i] }))
    const els = pairs.map(() => document.createElement("div"))
    const markers = pairs.map(({ a }, i) =>
      new maplibregl.Marker({ element: els[i], anchor: a.side === "up" ? "bottom" : "top", pitchAlignment: "viewport", rotationAlignment: "viewport" })
        .setLngLat(a.lngLat)
        .addTo(map),
    )
    setBubbleEls(els)
    return () => {
      markers.forEach((m) => m.remove())
      setBubbleEls([])
    }
  }, [phase, anchors, callouts])

  const highlightRunway = (refName: string | null) => {
    const map = mapRef.current
    if (!map?.getLayer("ol-runway-hi")) return
    if (refName) map.setFilter("ol-runway-hi", ["==", ["get", "ref"], refName])
    map.setPaintProperty("ol-runway-hi", "line-opacity", refName ? 1 : 0)
  }

  const crumbClass =
    "cursor-pointer rounded-md px-2 py-1 transition-colors duration-200 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  const statesWithAirports = useMemo(
    () => states.features.filter((f) => airportsByState.has(f.properties.postal)).sort((a, b) => a.properties.name.localeCompare(b.properties.name)),
    [states, airportsByState],
  )

  return (
    <section aria-label="Network map" className={cn("relative flex min-h-[460px] flex-1 overflow-hidden rounded-xl border bg-card", className)}>
      {/* MapLibre sets position: relative on its container, so it gets its own full-size element. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>

      {/* Network level: caption plus a keyboard route to every state. */}
      <div
        className={cn(
          "pointer-events-none absolute top-3 left-3 flex items-center gap-2 transition-opacity duration-300",
          phase === "network" ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto rounded-lg border bg-card/95 px-3 py-2 text-xs shadow-xs">
          <p className="font-medium">United States</p>
          <p className="text-muted-foreground">Click a state to see its airports</p>
        </div>
        <label className="pointer-events-auto">
          <span className="sr-only">Choose a state</span>
          <select
            value=""
            disabled={phase !== "network" || !layersReady}
            onChange={(e) => e.target.value && void openState(e.target.value)}
            className="h-9 cursor-pointer rounded-lg border bg-card/95 px-2 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Choose a state…</option>
            {statesWithAirports.map((f) => (
              <option key={f.properties.postal} value={f.properties.postal}>
                {f.properties.name} ({airportsByState.get(f.properties.postal)!.length})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Breadcrumb for the state and airport levels. */}
      <nav
        aria-label="Map level"
        className={cn(
          "absolute top-3 left-3 flex items-center gap-1 rounded-lg border bg-card/95 p-1 text-sm shadow-xs transition-opacity duration-300",
          inState || inAirport || phase === "leaving" ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button onClick={goHome} className={crumbClass}>United States</button>
        {selState && (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            <button onClick={backToState} className={cn(crumbClass, !active && "font-medium")} aria-current={!active ? "page" : undefined}>
              {stateName(selState)}
            </button>
          </>
        )}
        {active && (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="px-2 py-1 font-mono font-medium" aria-current="page">{active}</span>
            <button
              onClick={() => void replay()}
              className={cn(crumbClass, "ml-1 inline-flex items-center gap-1.5 border-l pl-2.5")}
            >
              <RotateCw className="size-3.5" aria-hidden /> Replay
            </button>
          </>
        )}
      </nav>

      {/* State level: the state's airports, busiest first. */}
      <div
        className={cn(
          "absolute top-15 left-3 flex max-h-[calc(100%-5rem)] w-[270px] flex-col rounded-xl border bg-card/95 shadow-sm transition-all duration-300",
          phase === "state" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
        )}
      >
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">{stateName(selState)}</p>
          <p className="text-xs text-muted-foreground">
            {stateAirports.length} AA airport{stateAirports.length === 1 ? "" : "s"} · departures in period
          </p>
        </div>
        <ul className="overflow-y-auto p-1.5">
          {stateAirports.map((a) => {
            const available = outlineCodes.has(a.code)
            return (
              <li key={a.code}>
                <button
                  onClick={() => available && void openAirport(a.code)}
                  aria-disabled={!available}
                  title={available ? `View ${a.code}` : "Airport view coming soon"}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    available ? "cursor-pointer hover:bg-secondary" : "cursor-default",
                  )}
                >
                  <span className={cn("font-mono text-sm font-medium", !available && "text-muted-foreground")}>{a.code}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{a.city.split(",")[0]}</span>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {departures ? (departures.get(a.code) ?? 0).toLocaleString() : "…"}
                  </span>
                  {available && <ChevronRight className="size-3.5 text-primary" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Airport title chip once the buildings are up; the numbers live in the runway callouts. */}
      {stats && (
        <div
          className={cn(
            "absolute top-15 left-3 rounded-xl border bg-card/95 px-4 py-3 shadow-sm transition-all duration-300",
            phase === "airport" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
          )}
          aria-live="polite"
        >
          {/* Just the airport: code, and the city under it. The numbers live in the bubbles and the rest of the page. */}
          <p className="font-mono text-2xl leading-none font-semibold tracking-tight">{stats.code}</p>
          <p className="mt-1 text-sm text-muted-foreground">{stats.name}</p>
        </div>
      )}

      {/* The markers lag the anchors by one render (e.g. on Replay the anchors clear first), so a
          bubble without an anchor or callout is skipped rather than drawn. */}
      {bubbleEls.map((el, i) => anchors[i] && callouts[i] && (
        <Fragment key={callouts[i].key}>
          {createPortal(
            <RunwayCallout
              callouts={anchors[i].combined ? callouts : [callouts[i]]}
              side={anchors[i].side}
              stem={anchors[i].stem}
              shift={anchors[i].shift}
              index={i}
              onHover={(on) => highlightRunway(on ? anchors[i].ref : null)}
            />,
            el,
          )}
        </Fragment>
      ))}

    </section>
  )
}
