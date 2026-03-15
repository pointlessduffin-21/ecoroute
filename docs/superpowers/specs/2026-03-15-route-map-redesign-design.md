# Route & Map Redesign — Design Spec
**Date:** 2026-03-15
**Scope:** `frontend/src/pages/routes.tsx`, `frontend/src/pages/subdivisions.tsx`, `backend/src/routes/routes.ts`, `ai-service/app/services/route_optimizer.py`, `ai-service/app/routers/routes.py`, `frontend/src/types/api.ts`

---

## Problem Statement

The current Route Planning page has three concrete gaps:

1. **Straight-line polylines** — route connectors draw straight lines between stops, not road-following paths
2. **Missing depot field** — the Generate Route modal never sends a depot location, but the AI service CVRP solver requires one
3. **No traffic/avoidance controls** — ORS already supports `avoid_features` but none are exposed to the user

Additionally, the map layout is cramped (half-width side panel) and clicking a route stop gives no useful feedback.

---

## Decisions

| Question | Decision |
|---|---|
| Layout style | Map-first: full-width map, floating panels on top |
| Connector style | Road-following via ORS Directions API + animated CSS dashes |
| Modal design | Smart defaults with collapsed advanced section |
| Subdivisions page | Keep split layout; improve polygon styling + inline stats |
| Implementation approach | Incremental enhancement on existing Leaflet + ORS stack (no new deps) |
| ORS profile | `driving-car` for both distance matrix and directions geometry calls |

---

## Section 1 — Routes Page Layout

**Current:** 50/50 split — table left, map right. Route list expands inline as table rows.

**New:** Map fills full width. Two floating panels overlay the map:

- **Left floating panel** — compact route list card (≈160px wide). Each row shows: truncated route ID, status badge, stop count, distance, optimization score. Clicking a row selects it, highlights the row with a left border accent, and animates the map to fit the route bounds.
- **Right floating info card** — appears when a stop marker is clicked. Shows: stop number, device ID, fill level bar + percentage, status badge, "Zoom" and "Details" action buttons.

**Map controls:** `+` / `−` zoom buttons (top-right). Attribution bar at bottom.

**Selected stop visual:** Pulse rings (two concentric `<circle>` elements with decreasing opacity) rendered around the active stop marker via a CSS `@keyframes` animation.

**Updated react-leaflet import:**
```typescript
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
// Remove Polyline — replaced by GeoJSON for road-following rendering
```

---

## Section 2 — Road-Following Connectors

**Current:** `<Polyline positions={coords}>` — straight lines between lat/lng points.

**New approach:**
1. When a route is selected and its `routeGeojson` field is populated (set at generation time), the frontend renders that GeoJSON LineString directly using react-leaflet's `<GeoJSON>` component.
2. If `routeGeojson` is null (routes created before this feature), degrade gracefully to a straight-line `<Polyline>` using the stop lat/lng array. No backend endpoint is needed for the fallback — no `/routes/:id/geometry` endpoint is introduced in this iteration.
3. The polyline uses Leaflet's `dashArray` + CSS animation on `stroke-dashoffset` to create moving dashes in the direction of travel.

**Animation spec:**

`className` is a **separate JSX prop** on `<GeoJSON>`, not inside the `style()` callback. Leaflet's `style` prop only accepts SVG `PathOptions`; `className` on the rendered SVG `<path>` must be set via the component prop:

```typescript
<GeoJSON
  data={parsedGeoJson}
  className="route-animated-path"
  style={() => ({
    color: '#0369a1',
    weight: 5,
    dashArray: '10 14',
  })}
/>
```

CSS (in `src/index.css` or a Tailwind `@layer base` block):
```css
.route-animated-path {
  animation: dash-march 0.6s linear infinite;
}
@keyframes dash-march {
  to { stroke-dashoffset: -24; }
}
```

A second `<GeoJSON>` layer (same data, no `className`) with `style={() => ({ weight: 8, color: 'white', opacity: 0.18 })}` is rendered underneath for the glow effect.

**Fallback:** If `routeGeojson` is null, render a plain `<Polyline positions={stopCoords}>` with no dash animation. No API call is made.

**Marker spec:** Custom `L.divIcon` numbered circles. Color by stop status:
- `pending` → green (`#1da253`)
- `arrived` → blue (`#0ea5e9`)
- `serviced` → gray (`#94a3b8`)
- `skipped` → red (`#dc2626`)

---

## Section 3 — Generate Route Modal

**Current issues:**
- No depot lat/lng field (AI service requires it; backend currently reads depot from `system_config` table as a fallback)
- `num_vehicles` and `vehicle_capacity` are hardcoded in the backend AI service call (lines ~292–293 in `routes.ts`); user-supplied values are ignored
- No avoidance controls
- Generate button active even with missing required fields

**New design:**

### Top: Smart Defaults chips
Read-only chip row showing current effective settings: `Traffic-aware ✓`, `AI predictions ✓`, `1 truck`, `80% threshold`. Updates reactively as user changes advanced options.

### Depot field (required, prominent)
Two number inputs (Lat, Lng). The 📍 "Pin on map" button **closes/minimizes the modal** (slides it to a collapsed header bar at the bottom of the screen), activates a map click-capture mode with a crosshair cursor and instruction banner ("Click map to set depot location"). On map click, the depot coordinates are captured, the modal re-expands, and the inputs populate. This avoids the blocked-overlay problem.

The field border is red and the Generate button disabled (text: "Set Depot First") until depot is set.

### Advanced section (collapsed by default)
Collapsible section containing:
- Number of vehicles (1–20)
- Vehicle capacity (L) — input `max` must be **50000** (the current input at `routes.tsx:434` incorrectly has `max={10000}`; update it to match the Zod schema)
- Fill threshold slider (%)
- Include AI-predicted overflows checkbox
- **Avoid Highways** toggle (default OFF) — maps to ORS `avoid_features: ["highways"]`. Label is "Avoid Highways" not "Avoid Traffic" because ORS does not offer a generic traffic avoidance parameter; this avoids residential-road-only routing.
- **Avoid Toll Roads** toggle (default OFF) — maps to ORS `avoid_features: ["tollways"]`

> Note: ORS `driving-car` profile does not expose real-time traffic conditions. The route will use road network distances only. Live traffic is out of scope for this release.

### Footer
- Cancel button
- Generate button: disabled when depot missing; enabled otherwise

---

## Section 4 — Subdivisions Page

**Keep:** Split layout (table left, map right). No layout change.

**Polygon improvements:**
- Selected polygon: `color: "#1da253"`, `weight: 3`, `fillOpacity: 0.2`, plus a second wider polygon layer (`weight: 8`, `opacity: 0.15`) for the glow ring effect
- Unselected polygons: `color: "#0ea5e9"`, `weight: 1.5`, `fillOpacity: 0.08` (dimmed)
- Each selected polygon renders bin markers (small `<CircleMarker>` components) inside, colored by fill level: green < 70%, yellow 70–85%, red > 85%

**Inline stats on selected row:**
When a row is clicked, a chip row appears below the subdivision name showing: `N bins`, `N alerts` (red, only if > 0), `Avg XX%`.

Implementation: fetch `/api/v1/bins?subdivisionId=X&limit=200` — this is a client-side aggregate accepted as a trade-off for this scope (subdivisions in EcoRoute are small residential zones, typically 10–50 bins). No new backend endpoint is needed. If a subdivision grows beyond 200 bins, a dedicated stats endpoint should be added separately.

---

## Section 5 — Backend Changes

### `frontend/src/types/api.ts`

Add to `CollectionRoute`:
```typescript
routeGeojson: string | null;
```

Update `RouteOptimizationRequest`:
```typescript
interface RouteOptimizationRequest {
  subdivisionId: string;
  depotLat: number;
  depotLng: number;
  numVehicles: number;
  vehicleCapacityLiters: number;
  thresholdPercent: number;
  includePredicted: boolean;
  avoidHighways: boolean;
  avoidTolls: boolean;
}
```

### `backend/src/routes/routes.ts`

Replace `generateRouteSchema` with:
```typescript
const generateRouteSchema = z.object({
  subdivisionId: z.string().uuid(),
  depotLat: z.number().min(-90).max(90),
  depotLng: z.number().min(-180).max(180),
  numVehicles: z.number().int().min(1).max(20).default(1),
  vehicleCapacityLiters: z.number().min(100).max(50000).default(1000),
  thresholdPercent: z.number().min(0).max(100).default(80),
  includePredicted: z.boolean().default(true),
  avoidHighways: z.boolean().default(false),
  avoidTolls: z.boolean().default(false),
  assignedDriverId: z.string().uuid().optional(),
  scheduledDate: z.string().datetime().optional(),
});
```

**Remove** the `system_config` depot lookup block and the hardcoded `num_vehicles: 1, vehicle_capacity: 1000` lines. Replace with values from `parsed.data`.

In the AI service POST body, pass:
```typescript
{
  subdivision_id: parsed.data.subdivisionId,
  depot: { latitude: parsed.data.depotLat, longitude: parsed.data.depotLng },
  num_vehicles: parsed.data.numVehicles,
  vehicle_capacity_liters: parsed.data.vehicleCapacityLiters,
  threshold_percent: parsed.data.thresholdPercent,
  include_predicted: parsed.data.includePredicted,
  avoid_highways: parsed.data.avoidHighways,
  avoid_tolls: parsed.data.avoidTolls,
}
```

In the route insert `.values()` call, add:
```typescript
routeGeojson: optimizationResult.route_geojson
  ? JSON.stringify(optimizationResult.route_geojson)
  : null,
```

### `ai-service/app/routers/routes.py`

Add to `OptimizeRequest`:
```python
avoid_highways: bool = False
avoid_tolls: bool = False
```

Add to `OptimizeResponse`:
```python
route_geojson: Optional[dict] = None
```

Build `avoid_features` list from toggles:
```python
avoid_features = []
if request.avoid_highways:
    avoid_features.append("highways")
if request.avoid_tolls:
    avoid_features.append("tollways")
```

Pass `avoid_features` to `optimize_route()`.

### `ai-service/app/services/route_optimizer.py`

**Update `optimize_route()` signature** to accept and thread through `avoid_features`:
```python
async def optimize_route(
    depot: dict,
    bins: list[dict],
    num_vehicles: int = 1,
    vehicle_capacity: int = 1000,
    avoid_features: list[str] | None = None,
    distance_matrix: list[list[int]] | None = None,
) -> dict:
```
Pass `avoid_features` to `compute_distance_matrix()` and to `get_route_geometry()`.

**Update `compute_distance_matrix()` signature:**
```python
async def compute_distance_matrix(depot, bins, avoid_features=None):
```
Pass `avoid_features` in the ORS matrix request body under `"options": {"avoid_features": avoid_features}`. Profile remains `driving-car`.

**Add `get_route_geometry()` async function:**
```python
async def get_route_geometry(waypoints: list[dict], avoid_features: list[str] | None = None) -> dict | None:
    """
    Call ORS Directions API (driving-car) for road-following GeoJSON geometry.
    Returns a GeoJSON LineString FeatureCollection, or None on failure.
    Falls back to None on 429 or any non-2xx status.
    """
```
- Endpoint: `https://api.openrouteservice.org/v2/directions/driving-car/geojson`
- Pass `avoid_features` under `"options"` key
- On success: return the GeoJSON FeatureCollection
- On 429, non-2xx, or exception: log warning, return `None`

Call `get_route_geometry()` for each vehicle route after solving. Merge all vehicle geometries into a single GeoJSON FeatureCollection and include as `route_geojson` in the return dict.

**ORS Rate limits (free tier):** 40 requests/minute for Directions, 500/day for Matrix. For routes with multiple vehicles, geometry calls are made sequentially (not parallel) to respect rate limits. The fallback (return `None`) keeps the system functional if limits are hit.

---

## Data Flow

```
User clicks Generate →
  Frontend POST /routes/generate { depotLat, depotLng, avoidHighways, ... } →
    Backend validates, removes hardcoded depot/capacity, passes parsed.data to AI service →
      POST AI service /optimize { depot, bins, avoid_features, num_vehicles, vehicle_capacity } →
        OR-Tools CVRP solves (30s time limit, Guided Local Search) →
        ORS Directions API (driving-car) returns road geometry per vehicle →
      AI service returns { routes, route_geojson, optimization_score } →
    Backend persists route + stops + routeGeojson (JSON.stringify) →
  Frontend receives CollectionRoute with routeGeojson populated →
    react-leaflet <GeoJSON className="route-animated-path"> renders road-following animated polyline
    Fallback: if routeGeojson null → render straight-line <Polyline> from stop coords (no API call)
```

---

## Out of Scope

- Real-time GPS tracking of the truck during collection
- Drag-to-modify waypoints
- Multi-subdivision routing
- Offline map tiles
- Live traffic data (ORS `driving-car` is network-distance only)
- Dedicated backend stats endpoint for subdivisions (deferred until >200 bins/zone)

---

## Files Touched

| File | Change type |
|---|---|
| `frontend/src/pages/routes.tsx` | Major UI rewrite |
| `frontend/src/pages/subdivisions.tsx` | Polygon styling + stats fetch |
| `frontend/src/types/api.ts` | Add `routeGeojson` to `CollectionRoute`, update `RouteOptimizationRequest` |
| `backend/src/routes/routes.ts` | Schema replacement, remove hardcoded values, persist routeGeojson |
| `ai-service/app/routers/routes.py` | New request/response fields |
| `ai-service/app/services/route_optimizer.py` | `get_route_geometry()` + `avoid_features` support |
