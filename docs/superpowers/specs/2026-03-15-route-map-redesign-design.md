# Route & Map Redesign — Design Spec
**Date:** 2026-03-15
**Scope:** `frontend/src/pages/routes.tsx`, `frontend/src/pages/subdivisions.tsx`, `backend/src/routes/routes.ts`, `ai-service/app/services/route_optimizer.py`, `ai-service/app/routers/routes.py`

---

## Problem Statement

The current Route Planning page has three concrete gaps:

1. **Straight-line polylines** — route connectors draw straight lines between stops, not road-following paths
2. **Missing depot field** — the Generate Route modal never sends a depot location, but the AI service CVRP solver requires one
3. **No traffic/avoidance controls** — ORS already supports `avoid_features` but none are exposed to the user

Additionally, the map layout is cramped (half-width side panel) and clicking a route stop doesn't give useful feedback.

---

## Decisions

| Question | Decision |
|---|---|
| Layout style | Map-first: full-width map, floating panels on top |
| Connector style | Road-following via ORS Directions API + animated CSS dashes |
| Modal design | Smart defaults with collapsed advanced section |
| Subdivisions page | Keep split layout; improve polygon styling + inline stats |
| Implementation approach | Incremental enhancement on existing Leaflet + ORS stack (no new deps) |

---

## Section 1 — Routes Page Layout

**Current:** 50/50 split — table left, map right. Route list expands inline as table rows.

**New:** Map fills full width. Two floating panels overlay the map:

- **Left floating panel** — compact route list card (≈160px wide). Each row shows: truncated route ID, status badge, stop count, distance, optimization score. Clicking a row selects it, highlights the row with a left border accent, and animates the map to fit the route bounds.
- **Right floating info card** — appears when a stop marker is clicked. Shows: stop number, device ID, fill level bar + percentage, status badge, "Zoom" and "Details" action buttons.

**Map controls:** `+` / `−` zoom buttons (top-right). Attribution bar at bottom.

**Selected stop visual:** Pulse rings (two concentric `<circle>` elements with decreasing opacity) rendered around the active stop marker via a CSS `@keyframes` animation.

---

## Section 2 — Road-Following Connectors

**Current:** `<Polyline positions={coords}>` — straight lines between lat/lng points.

**New approach:**
1. When a route is selected and its `routeGeojson` field is populated (set at generation time), the frontend renders that GeoJSON LineString directly using react-leaflet's `<GeoJSON>` component.
2. If `routeGeojson` is null (routes created before this feature), the frontend fetches road geometry on-demand from ORS Directions API using stop coordinates as waypoints.
3. The polyline uses Leaflet's `dashArray` + a CSS animation on `stroke-dashoffset` to create moving dashes in the direction of travel.

**Animation spec:**
```css
@keyframes dash-march {
  to { stroke-dashoffset: -24; }
}
```
Applied to an SVG `<path>` element rendered by Leaflet with `dashArray: "10 14"` and `weight: 5`. A white translucent layer underneath creates the glow effect.

**Marker spec:** Custom `L.divIcon` numbered circles. Color by stop status:
- `pending` → green (`#1da253`)
- `arrived` → blue (`#0ea5e9`)
- `serviced` → gray (`#94a3b8`)
- `skipped` → red (`#dc2626`)

---

## Section 3 — Generate Route Modal

**Current issues:**
- No depot lat/lng field (AI service requires it, silently fails or errors)
- No avoidance controls
- Generate button active even with missing required fields

**New design:**

### Top: Smart Defaults chips
Read-only chip row showing current effective settings: `Traffic-aware ✓`, `AI predictions ✓`, `1 truck`, `80% threshold`. Updates reactively as user changes advanced options.

### Depot field (required, prominent)
Two number inputs (Lat, Lng) with a 📍 "Pin on map" button. Clicking the pin button enters a map-click mode: next click on the map sets the depot coordinates. The field border is red and the Generate button is disabled until depot is set.

### Advanced section (collapsed by default)
Collapsible `<details>`-style section containing:
- Number of vehicles (1–20)
- Vehicle capacity (L)
- Fill threshold slider (%)
- Include AI-predicted overflows checkbox
- **Avoid Traffic** toggle (default ON) — maps to ORS `avoid_features: ["highways"]` with `"profile": "driving-hgv"`
- **Avoid Highways** toggle (default OFF)
- **Avoid Toll Roads** toggle (default OFF)

### Footer
- Cancel button
- Generate button: disabled with text "Set Depot First" when depot missing; enabled with text "▶ Generate" when depot is set

---

## Section 4 — Subdivisions Page

**Keep:** Split layout (table left, map right). No layout change.

**Polygon improvements:**
- Selected polygon: `color: "#1da253"`, `weight: 3`, `fillOpacity: 0.2`, plus a second wider polygon layer (`weight: 8`, `opacity: 0.15`) for the glow ring effect
- Unselected polygons: `color: "#0ea5e9"`, `weight: 1.5`, `fillOpacity: 0.08` (dimmed)
- Each polygon renders bin markers (small `<CircleMarker>` components) inside, colored by fill level: green < 70%, yellow 70–85%, red > 85%

**Inline stats on selected row:**
When a row is clicked, a small chip row appears below the subdivision name showing: `N bins`, `N alerts` (if > 0, red), `Avg XX%`. These are fetched from `/api/v1/bins?subdivisionId=X&limit=1000` — count bins, count with `status=alert`, average fill level from latest telemetry.

---

## Section 5 — Backend Changes

### `backend/src/routes/routes.ts`

Update `generateRouteSchema`:
```typescript
depotLat: z.number().min(-90).max(90),
depotLng: z.number().min(-180).max(180),
avoidTraffic: z.boolean().default(true),
avoidHighways: z.boolean().default(false),
avoidTolls: z.boolean().default(false),
numVehicles: z.number().int().min(1).max(20).default(1),
vehicleCapacityLiters: z.number().min(100).max(50000).default(1000),
thresholdPercent: z.number().min(0).max(100).default(80),
includePredicted: z.boolean().default(true),
```

Pass these to the AI service POST body. Persist `routeGeojson` from the AI service response to `collection_routes.routeGeojson`.

### `ai-service/app/routers/routes.py`

Add fields to `OptimizeRequest`:
```python
depot_lat: float
depot_lng: float
avoid_traffic: bool = True
avoid_highways: bool = False
avoid_tolls: bool = False
```

Pass `avoid_features` to ORS matrix call. After solving, call ORS Directions API for each vehicle route to get road geometry. Return geometry as `route_geojson` (GeoJSON FeatureCollection).

### `ai-service/app/services/route_optimizer.py`

Add `get_route_geometry(waypoints, avoid_features)` async function:
- Calls `https://api.openrouteservice.org/v2/directions/driving-car/geojson`
- Returns GeoJSON LineString for the full route
- Falls back gracefully (straight-line coords) if ORS unavailable

Add `avoid_features` param to `compute_distance_matrix()` — passed to ORS matrix request body.

---

## Data Flow

```
User clicks Generate →
  Frontend POST /routes/generate { depotLat, depotLng, avoidTraffic, ... } →
    Backend validates, fetches bins above threshold →
      POST AI service /optimize { depot, bins, avoid_features } →
        OR-Tools CVRP solves →
        ORS Directions API returns road geometry →
      AI service returns { routes, route_geojson, optimization_score } →
    Backend persists route + stops + routeGeojson →
  Frontend receives CollectionRoute with routeGeojson →
    react-leaflet <GeoJSON> renders road-following animated polyline
```

---

## Out of Scope

- Real-time GPS tracking of the truck during collection (separate feature)
- Drag-to-modify waypoints
- Multi-subdivision routing
- Offline map tiles

---

## Files Touched

| File | Change type |
|---|---|
| `frontend/src/pages/routes.tsx` | Major UI rewrite |
| `frontend/src/pages/subdivisions.tsx` | Polygon styling + stats fetch |
| `backend/src/routes/routes.ts` | Schema extension + AI service call update |
| `ai-service/app/routers/routes.py` | New request fields |
| `ai-service/app/services/route_optimizer.py` | `get_route_geometry()` + `avoid_features` support |
