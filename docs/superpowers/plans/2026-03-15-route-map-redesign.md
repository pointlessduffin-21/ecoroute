# Route & Map Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Route Planning page to map-first layout with road-following animated polylines, fix the broken Generate Route modal (missing depot, ignored vehicle params), add traffic avoidance controls, and improve the Subdivisions map with polygon glow and inline stats.

**Architecture:** Frontend receives `routeGeojson` (GeoJSON LineString stored by backend at generation time) and renders it via react-leaflet `<GeoJSON>` with CSS animated dashes. The AI service fetches road geometry from ORS Directions API after solving CVRP and returns it in the response. The backend threads user-supplied depot + vehicle params + avoidance toggles to the AI service instead of using hardcoded values.

**Tech Stack:** React + react-leaflet + Leaflet, TanStack React Query, Tailwind v4, Bun/HonoJS backend (Drizzle ORM), Python FastAPI AI service (OR-Tools, httpx, OpenRouteService API)

---

## Chunk 1: Foundation — Types + AI Service

### Task 1: Update TypeScript types

**Files:**
- Modify: `frontend/src/types/api.ts:68-82` (CollectionRoute interface)
- Modify: `frontend/src/types/api.ts:188-194` (RouteOptimizationRequest interface)

- [ ] **Step 1: Add `routeGeojson` to `CollectionRoute`**

  In `frontend/src/types/api.ts`, add `routeGeojson: string | null;` to the `CollectionRoute` interface after `scheduledDate`:

  ```typescript
  export interface CollectionRoute {
    id: string;
    subdivisionId: string;
    status: "planned" | "in_progress" | "completed" | "cancelled";
    optimizationScore: number | null;
    estimatedDistanceKm: number | null;
    estimatedDurationMinutes: number | null;
    assignedDriverId: string | null;
    assignedVehicleId: string | null;
    scheduledDate: string | null;
    routeGeojson: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }
  ```

- [ ] **Step 2: Replace `RouteOptimizationRequest`**

  Replace the existing interface (lines 188–194) with:

  ```typescript
  export interface RouteOptimizationRequest {
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

- [ ] **Step 3: Verify TypeScript compiles**

  Run from `frontend/`:
  ```bash
  bun run build 2>&1 | head -40
  ```
  Expected: build succeeds or fails only on the pages that use these types (routes.tsx will fail until Task 5 updates the modal state — that is expected).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/types/api.ts
  git commit -m "feat(types): add routeGeojson to CollectionRoute, expand RouteOptimizationRequest with depot + avoidance fields"
  ```

---

### Task 2: AI service — `avoid_features` + `get_route_geometry()`

**Files:**
- Modify: `ai-service/app/services/route_optimizer.py`
- Create: `ai-service/tests/test_route_optimizer.py`

- [ ] **Step 0: Ensure `pytest-asyncio` is available**

  ```bash
  cd ai-service && source venv/bin/activate
  pip show pytest-asyncio 2>&1 | grep -E "Name|Version" || pip install pytest-asyncio
  ```
  Expected: `Name: pytest-asyncio` printed, or installation succeeds.

  Also verify `pytest.ini` or `pyproject.toml` has asyncio mode configured. Check:
  ```bash
  grep -r "asyncio_mode" . 2>/dev/null || echo "not found"
  ```
  If not found, add to the existing `pytest.ini` (or create one at `ai-service/pytest.ini`):
  ```ini
  [pytest]
  asyncio_mode = auto
  ```

- [ ] **Step 1: Write failing tests**

  Create `ai-service/tests/test_route_optimizer.py`:

  ```python
  import pytest
  from unittest.mock import AsyncMock, patch, MagicMock
  import httpx

  from app.services.route_optimizer import (
      compute_distance_matrix,
      get_route_geometry,
      optimize_route,
  )

  # ─── get_route_geometry ───────────────────────────────────────────────────────

  @pytest.mark.asyncio
  async def test_get_route_geometry_returns_none_when_no_api_key():
      """With no ORS_API_KEY, get_route_geometry returns None gracefully."""
      waypoints = [
          {"lat": 14.5995, "lon": 120.9842},
          {"lat": 14.6100, "lon": 120.9900},
      ]
      with patch("app.services.route_optimizer.settings") as mock_settings:
          mock_settings.ORS_API_KEY = None
          result = await get_route_geometry(waypoints)
      assert result is None

  @pytest.mark.asyncio
  async def test_get_route_geometry_returns_none_on_429():
      """On ORS rate limit (429), get_route_geometry returns None."""
      waypoints = [
          {"lat": 14.5995, "lon": 120.9842},
          {"lat": 14.6100, "lon": 120.9900},
      ]
      mock_response = MagicMock()
      mock_response.status_code = 429

      with patch("app.services.route_optimizer.settings") as mock_settings, \
           patch("httpx.AsyncClient") as mock_client_cls:
          mock_settings.ORS_API_KEY = "test-key"
          mock_client = AsyncMock()
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)
          mock_client.post = AsyncMock(return_value=mock_response)
          mock_client_cls.return_value = mock_client

          result = await get_route_geometry(waypoints)
      assert result is None

  @pytest.mark.asyncio
  async def test_get_route_geometry_returns_geojson_on_success():
      """On 200 response, get_route_geometry returns parsed GeoJSON."""
      waypoints = [
          {"lat": 14.5995, "lon": 120.9842},
          {"lat": 14.6100, "lon": 120.9900},
      ]
      mock_geojson = {
          "type": "FeatureCollection",
          "features": [{"type": "Feature", "geometry": {"type": "LineString", "coordinates": []}}],
      }
      mock_response = MagicMock()
      mock_response.status_code = 200
      mock_response.json = MagicMock(return_value=mock_geojson)

      with patch("app.services.route_optimizer.settings") as mock_settings, \
           patch("httpx.AsyncClient") as mock_client_cls:
          mock_settings.ORS_API_KEY = "test-key"
          mock_client = AsyncMock()
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)
          mock_client.post = AsyncMock(return_value=mock_response)
          mock_client_cls.return_value = mock_client

          result = await get_route_geometry(waypoints)
      assert result == mock_geojson

  # ─── avoid_features threading ─────────────────────────────────────────────────

  @pytest.mark.asyncio
  async def test_optimize_route_passes_avoid_features_to_distance_matrix():
      """avoid_features list is threaded into compute_distance_matrix."""
      depot = {"lat": 14.5995, "lon": 120.9842}
      bins = [
          {"id": "b1", "lat": 14.601, "lon": 120.985, "fill_level": 85, "capacity": 120},
          {"id": "b2", "lat": 14.603, "lon": 120.987, "fill_level": 90, "capacity": 120},
      ]

      with patch(
          "app.services.route_optimizer.compute_distance_matrix",
          new_callable=AsyncMock,
      ) as mock_matrix, patch(
          "app.services.route_optimizer.get_route_geometry",
          new_callable=AsyncMock,
          return_value=None,
      ):
          mock_matrix.return_value = [[0, 500, 800], [500, 0, 400], [800, 400, 0]]
          await optimize_route(
              depot=depot,
              bins=bins,
              avoid_features=["highways"],
          )
          mock_matrix.assert_called_once()
          call_kwargs = mock_matrix.call_args
          assert call_kwargs.kwargs.get("avoid_features") == ["highways"] or \
                 (len(call_kwargs.args) >= 3 and call_kwargs.args[2] == ["highways"])
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  From `ai-service/`:
  ```bash
  source venv/bin/activate && pytest tests/test_route_optimizer.py -v 2>&1 | head -30
  ```
  Expected: `ImportError: cannot import name 'get_route_geometry'` — confirms the function doesn't exist yet.

- [ ] **Step 3: Update `compute_distance_matrix` signature**

  In `ai-service/app/services/route_optimizer.py`, change the function signature at line 43:

  ```python
  async def compute_distance_matrix(
      depot: dict, bins: list[dict], avoid_features: list[str] | None = None
  ) -> list[list[int]]:
  ```

  Inside the ORS call body (around line 79), add `avoid_features` to the request:

  ```python
  body = {
      "locations": coordinates,
      "metrics": ["distance"],
      "units": "m",
  }
  if avoid_features:
      body["options"] = {"avoid_features": avoid_features}
  ```

- [ ] **Step 4: Update `optimize_route` signature**

  > Note: Steps 3, 4, and 5 each modify `route_optimizer.py`. Apply them in order (3 → 4 → 5). Line numbers shift after each edit; use function names as anchors, not line numbers.</p>

  Change the function signature (find `async def optimize_route(`):

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

  Update the `compute_distance_matrix` call inside `optimize_route` (around line 207):

  ```python
  if distance_matrix is None:
      distance_matrix = await compute_distance_matrix(depot, bins, avoid_features=avoid_features)
  ```

- [ ] **Step 5: Add `get_route_geometry` function**

  Add this function after `compute_distance_matrix` and before `_calculate_naive_distance`:

  ```python
  async def get_route_geometry(
      waypoints: list[dict], avoid_features: list[str] | None = None
  ) -> dict | None:
      """
      Call ORS Directions API (driving-car) for road-following GeoJSON geometry.

      Args:
          waypoints: List of dicts with 'lat' and 'lon' keys (depot first, then stops, depot last).
          avoid_features: Optional list of ORS avoid features e.g. ["highways", "tollways"].

      Returns:
          GeoJSON FeatureCollection dict, or None on failure (429, non-2xx, no API key, exception).
      """
      if not settings.ORS_API_KEY:
          return None

      if len(waypoints) < 2:
          return None

      # ORS requires [longitude, latitude]
      coordinates = [[wp["lon"], wp["lat"]] for wp in waypoints]

      body: dict = {"coordinates": coordinates}
      if avoid_features:
          body["options"] = {"avoid_features": avoid_features}

      headers = {
          "Authorization": settings.ORS_API_KEY,
          "Content-Type": "application/json; charset=utf-8",
          "Accept": "application/json, application/geo+json",
      }

      try:
          async with httpx.AsyncClient() as client:
              response = await client.post(
                  "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
                  json=body,
                  headers=headers,
                  timeout=15.0,
              )

          if response.status_code == 200:
              logger.info("ORS Directions geometry fetched for %d waypoints", len(waypoints))
              return response.json()
          else:
              logger.warning(
                  "ORS Directions returned %d, skipping geometry", response.status_code
              )
              return None

      except Exception as e:
          logger.warning("get_route_geometry failed: %s", str(e))
          return None
  ```

- [ ] **Step 6: Call `get_route_geometry` after solving and return `route_geojson`**

  In `optimize_route`, after the solution extraction loop (after `total_distance_km = total_distance_meters / 1000.0`), add:

  ```python
  # Fetch road geometry for each vehicle route, sequentially to respect ORS rate limits
  all_features: list[dict] = []
  for vehicle_route in routes:
      waypoint_list = [{"lat": depot["lat"], "lon": depot["lon"]}]
      for stop in vehicle_route["stops"]:
          waypoint_list.append({"lat": stop["lat"], "lon": stop["lon"]})
      waypoint_list.append({"lat": depot["lat"], "lon": depot["lon"]})

      geometry = await get_route_geometry(waypoint_list, avoid_features=avoid_features)
      if geometry and geometry.get("features"):
          all_features.extend(geometry["features"])

  route_geojson: dict | None = None
  if all_features:
      route_geojson = {"type": "FeatureCollection", "features": all_features}
  ```

  Update the return dict to include `route_geojson`:

  ```python
  return {
      "routes": routes,
      "total_distance_km": round(total_distance_km, 2),
      "estimated_duration_minutes": round(estimated_duration, 1),
      "optimization_score": optimization_score,
      "num_bins_served": total_bins_served,
      "status": "success",
      "route_geojson": route_geojson,
  }
  ```

  Also update **both** early returns in `optimize_route` to include `route_geojson: None`.

  The `no_bins` early return (find `"status": "no_bins"`):
  ```python
  return {
      "routes": [],
      "total_distance_km": 0.0,
      "estimated_duration_minutes": 0.0,
      "optimization_score": 100,
      "num_bins_served": 0,
      "status": "no_bins",
      "route_geojson": None,
  }
  ```

  The `no_solution` early return (find `"status": "no_solution"`):
  ```python
  return {
      "routes": [],
      "total_distance_km": 0.0,
      "estimated_duration_minutes": 0.0,
      "optimization_score": 0,
      "num_bins_served": 0,
      "status": "no_solution",
      "route_geojson": None,
  }
  ```

- [ ] **Step 7: Run tests**

  ```bash
  pytest tests/test_route_optimizer.py -v 2>&1
  ```
  Expected: all 4 tests pass.

- [ ] **Step 8: Commit**

  ```bash
  git add ai-service/app/services/route_optimizer.py ai-service/tests/test_route_optimizer.py
  git commit -m "feat(ai): add get_route_geometry(), thread avoid_features through CVRP optimizer"
  ```

---

### Task 3: AI service — Update router request/response models

**Files:**
- Modify: `ai-service/app/routers/routes.py`

- [ ] **Step 1: Add fields to `OptimizeRequest`**

  In `ai-service/app/routers/routes.py`, add to the `OptimizeRequest` Pydantic model:

  ```python
  class OptimizeRequest(BaseModel):
      subdivision_id: Optional[str] = None
      depot: DepotLocation
      num_vehicles: int = Field(default=1, ge=1, le=20)
      vehicle_capacity_liters: int = Field(default=1000, ge=100, le=50000)
      threshold_percent: float = Field(default=80.0, ge=0.0, le=100.0)
      include_predicted: bool = True
      avoid_highways: bool = False
      avoid_tolls: bool = False
  ```

- [ ] **Step 2: Add `route_geojson` to `OptimizeResponse`**

  ```python
  class OptimizeResponse(BaseModel):
      routes: list[VehicleRoute]
      total_distance_km: float
      estimated_duration_minutes: float
      optimization_score: int
      num_bins_served: int
      status: str
      route_geojson: Optional[dict] = None
  ```

- [ ] **Step 3: Build `avoid_features` list and pass to optimizer**

  In the `optimize_collection_route` handler, after validating the request and before calling `optimize_route`, add:

  ```python
  avoid_features: list[str] = []
  if request.avoid_highways:
      avoid_features.append("highways")
  if request.avoid_tolls:
      avoid_features.append("tollways")
  ```

  Update the `optimize_route` call:

  ```python
  result = await optimize_route(
      depot=depot,
      bins=optimizer_bins,
      num_vehicles=request.num_vehicles,
      vehicle_capacity=request.vehicle_capacity_liters,
      avoid_features=avoid_features if avoid_features else None,
  )
  ```

  Update the `OptimizeResponse` construction at the end of the handler:

  ```python
  return OptimizeResponse(
      routes=response_routes,
      total_distance_km=result.get("total_distance_km", 0.0),
      estimated_duration_minutes=result.get("estimated_duration_minutes", 0.0),
      optimization_score=result.get("optimization_score", 0),
      num_bins_served=result.get("num_bins_served", 0),
      status=result.get("status", "success"),
      route_geojson=result.get("route_geojson"),
  )
  ```

- [ ] **Step 4: Verify service starts without errors**

  ```bash
  cd ai-service && source venv/bin/activate && uvicorn app.main:app --port 8000 --reload &
  sleep 2
  curl -s http://localhost:8000/health | python3 -m json.tool
  kill %1
  ```
  Expected: `{"status": "ok", ...}`

- [ ] **Step 5: Commit**

  ```bash
  git add ai-service/app/routers/routes.py
  git commit -m "feat(ai): add avoid_highways/avoid_tolls to OptimizeRequest, route_geojson to OptimizeResponse"
  ```

---

## Chunk 2: Backend Route Generation

### Task 4: Update `/routes/generate` endpoint

**Files:**
- Modify: `backend/src/routes/routes.ts:52-58` (generateRouteSchema), `:232-295` (generate handler)

- [ ] **Step 1: Replace `generateRouteSchema`**

  In `backend/src/routes/routes.ts`, replace lines 52–58:

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

- [ ] **Step 2: Remove hardcoded depot lookup and update the fetch call**

  > **Depends on:** Task 3 (Chunk 1) must be deployed first — the AI service `OptimizeRequest` model must already accept `vehicle_capacity_liters` (not `vehicle_capacity`) before this backend change is activated.

  In the `app.post("/generate", ...)` handler:

  a) **Delete** the entire depot lookup block — starting from `// 1. Get depot coordinates...` through the closing `}` of the `for` loop (lines 232–255 inclusive). This removes the `let depotLat`, `let depotLng` declarations and the full `system_config` query.

  b) **Replace** the `const optimizeResponse = await fetch(...)` call body. The `fetch(` call starts at line 282; replace from `const optimizeResponse` through the closing `});` of the fetch arguments with:

  ```typescript
  const optimizeResponse = await fetch(`${aiServiceUrl}/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subdivision_id: parsed.data.subdivisionId,
      depot: {
        latitude: parsed.data.depotLat,
        longitude: parsed.data.depotLng,
      },
      num_vehicles: parsed.data.numVehicles,
      vehicle_capacity_liters: parsed.data.vehicleCapacityLiters,
      threshold_percent: parsed.data.thresholdPercent,
      include_predicted: parsed.data.includePredicted,
      avoid_highways: parsed.data.avoidHighways,
      avoid_tolls: parsed.data.avoidTolls,
    }),
  });
  ```

- [ ] **Step 3: Update the AI service result type to include `route_geojson`**

  In the `optimizationResult` type declaration (around line 260), add:

  ```typescript
  let optimizationResult: {
    routes?: Array<{
      vehicle_id: number;
      stops: Array<{
        device_id: string;
        device_code?: string;
        latitude: number;
        longitude: number;
        sequence: number;
      }>;
      distance_km?: number;
      duration_minutes?: number;
    }>;
    total_distance_km?: number;
    total_duration_minutes?: number;
    optimization_score?: number;
    route_geojson?: object | null;
    error?: string;
  } | null = null;
  ```

- [ ] **Step 4: Persist `routeGeojson` in both the AI path and fallback inserts**

  In the AI-service path insert `.values()` (around line 320), add:

  ```typescript
  routeGeojson: optimizationResult?.route_geojson
    ? JSON.stringify(optimizationResult.route_geojson)
    : null,
  ```

  In the fallback path insert `.values()` (around line 382), add:

  ```typescript
  routeGeojson: null,
  ```

- [ ] **Step 4b: Update fallback `.limit()` call — `maxStops` was removed from schema**

  The fallback query at line ~379 still references `parsed.data.maxStops` which no longer exists in the new schema. Find the line:
  ```typescript
  .limit(parsed.data.maxStops);
  ```
  Replace it with a hardcoded limit:
  ```typescript
  .limit(50);
  ```

- [ ] **Step 5: Remove the now-unused `systemConfig` import (if no other usages)**

  Run this **after completing Steps 1–2** (not before — the grep would show hits from the deleted block):
  ```bash
  grep -n "systemConfig" backend/src/routes/routes.ts
  ```
  If no results appear, remove `systemConfig` from the import at line 5 (it will look like `import { ..., systemConfig } from "../db/schema"`).

  If results still appear, the import is still needed — leave it.

- [ ] **Step 6: Verify backend compiles**

  ```bash
  cd backend && bun run dev 2>&1 | head -20
  ```
  Expected: server starts on port 3000 with no TypeScript errors.

- [ ] **Step 7: Smoke test the endpoint validation**

  ```bash
  curl -s -X POST http://localhost:3000/api/v1/routes/generate \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer test" \
    -d '{"subdivisionId":"not-a-uuid"}' | python3 -m json.tool
  ```
  Expected: `{"error":"Validation failed", ...}` — confirms new schema is active.

- [ ] **Step 8: Commit**

  ```bash
  git add backend/src/routes/routes.ts
  git commit -m "feat(backend): wire depotLat/Lng, numVehicles, avoidHighways to AI service; persist routeGeojson"
  ```

---

## Chunk 3: Routes Page UI Rewrite

> **Prerequisites:** Chunk 1, Task 1 must be complete — `CollectionRoute` must have `routeGeojson: string | null` and `RouteOptimizationRequest` must include `depotLat`, `depotLng`, `avoidHighways`, `avoidTolls`. Chunk 2, Tasks 3–4 must be complete (backend wired, `routeGeojson` column populated). Both type updates are in `frontend/src/types/api.ts` — without them Task 5 Step 4 and Task 6 Step 1/3 will fail TypeScript compilation.

### Task 5: Map-first layout + floating route list + stop info card

**Files:**
- Modify: `frontend/src/pages/routes.tsx` (full rewrite)
- Modify: `frontend/src/index.css` (add animation keyframes)

- [ ] **Step 1: Add animation CSS to `frontend/src/index.css`**

  Append to the end of `frontend/src/index.css`:

  ```css
  /* Route polyline animated dashes */
  .route-animated-path {
    animation: dash-march 0.6s linear infinite;
  }
  @keyframes dash-march {
    to {
      stroke-dashoffset: -24;
    }
  }

  /* Selected stop pulse ring — deferred; SVG concentric circles not wired in this iteration */
  /* .stop-pulse { animation: stop-pulse 1.5s ease-out infinite; } */
  /* @keyframes stop-pulse { 0% { opacity: 0.6; r: 20; } 100% { opacity: 0; r: 36; } } */
  ```
  > Note: `stop-pulse` is defined but commented out. The pulse ring (SVG `<circle>` overlay) is deferred to a follow-up task. The CSS is kept as a reference so it can be uncommented when the SVG ring is added.

- [ ] **Step 2: Replace the `MapController` component**

  In `routes.tsx`, replace the existing `MapController` component with an improved version that uses `flyToBounds` for smoother transitions:

  ```typescript
  interface MapControllerProps {
    boundsCoords: [number, number][] | null;
    centerStop: { lat: number; lng: number } | null;
  }

  function MapController({ boundsCoords, centerStop }: MapControllerProps) {
    const map = useMap();

    useEffect(() => {
      if (centerStop) {
        map.flyTo([centerStop.lat, centerStop.lng], 17, { duration: 0.8 });
      }
    }, [centerStop, map]);

    useEffect(() => {
      if (boundsCoords && boundsCoords.length > 1) {
        const bounds = L.latLngBounds(boundsCoords);
        map.flyToBounds(bounds, { padding: [60, 60], duration: 1.0, maxZoom: 16 });
      }
    }, [boundsCoords, map]);

    return null;
  }
  ```

- [ ] **Step 3: Add custom numbered marker factory**

  Add this helper after the `MapController` component:

  ```typescript
  function makeStopIcon(sequenceOrder: number, status: RouteStop["status"]): L.DivIcon {
    const colorMap: Record<RouteStop["status"], string> = {
      pending: "#1da253",
      arrived: "#0ea5e9",
      serviced: "#94a3b8",
      skipped: "#dc2626",
    };
    const bg = colorMap[status];
    return L.divIcon({
      className: "",
      html: `<div style="
        width:28px;height:28px;border-radius:50%;
        background:${bg};color:white;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;
        border:2.5px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.25);
      ">${sequenceOrder}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  ```

- [ ] **Step 4: Hoist `badgeClasses` to module scope**

  Before touching the JSX, move the `badgeClasses` record out of `RouteRow` (where it currently lives at approximately line 745) and up to module scope, just after the `statusLabel` constant. This allows `RoutesPage` to reference it in the floating route list.

  **Keep the exact same CSS classes** that `RouteRow` currently uses — do NOT slim them down. This preserves the existing table badge styling while making the record available to `RoutesPage`:

  ```typescript
  // After statusLabel constant, add:
  const badgeClasses: Record<CollectionRoute["status"], string> = {
    planned:     "bg-blue-100 text-blue-700 hover:bg-blue-100/80 border-transparent rounded-full font-semibold px-3 py-0.5",
    in_progress: "bg-[#fef3c7] text-[#92400e] hover:bg-[#fef3c7]/80 border-transparent rounded-full font-semibold px-3 py-0.5",
    completed:   "bg-green-100 text-green-700 hover:bg-green-100/80 border-transparent rounded-full font-semibold px-3 py-0.5",
    cancelled:   "bg-red-500 text-white hover:bg-red-500/80 border-transparent rounded-full font-semibold px-3 py-0.5",
  };
  ```

  Remove the local `badgeClasses` declaration inside `RouteRow` (the `const badgeClasses: Record<string, string> = { ... }` block at approximately line 745–750 of the original file). `RouteRow`'s `<Badge className={badgeClasses[route.status]}>` call will now resolve to the module-scoped constant — no other changes to `RouteRow` are needed.

- [ ] **Step 5: Replace the page layout — map takes full width**

  Replace the main return JSX in `RoutesPage`. The new structure is:

  ```typescript
  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Route Planning & Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            Manage collection routes and track driver dispatch status.
          </p>
        </div>
        <Button
          className="bg-[#1da253] text-white hover:bg-[#1da253]/90"
          onClick={() => { setShowGenerateModal(true); setGenerateResult(null); generateRouteMutation.reset(); }}
        >
          <Play className="h-4 w-4 mr-1.5" />
          Generate Route
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map((tab) => {
          const isActive = statusFilter === tab.value;
          return (
            <Button
              key={tab.value}
              variant="outline"
              className={cn(
                "rounded-md px-4 py-2 font-medium h-9 border",
                isActive
                  ? "bg-[#1da253] text-white hover:bg-[#1da253]/90 border-transparent shadow-sm"
                  : "bg-white text-foreground hover:bg-muted/50 border-gray-200"
              )}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Generation feedback banners */}
      {generateRouteMutation.isSuccess && !showGenerateModal && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle className="mr-1.5 inline-block h-4 w-4" />
          New route generated successfully.
          {generateResult?.optimizationScore != null && (
            <span className="ml-2 font-semibold">Score: {generateResult.optimizationScore}%</span>
          )}
        </div>
      )}
      {generateRouteMutation.isError && !showGenerateModal && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to generate route. Please try again.
        </div>
      )}

      {/* Map-first layout: full width map, floating panels */}
      <div className="relative rounded-xl border bg-white overflow-hidden shadow-sm flex-1 min-h-[560px]">
        {/* Full-width map */}
        <div className="absolute inset-0 z-0">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController boundsCoords={routeBounds} centerStop={focusedStop} />

            {/* Road-following route geometry (or straight-line fallback) */}
            {expandedRouteId && (() => {
              const activeRoute = routes.find(r => r.id === expandedRouteId);
              if (activeRoute?.routeGeojson) {
                const geoData = JSON.parse(activeRoute.routeGeojson);
                return (
                  <>
                    {/* Glow layer underneath */}
                    <GeoJSON
                      key={`${expandedRouteId}-glow`}
                      data={geoData}
                      style={() => ({ color: "white", weight: 9, opacity: 0.18 })}
                    />
                    {/* Animated dash layer */}
                    {/* NOTE: If className prop does not apply to SVG paths (verify in DevTools),
                        move it into style: style={() => ({ color: "#0369a1", weight: 5, dashArray: "10 14", className: "route-animated-path" })}
                        PathOptions includes className — both approaches are valid in Leaflet */}
                    <GeoJSON
                      key={`${expandedRouteId}-dash`}
                      data={geoData}
                      className="route-animated-path"
                      style={() => ({ color: "#0369a1", weight: 5, dashArray: "10 14" })}
                    />
                  </>
                );
              }
              // Fallback: straight-line polyline
              const coords = getActiveRouteCoords();
              if (coords.length > 1) {
                return (
                  <Polyline
                    positions={coords}
                    color="#0369a1"
                    weight={4}
                    opacity={0.8}
                  />
                );
              }
              return null;
            })()}

            {/* Stop markers */}
            {expandedRouteId &&
              getStopsForRoute(expandedRouteId)
                .filter(s => s.latitude && s.longitude)
                .map((stop) => (
                  <Marker
                    key={stop.id}
                    position={[stop.latitude!, stop.longitude!]}
                    icon={makeStopIcon(stop.sequenceOrder, stop.status)}
                    eventHandlers={{
                      click: () => {
                        if (stop.latitude && stop.longitude) {
                          setFocusedStop({ lat: stop.latitude, lng: stop.longitude });
                          setActiveStop(stop);
                        }
                      },
                    }}
                  />
                ))}
          </MapContainer>
        </div>

        {/* Floating route list (left) */}
        <div className="absolute top-3 left-3 z-[500] w-52 bg-white rounded-xl shadow-lg border border-border overflow-hidden max-h-[calc(100%-24px)] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Routes</span>
            <span className="bg-[#1da253] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {filtered.length}
            </span>
          </div>
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <MapPin className="h-6 w-6 mb-2" />
                <p className="text-xs">No routes</p>
              </div>
            ) : (
              filtered.map((route) => {
                const isSelected = expandedRouteId === route.id;
                return (
                  <button
                    key={route.id}
                    onClick={() => toggleExpand(route.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/40 transition-colors",
                      isSelected && "bg-blue-50 border-l-2 border-l-[#0ea5e9]"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {truncateId(route.id)}
                      </span>
                      <Badge className={badgeClasses[route.status]} variant="outline">
                        {statusLabel[route.status]}
                      </Badge>
                    </div>
                    {isSelected && stopsLoading ? (
                      <div className="text-[10px] text-muted-foreground">Loading stops…</div>
                    ) : isSelected && getStopsForRoute(route.id).length > 0 ? (
                      <div className="text-[10px] text-muted-foreground">
                        {getStopsForRoute(route.id).length} stops
                        {route.estimatedDistanceKm != null && ` · ${route.estimatedDistanceKm.toFixed(1)} km`}
                        {route.optimizationScore != null && (
                          <span className={cn("ml-1 font-semibold", scoreColor(route.optimizationScore))}>
                            · {route.optimizationScore}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground">
                        {driverName(route.assignedDriverId)}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Floating stop info card (right, shown on stop click) */}
        {activeStop && (
          <div className="absolute bottom-3 right-3 z-[500] w-52 bg-white rounded-xl shadow-lg border border-border p-3"
               style={{ borderTop: `3px solid ${activeStop.status === "pending" ? "#1da253" : activeStop.status === "arrived" ? "#0ea5e9" : activeStop.status === "serviced" ? "#94a3b8" : "#dc2626"}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-foreground">Stop {activeStop.sequenceOrder}</span>
              <button onClick={() => setActiveStop(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mb-3 truncate">{activeStop.deviceId}</div>
            {activeStop.latitude && activeStop.longitude && (
              <div className="text-[10px] text-muted-foreground mb-2">
                {activeStop.latitude.toFixed(5)}, {activeStop.longitude.toFixed(5)}
              </div>
            )}
            <Badge variant={stopStatusBadgeVariant[activeStop.status]} className="mb-3">
              {activeStop.status}
            </Badge>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-[11px]"
                onClick={() => activeStop.latitude && activeStop.longitude && setFocusedStop({ lat: activeStop.latitude, lng: activeStop.longitude })}
              >
                Zoom
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Generate Route Modal — wired in Task 6, Step 4 (of Task 6) */}
    </div>
  );
  ```

- [ ] **Step 6: Add `activeStop` and `depotPinMode` state**

  Add to the `RoutesPage` state declarations (alongside other `useState` calls):

  ```typescript
  const [activeStop, setActiveStop] = useState<RouteStop | null>(null);
  const [depotPinMode, setDepotPinMode] = useState(false);
  ```

  `depotPinMode` is needed here because Step 5's JSX already references it (cursor class, overlay banner, `<MapEvents>`). Task 6 Step 1 will NOT redeclare it — only `generateParams` and `showAdvanced` are added there.

  Update `toggleExpand` to also clear `activeStop`:

  ```typescript
  function toggleExpand(routeId: string) {
    const isExpanding = expandedRouteId !== routeId;
    setExpandedRouteId(isExpanding ? routeId : null);
    setFocusedStop(null);
    setActiveStop(null);
    if (!isExpanding) setRouteBounds(null);
  }
  ```

- [ ] **Step 7: Update react-leaflet imports**

  At the top of `routes.tsx`, change the react-leaflet import:

  ```typescript
  import { MapContainer, TileLayer, Marker, Popup, Polyline, GeoJSON, useMap, useMapEvents } from "react-leaflet";
  ```

  (Keep `Polyline` for the straight-line fallback. `useMapEvents` is needed by `MapEvents` added in Task 6, Step 2.)

- [ ] **Step 8: Verify page renders without console errors**

  ```bash
  cd frontend && bun run dev
  ```
  Open `http://localhost:5173/routes`. Expected: map fills the content area, floating route list appears on left, no console errors.

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/src/pages/routes.tsx frontend/src/index.css
  git commit -m "feat(frontend): map-first routes layout, floating panels, animated GeoJSON polyline, numbered stop markers"
  ```

---

### Task 6: Generate Route Modal — smart defaults, depot pin, avoidance toggles

> **Prerequisite:** Chunk 1, Task 1 must be complete. Both `CollectionRoute` (needs `routeGeojson: string | null`) and `RouteOptimizationRequest` (needs `depotLat`, `depotLng`, `avoidHighways`, `avoidTolls`) in `frontend/src/types/api.ts` must be updated before this task runs. Task 5 Step 6 (`activeStop`, `depotPinMode`) must also be complete.

**Files:**
- Modify: `frontend/src/pages/routes.tsx` (modal section + state)

- [ ] **Step 1: Replace `generateParams` state and add `showAdvanced` state**

  In `RoutesPage`, find the existing `generateParams` useState declaration (currently at approximately line 143–149):

  ```typescript
  // EXISTING — replace this entire block:
  const [generateParams, setGenerateParams] = useState<RouteOptimizationRequest>({
    subdivisionId: "",
    numVehicles: 1,
    vehicleCapacityLiters: 1000,
    thresholdPercent: 80,
    includePredicted: false,
  });
  ```

  Replace it with the expanded version (adds `depotLat`, `depotLng`, `avoidHighways`, `avoidTolls`, and fixes `includePredicted` default), then add `showAdvanced` immediately after. Do NOT add `depotPinMode` here — it was already added in Task 5 Step 6:

  ```typescript
  const [generateParams, setGenerateParams] = useState<RouteOptimizationRequest>({
    subdivisionId: "",
    depotLat: 0,
    depotLng: 0,
    numVehicles: 1,
    vehicleCapacityLiters: 1000,
    thresholdPercent: 80,
    includePredicted: true,
    avoidHighways: false,
    avoidTolls: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  ```

- [ ] **Step 2: Add depot-pin map click handler**

  Define `MapEvents` as a component at **module scope**, immediately after `makeStopIcon` (i.e., before `RoutesPage`). Do NOT define it inside `RoutesPage` — react-leaflet components must be defined outside the component tree that renders `<MapContainer>`:

  ```typescript
  function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
    useMapEvents({
      click(e) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  }
  ```

  (`useMapEvents` is already in the react-leaflet import added in Task 5 Step 6.)

  Inside `<MapContainer>` in `RoutesPage`:

  ```typescript
  {depotPinMode && (
    <MapEvents
      onMapClick={(lat, lng) => {
        setGenerateParams(p => ({ ...p, depotLat: lat, depotLng: lng }));
        setDepotPinMode(false);
        setShowGenerateModal(true);
      }}
    />
  )}
  ```

  When `depotPinMode` is true, add a visible instruction banner overlay over the map:

  ```typescript
  {depotPinMode && (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[600] flex justify-center pointer-events-none">
      <div className="bg-[#1e293b]/90 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-xl">
        📍 Click the map to set the depot location
      </div>
    </div>
  )}
  ```

  Also add a cursor class to the map container div when in pin mode:
  ```typescript
  <div className={cn("absolute inset-0 z-0", depotPinMode && "[&_.leaflet-container]:cursor-crosshair")}>
  ```

- [ ] **Step 3: Extract `GenerateRouteModal` as a component below `RoutesPage`**

  Create a `GenerateRouteModal` component in the same file (after `RouteRow`). It receives:

  ```typescript
  interface GenerateRouteModalProps {
    subdivisions: Subdivision[];
    params: RouteOptimizationRequest;
    setParams: React.Dispatch<React.SetStateAction<RouteOptimizationRequest>>;
    showAdvanced: boolean;
    setShowAdvanced: (v: boolean) => void;
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    generateResult: CollectionRoute | null;
    onClose: () => void;
    onGenerate: () => void;
    onPinDepot: () => void;
  }
  ```

  The modal body:

  ```typescript
  function GenerateRouteModal({
    subdivisions, params, setParams, showAdvanced, setShowAdvanced,
    isPending, isSuccess, isError, generateResult, onClose, onGenerate, onPinDepot,
  }: GenerateRouteModalProps) {
    const depotSet = params.depotLat !== 0 || params.depotLng !== 0;

    // Smart defaults chip labels
    const defaultChips = [
      params.avoidHighways ? "No highways" : null,
      params.avoidTolls ? "No tolls" : null,
      params.includePredicted ? "AI predictions ✓" : null,
      `${params.numVehicles} truck${params.numVehicles > 1 ? "s" : ""}`,
      `${params.thresholdPercent}% threshold`,
    ].filter(Boolean);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => { if (!isPending) onClose(); }} />
        <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Generate Optimized Route</h2>
            </div>
            <button onClick={onClose} disabled={isPending} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4 p-5">
            {/* Smart defaults chips */}
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-xs font-bold text-green-700 mb-2">SMART DEFAULTS</p>
              <div className="flex flex-wrap gap-1.5">
                {defaultChips.map((chip) => (
                  <span key={chip} className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Subdivision */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Subdivision</label>
              <select
                value={params.subdivisionId}
                onChange={(e) => setParams(p => ({ ...p, subdivisionId: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a subdivision…</option>
                {subdivisions.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name} ({sub.code})</option>
                ))}
              </select>
            </div>

            {/* Depot */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                Depot Location
                <span className="text-destructive text-xs font-normal">required</span>
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Latitude"
                  value={params.depotLat || ""}
                  onChange={(e) => setParams(p => ({ ...p, depotLat: parseFloat(e.target.value) || 0 }))}
                  className={cn("flex-1", !depotSet && "border-destructive focus-visible:ring-destructive")}
                />
                <Input
                  type="number"
                  placeholder="Longitude"
                  value={params.depotLng || ""}
                  onChange={(e) => setParams(p => ({ ...p, depotLng: parseFloat(e.target.value) || 0 }))}
                  className={cn("flex-1", !depotSet && "border-destructive focus-visible:ring-destructive")}
                />
                <Button
                  variant="outline"
                  size="icon"
                  title="Pin depot on map"
                  onClick={onPinDepot}
                  className="shrink-0"
                >
                  <MapPin className="h-4 w-4" />
                </Button>
              </div>
              {!depotSet && (
                <p className="text-xs text-destructive">Set depot coordinates or pin on map</p>
              )}
            </div>

            {/* Advanced collapsible */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                Advanced Options
                <span className="text-muted-foreground text-xs">{showAdvanced ? "▴" : "▾"}</span>
              </button>

              {showAdvanced && (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Vehicles</label>
                      <Input
                        type="number" min={1} max={20}
                        value={params.numVehicles}
                        onChange={(e) => setParams(p => ({ ...p, numVehicles: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Capacity (L)</label>
                      <Input
                        type="number" min={100} max={50000} step={100}
                        value={params.vehicleCapacityLiters}
                        onChange={(e) => setParams(p => ({ ...p, vehicleCapacityLiters: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Fill Threshold (%)</label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number" min={10} max={100}
                        value={params.thresholdPercent}
                        onChange={(e) => setParams(p => ({ ...p, thresholdPercent: Number(e.target.value) }))}
                        className="w-20"
                      />
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-2 rounded-full transition-all",
                            params.thresholdPercent >= 90 ? "bg-red-500" : params.thresholdPercent >= 75 ? "bg-yellow-500" : "bg-green-500"
                          )}
                          style={{ width: `${params.thresholdPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Toggle rows */}
                  {([
                    { key: "includePredicted", label: "Include AI-Predicted Overflows", desc: "LSTM model looks 24h ahead" },
                    { key: "avoidHighways", label: "Avoid Highways", desc: "Residential roads only" },
                    { key: "avoidTolls", label: "Avoid Toll Roads", desc: "" },
                  ] as const).map(({ key, label, desc }) => (
                    <label key={key} className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={params[key] as boolean}
                        onChange={(e) => setParams(p => ({ ...p, [key]: e.target.checked }))}
                        className="h-4 w-4 rounded border-input"
                      />
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Error / Success feedback */}
            {isError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                Failed to generate route. Check parameters and try again.
              </div>
            )}
            {isSuccess && generateResult && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle className="mr-1.5 inline-block h-4 w-4" />
                Route generated!
                {generateResult.optimizationScore != null && <span className="ml-1 font-semibold">Score: {generateResult.optimizationScore}%</span>}
                {generateResult.estimatedDistanceKm != null && <span className="ml-2">{generateResult.estimatedDistanceKm.toFixed(1)} km</span>}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-border p-5">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {isSuccess ? "Close" : "Cancel"}
            </Button>
            {!isSuccess && (
              <Button
                onClick={onGenerate}
                disabled={isPending || !params.subdivisionId || !depotSet}
              >
                {isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Optimizing…</>
                ) : !depotSet ? (
                  "Set Depot First"
                ) : (
                  <><Play className="h-4 w-4 mr-1.5" />Generate Route</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Wire `GenerateRouteModal` into `RoutesPage`**

  Replace the `{/* Generate Route Modal — wired in Task 6, Step 4 (of Task 6) */}` comment placeholder (added in Task 5 Step 5) with:

  ```typescript
  {showGenerateModal && (
    <GenerateRouteModal
      subdivisions={subdivisions}
      params={generateParams}
      setParams={setGenerateParams}
      showAdvanced={showAdvanced}
      setShowAdvanced={setShowAdvanced}
      isPending={generateRouteMutation.isPending}
      isSuccess={generateRouteMutation.isSuccess}
      isError={generateRouteMutation.isError}
      generateResult={generateResult}
      onClose={() => { if (!generateRouteMutation.isPending) setShowGenerateModal(false); }}
      onGenerate={() => generateRouteMutation.mutate(generateParams)}
      onPinDepot={() => { setShowGenerateModal(false); setDepotPinMode(true); }}
    />
  )}
  ```

- [ ] **Step 5: Verify modal flow in browser**

  - Click "Generate Route" → modal opens with smart defaults chips, red depot field, disabled button
  - Click 📍 pin → modal closes, map shows instruction banner, cursor changes
  - Click anywhere on map → modal reopens with lat/lng populated, button enabled
  - Expand "Advanced Options" → shows vehicles, capacity, threshold, checkboxes

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/routes.tsx
  git commit -m "feat(frontend): redesign generate route modal with smart defaults, depot pin, avoidance toggles"
  ```

---

## Chunk 4: Subdivisions Page Improvements

### Task 7: Improved polygon styling + bin markers + stats chips

**Files:**
- Modify: `frontend/src/pages/subdivisions.tsx`

- [ ] **Step 0: Consolidate all import changes first**

  At the top of `frontend/src/pages/subdivisions.tsx`, update all imports before touching any logic:

  ```typescript
  // Change this line:
  import { useState, useEffect } from "react";
  // To:
  import React, { useState, useEffect, useMemo } from "react";

  // Add useQuery to the existing @tanstack/react-query import (or add it if missing):
  import { useQuery } from "@tanstack/react-query";

  // Add SmartBin to the existing @/types/api import:
  import type { SmartBin } from "@/types/api";

  // Add CircleMarker to the existing react-leaflet import:
  import { MapContainer, TileLayer, Polygon, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
  ```

- [ ] **Step 1: Add `selectedSubId` state and bin stats query**

  Add these declarations inside `SubdivisionsPage`, after the existing state variables:

  ```typescript
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Fetch bins for selected subdivision (for stats chips + markers)
  // Keep the existing fetchSubdivisions / useEffect pattern unchanged.
  const { data: subdivisionBinsResponse } = useQuery({
    queryKey: ["subdivision-bins", selectedSubId],
    queryFn: async () => {
      const res = await api.get("/bins", {
        params: { subdivisionId: selectedSubId, limit: 200 },
      });
      return res.data;
    },
    enabled: !!selectedSubId,
  });

  const subdivisionBins: SmartBin[] = subdivisionBinsResponse?.data ?? [];
  ```

  > Do NOT replace `fetchSubdivisions` / `useEffect` / `setSubdivisions`. Leave the existing data-fetching pattern as-is; only add the new query above.

- [ ] **Step 2: Compute stats from bin data**

  Add after the `subdivisionBins` declaration:

  ```typescript
  const subStats = useMemo(() => {
    if (!subdivisionBins.length) return null;
    const total = subdivisionBins.length;
    // Proxy for "alerting": bins in offline or maintenance status.
    // Note: this uses bin status, not the Alert entity. Accepted trade-off for this scope.
    const alertCount = subdivisionBins.filter(
      b => b.status === "offline" || b.status === "maintenance"
    ).length;
    const avgFill = Math.round(
      subdivisionBins.reduce((sum, b) => sum + b.thresholdPercent, 0) / total
    );
    return { total, alertCount, avgFill };
  }, [subdivisionBins]);
  ```

  (`useMemo` is already added in Step 0.)

- [ ] **Step 3: Update `handleSubFocus` to set `selectedSubId`**

  Replace the existing `handleSubFocus` function (it currently takes a `geofence: string` arg):

  ```typescript
  // OLD (remove this):
  const handleSubFocus = (geofence: string) => {
    const coords = getPolygonPositions(geofence);
    if (coords.length > 0) {
      setMapBounds(coords);
    }
  };

  // NEW (replace with):
  const handleSubFocus = (sub: { id: string; geofence: string }) => {
    setSelectedSubId(sub.id);
    const coords = getPolygonPositions(sub.geofence);
    if (coords.length > 0) setMapBounds(coords);
  };
  ```

  Update the `TableRow onClick` call site (currently `onClick={() => handleSubFocus(sub.geofence)}`):
  ```typescript
  // OLD:
  onClick={() => handleSubFocus(sub.geofence)}
  // NEW:
  onClick={() => handleSubFocus(sub)}
  ```

- [ ] **Step 4: Add stats chips below the selected row's name**

  In the `TableRow` body, below the name cell content, add inline stats:

  ```typescript
  <TableCell className="font-medium text-foreground/90 align-top py-4">
    {sub.name}
    {selectedSubId === sub.id && subStats && (
      <div className="flex flex-wrap gap-1 mt-1.5">
        <span className="bg-green-100 text-green-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
          {subStats.total} bins
        </span>
        {subStats.alertCount > 0 && (
          <span className="bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            ⚠ {subStats.alertCount} offline
          </span>
        )}
        <span className="bg-muted text-muted-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
          Avg {subStats.avgFill}%
        </span>
      </div>
    )}
  </TableCell>
  ```

- [ ] **Step 5: Improve polygon styling — selected polygon glows, others dim**

  Replace the single `<Polygon>` render block with dual-layer styling for selected vs unselected:

  ```typescript
  {filteredSubdivisions.map((sub) => {
    const positions = getPolygonPositions(sub.geofence);
    if (!positions.length) return null;
    const isSelected = selectedSubId === sub.id;
    return (
      <React.Fragment key={sub.id}>
        {/* Glow ring for selected */}
        {isSelected && (
          <Polygon
            positions={positions}
            color="#1da253"
            weight={10}
            opacity={0.15}
            fillOpacity={0}
          />
        )}
        {/* Main polygon */}
        <Polygon
          positions={positions}
          color={isSelected ? "#1da253" : "#0ea5e9"}
          weight={isSelected ? 3 : 1.5}
          fillColor={isSelected ? "#1da253" : "#38bdf8"}
          fillOpacity={isSelected ? 0.2 : 0.08}
          eventHandlers={{ click: () => handleSubFocus(sub) }}
        >
          <Popup>
            <div className="font-semibold">{sub.name}</div>
            <div className="text-sm">Code: {sub.code}</div>
          </Popup>
        </Polygon>
      </React.Fragment>
    );
  })}
  ```

  Add `React` to the import: `import React, { useState, useEffect, useMemo } from "react";`

- [ ] **Step 6: Add `CircleMarker` bin markers inside selected subdivision**

  Import `CircleMarker` from react-leaflet. After the polygon render block, add:

  > Note: Marker color uses `b.thresholdPercent` as a proxy for fill level — `SmartBin` does not carry live fill data (that lives on `BinTelemetry`). This is a known limitation accepted for this scope. Markers will reflect the configured threshold, not the real-time fill percentage.

  ```typescript
  {selectedSubId && subdivisionBins
    .filter(b => b.latitude != null && b.longitude != null)
    .map(b => {
      const fill = b.thresholdPercent; // threshold as fill proxy — see note above
      const color = fill >= 85 ? "#dc2626" : fill >= 70 ? "#f59e0b" : "#1da253";
      return (
        <CircleMarker
          key={b.id}
          center={[b.latitude, b.longitude]}
          radius={5}
          color="white"
          weight={1.5}
          fillColor={color}
          fillOpacity={0.9}
        >
          <Popup>
            <div className="font-semibold text-xs">{b.deviceCode}</div>
            <div className="text-xs text-muted-foreground">Status: {b.status}</div>
          </Popup>
        </CircleMarker>
      );
    })}
  ```

- [ ] **Step 7: Verify subdivisions page in browser**

  Open `http://localhost:5173/subdivisions`. Expected:
  - All polygons show dimmed blue
  - Click a subdivision row → polygon turns green with glow, stats chips appear below name (`N bins`, `Avg XX%`, red chip if offline bins exist), bin dots appear inside zone
  - Click another row → previous polygon dims, new one glows
  - In the browser Network tab, confirm a request to `/api/v1/bins?subdivisionId=...&limit=200` returns 200 with bin data

- [ ] **Step 8: Commit**

  ```bash
  git add frontend/src/pages/subdivisions.tsx
  git commit -m "feat(frontend): subdivisions polygon glow, bin CircleMarkers, inline stats chips on selection"
  ```

---

## Final Verification

- [ ] **End-to-end smoke test (requires running stack)**

  ```bash
  docker compose up -d
  ```

  1. Open `http://localhost:5173/routes`
  2. Click "Generate Route" — verify modal shows smart defaults, depot field is red/disabled
  3. Click 📍 pin, click map — verify depot coords populate
  4. Select a subdivision, set threshold to 70%, click Generate
  5. After generation, click the new route in the floating panel — verify animated polyline appears (or straight-line fallback if ORS key not set)
  6. Click a stop marker — verify info card pops up bottom-right
  7. Open `http://localhost:5173/subdivisions`
  8. Click a subdivision — verify polygon glows green, stats chips appear, bin markers show

- [ ] **Final commit**

  ```bash
  git add -A
  git commit -m "feat: route map redesign complete — map-first layout, road-following polylines, depot pin, avoidance toggles, subdivisions glow"
  ```
