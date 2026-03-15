import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  CollectionRoute,
  RouteStop,
  User,
  Subdivision,
  PaginatedResponse,
  RouteOptimizationRequest,
} from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Play,
  CheckCircle,
  X,
  Loader2,
  Settings2,
  TrendingUp,
  MapPin,
  RefreshCw,
  Navigation,
  ChevronRight,
} from "lucide-react";

// Map related imports
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// ---------------------------------------------------------------------------
// CSS for animated dashes
// ---------------------------------------------------------------------------

const DASH_ANIMATION_STYLE = `
  @keyframes dash-march {
    to { stroke-dashoffset: -20; }
  }
  .route-path {
    animation: dash-march 0.6s linear infinite;
    stroke-dasharray: 10 5;
  }
`;

// ---------------------------------------------------------------------------
// Helpers & constants
// ---------------------------------------------------------------------------

type RouteStatus = CollectionRoute["status"];

const STATUS_TABS: { label: string; value: RouteStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Planned", value: "planned" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
];

const statusLabel: Record<RouteStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const badgeClasses: Record<string, string> = {
  planned:
    "bg-blue-100 text-blue-700 hover:bg-blue-100/80 border-transparent rounded-full font-semibold px-3 py-0.5",
  in_progress:
    "bg-[#fef3c7] text-[#92400e] hover:bg-[#fef3c7]/80 border-transparent rounded-full font-semibold px-3 py-0.5",
  completed:
    "bg-green-100 text-green-700 hover:bg-green-100/80 border-transparent rounded-full font-semibold px-3 py-0.5",
  cancelled:
    "bg-red-500 text-white hover:bg-red-500/80 border-transparent rounded-full font-semibold px-3 py-0.5",
};

function makeStopIcon(seq: number) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#1da253;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${seq}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const depotIcon = L.divIcon({
  className: "",
  html: `<div style="background:#ef4444;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">D</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// ---------------------------------------------------------------------------
// MapEvents — module scope so it doesn't re-register on each render
// ---------------------------------------------------------------------------

function MapEvents({
  enabled,
  onClickMap,
}: {
  enabled: boolean;
  onClickMap: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) {
        onClickMap(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// ---------------------------------------------------------------------------
// MapController
// ---------------------------------------------------------------------------

function MapController({
  centerStop,
  boundsCoords,
}: {
  centerStop: { lat: number; lng: number } | null;
  boundsCoords: [number, number][] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (centerStop) {
      map.flyTo([centerStop.lat, centerStop.lng], 17, { duration: 1.2 });
    }
  }, [centerStop, map]);

  useEffect(() => {
    if (boundsCoords && boundsCoords.length > 0) {
      const bounds = L.latLngBounds(boundsCoords);
      map.fitBounds(bounds, { padding: [60, 60], duration: 1.2 });
    }
  }, [boundsCoords, map]);

  return null;
}

// ---------------------------------------------------------------------------
// GenerateRouteModal
// ---------------------------------------------------------------------------

function GenerateRouteModal({
  subdivisions,
  onClose,
  onSubmit,
  isPending,
  isSuccess,
  isError,
  result,
}: {
  subdivisions: Subdivision[];
  onClose: () => void;
  onSubmit: (params: RouteOptimizationRequest) => void;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  result: CollectionRoute | null;
}) {
  const [params, setParams] = useState<RouteOptimizationRequest>({
    subdivisionId: subdivisions[0]?.id ?? "",
    depotLat: 14.5995,
    depotLng: 120.9842,
    numVehicles: 1,
    vehicleCapacityLiters: 1000,
    thresholdPercent: 80,
    includePredicted: true,
    avoidHighways: false,
    avoidTolls: false,
  });
  const [depotPinMode, setDepotPinMode] = useState(false);

  // Pre-fill first subdivision
  useEffect(() => {
    if (subdivisions.length > 0 && !params.subdivisionId) {
      setParams((p) => ({ ...p, subdivisionId: subdivisions[0]!.id }));
    }
  }, [subdivisions]);

  function handleMapClick(lat: number, lng: number) {
    if (depotPinMode) {
      setParams((p) => ({ ...p, depotLat: lat, depotLng: lng }));
      setDepotPinMode(false);
    }
  }

  const THRESHOLD_PRESETS = [
    { label: "60%", value: 60 },
    { label: "70%", value: 70 },
    { label: "80%", value: 80 },
    { label: "90%", value: 90 },
  ];

  const VEHICLE_PRESETS = [
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
  ];

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      <style>{DASH_ANIMATION_STYLE}</style>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => { if (!isPending) onClose(); }}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Generate Optimized Route</h2>
          </div>
          <button
            onClick={() => { if (!isPending) onClose(); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Subdivision */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Subdivision</label>
            <select
              value={params.subdivisionId}
              onChange={(e) => setParams({ ...params, subdivisionId: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select a subdivision...</option>
              {subdivisions.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.code})
                </option>
              ))}
            </select>
          </div>

          {/* Depot location */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Depot Location</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm font-mono text-muted-foreground">
                {params.depotLat.toFixed(5)}, {params.depotLng.toFixed(5)}
              </div>
              <Button
                type="button"
                variant={depotPinMode ? "default" : "outline"}
                size="sm"
                className={cn(
                  "gap-1.5 text-xs",
                  depotPinMode && "bg-[#1da253] text-white hover:bg-[#1da253]/90"
                )}
                onClick={() => setDepotPinMode((v) => !v)}
              >
                <MapPin className="h-3.5 w-3.5" />
                {depotPinMode ? "Click map…" : "Pin on map"}
              </Button>
            </div>
            {depotPinMode && (
              <p className="text-xs text-[#1da253] font-medium animate-pulse">
                Click anywhere on the map to set the depot location
              </p>
            )}
          </div>

          {/* Mini map for depot pinning */}
          <div
            className={cn(
              "rounded-lg overflow-hidden border transition-all",
              depotPinMode ? "h-40 border-[#1da253] shadow-md" : "h-32 border-border"
            )}
            style={{ cursor: depotPinMode ? "crosshair" : "default" }}
          >
            <MapContainer
              center={[params.depotLat, params.depotLng]}
              zoom={13}
              scrollWheelZoom={false}
              style={{ height: "100%", width: "100%", zIndex: 0 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapEvents enabled={depotPinMode} onClickMap={handleMapClick} />
              <Marker position={[params.depotLat, params.depotLng]} icon={depotIcon}>
                <Popup>Depot</Popup>
              </Marker>
            </MapContainer>
          </div>

          {/* Fill threshold with chips */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fill Threshold</label>
            <div className="flex items-center gap-2 flex-wrap">
              {THRESHOLD_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setParams({ ...params, thresholdPercent: p.value })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold border transition-all",
                    params.thresholdPercent === p.value
                      ? "bg-[#1da253] text-white border-[#1da253]"
                      : "bg-card text-muted-foreground border-input hover:border-[#1da253]/60"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <Input
                type="number"
                min={10}
                max={100}
                value={params.thresholdPercent}
                onChange={(e) =>
                  setParams({ ...params, thresholdPercent: Number(e.target.value) })
                }
                className="w-20 h-7 text-xs"
              />
            </div>
          </div>

          {/* Vehicles with chips */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Number of Vehicles</label>
            <div className="flex items-center gap-2">
              {VEHICLE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setParams({ ...params, numVehicles: p.value })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold border transition-all",
                    params.numVehicles === p.value
                      ? "bg-[#1da253] text-white border-[#1da253]"
                      : "bg-card text-muted-foreground border-input hover:border-[#1da253]/60"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                key: "includePredicted" as const,
                icon: TrendingUp,
                label: "Predicted",
              },
              {
                key: "avoidHighways" as const,
                icon: Navigation,
                label: "No Highways",
              },
              {
                key: "avoidTolls" as const,
                icon: ChevronRight,
                label: "No Tolls",
              },
            ].map(({ key, icon: Icon, label }) => {
              const active = params[key] as boolean;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setParams({ ...params, [key]: !active })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition-all",
                    active
                      ? "bg-[#1da253]/10 border-[#1da253]/60 text-[#1da253]"
                      : "bg-card border-input text-muted-foreground hover:border-[#1da253]/40"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {isError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Failed to generate route. Check parameters and try again.
            </div>
          )}
          {isSuccess && result && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle className="mr-1.5 inline-block h-4 w-4" />
              Route generated!
              {result.optimizationScore != null && (
                <span className="ml-1 font-semibold">Score: {result.optimizationScore}%</span>
              )}
              {result.estimatedDistanceKm != null && (
                <span className="ml-2">{result.estimatedDistanceKm.toFixed(1)} km</span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border p-5">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            {isSuccess ? "Close" : "Cancel"}
          </Button>
          {!isSuccess && (
            <Button
              className="bg-[#1da253] text-white hover:bg-[#1da253]/90"
              onClick={() => onSubmit(params)}
              disabled={isPending || !params.subdivisionId}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Optimizing…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function RoutesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<RouteStatus | "all">("all");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateResult, setGenerateResult] = useState<CollectionRoute | null>(null);
  const [focusedStop, setFocusedStop] = useState<{ lat: number; lng: number } | null>(null);
  const [routeBounds, setRouteBounds] = useState<[number, number][] | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  // ---- Queries ----

  const { data: routesResponse, isLoading, isError } = useQuery({
    queryKey: ["routes"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<CollectionRoute>>("/routes");
      return res.data;
    },
  });

  const routes: CollectionRoute[] = routesResponse?.data ?? [];

  const { data: stopsResponse, isLoading: stopsLoading } = useQuery({
    queryKey: ["route-stops", selectedRouteId],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<RouteStop>>(
        `/routes/${selectedRouteId}/stops`
      );
      return res.data;
    },
    enabled: !!selectedRouteId,
  });

  const { data: driversResponse } = useQuery({
    queryKey: ["maintenance-staff"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<User>>("/users", {
        params: { role: "maintenance" },
      });
      return res.data;
    },
  });

  const driverMap = new Map(
    (driversResponse?.data ?? []).map((d) => [d.id, d.fullName])
  );

  const { data: subdivisionsResponse } = useQuery({
    queryKey: ["subdivisions"],
    queryFn: async () => {
      const res = await api.get("/subdivisions");
      const payload = res.data;
      if (Array.isArray(payload)) return payload as Subdivision[];
      if (payload?.data && Array.isArray(payload.data))
        return payload.data as Subdivision[];
      return [] as Subdivision[];
    },
  });

  const subdivisions = subdivisionsResponse ?? [];

  // ---- Mutations ----

  const generateRouteMutation = useMutation({
    mutationFn: async (params: RouteOptimizationRequest) => {
      const res = await api.post("/routes/generate", params);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      setGenerateResult(data?.data ?? data);
    },
  });

  // ---- Filtering ----

  const filtered = routes.filter((r) =>
    statusFilter === "all" ? true : r.status === statusFilter
  );

  // ---- Effects ----

  useEffect(() => {
    if (selectedRouteId && stopsResponse?.data) {
      const coords = stopsResponse.data
        .filter((s) => s.latitude && s.longitude)
        .map((s) => [s.latitude!, s.longitude!] as [number, number]);
      if (coords.length > 0) setRouteBounds(coords);
    }
  }, [selectedRouteId, stopsResponse]);

  // ---- Helpers ----

  function truncateId(id: string): string {
    return id.length <= 12 ? id : id.slice(0, 8) + "…";
  }

  function driverName(driverId: string | null): string {
    if (!driverId) return "Unassigned";
    return driverMap.get(driverId) ?? driverId.slice(0, 10);
  }

  function getActiveStops(): RouteStop[] {
    if (!selectedRouteId || !stopsResponse?.data) return [];
    return [...stopsResponse.data].sort(
      (a, b) => a.sequenceOrder - b.sequenceOrder
    );
  }

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null;
  const activeStops = getActiveStops();

  // Parse stored GeoJSON for road-following polyline
  const routeGeoJson = (() => {
    if (!selectedRoute?.routeGeojson) return null;
    try {
      return JSON.parse(selectedRoute.routeGeojson) as object;
    } catch {
      return null;
    }
  })();

  const defaultCenter: [number, number] = [14.5995, 120.9842];

  return (
    <div className="flex flex-col h-full">
      <style>{DASH_ANIMATION_STYLE}</style>

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 md:px-6 pt-4 md:pt-5 pb-3 md:pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Route Planning & Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            Manage collection routes and track driver dispatch status.
          </p>
        </div>
        <Button
          className="bg-[#1da253] text-white hover:bg-[#1da253]/90"
          onClick={() => {
            setShowGenerateModal(true);
            setGenerateResult(null);
            generateRouteMutation.reset();
          }}
        >
          <Play className="h-4 w-4 mr-1.5" />
          Generate Route
        </Button>
      </div>

      {/* Success / error toasts */}
      {generateRouteMutation.isSuccess && !showGenerateModal && (
        <div className="mx-4 md:mx-6 mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle className="mr-1.5 inline-block h-4 w-4" />
          New route generated successfully.
          {generateResult?.optimizationScore != null && (
            <span className="ml-2 font-semibold">
              Score: {generateResult.optimizationScore}%
            </span>
          )}
        </div>
      )}
      {generateRouteMutation.isError && !showGenerateModal && (
        <div className="mx-4 md:mx-6 mb-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to generate route. Please try again.
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 px-4 md:px-6 pb-3 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const isActive = statusFilter === tab.value;
          return (
            <Button
              key={tab.value}
              variant="outline"
              className={cn(
                "rounded-md px-4 py-2 font-medium h-9 border shrink-0",
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

      {/* Map-first layout */}
      <div className="relative isolate flex-1 min-h-0 mx-3 md:mx-6 mb-3 md:mb-6 rounded-xl overflow-hidden border shadow-sm">
        {/* Full-bleed map */}
        <MapContainer
          center={defaultCenter}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%", zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController centerStop={focusedStop} boundsCoords={routeBounds} />

          {/* Road-following animated GeoJSON polyline */}
          {routeGeoJson && (
            <GeoJSON
              key={selectedRouteId ?? "none"}
              data={routeGeoJson as GeoJSON.GeoJsonObject}
              ref={geoJsonRef}
              style={() => ({
                color: "#1da253",
                weight: 5,
                opacity: 0.9,
              })}
              onEachFeature={(_feature, layer) => {
                (layer as L.Path).getElement?.()?.classList.add("route-path");
              }}
            />
          )}

          {/* Fallback: straight-line polyline when no GeoJSON road geometry */}
          {!routeGeoJson && activeStops.length > 1 && (
            <Polyline
              positions={activeStops
                .filter((s) => s.latitude && s.longitude)
                .map((s) => [s.latitude!, s.longitude!] as [number, number])}
              pathOptions={{
                color: "#1da253",
                weight: 4,
                opacity: 0.7,
                dashArray: "8 6",
              }}
            />
          )}

          {/* Numbered stop markers */}
          {activeStops.map((stop) => {
            if (!stop.latitude || !stop.longitude) return null;
            return (
              <Marker
                key={stop.id}
                position={[stop.latitude, stop.longitude]}
                icon={makeStopIcon(stop.sequenceOrder)}
                eventHandlers={{
                  click: () =>
                    setFocusedStop({ lat: stop.latitude!, lng: stop.longitude! }),
                }}
              >
                <Popup>
                  <div className="font-semibold text-sm">Stop {stop.sequenceOrder}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {stop.deviceCode ?? stop.deviceId}
                  </div>
                  <span
                    className={cn(
                      "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                      stop.status === "serviced"
                        ? "bg-green-100 text-green-700"
                        : stop.status === "arrived"
                        ? "bg-blue-100 text-blue-700"
                        : stop.status === "skipped"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {stop.status}
                  </span>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating route list panel — left on desktop, bottom sheet on mobile */}
        <div className="absolute bottom-0 left-0 right-0 z-[400] max-h-[40%] rounded-t-xl md:bottom-auto md:top-3 md:left-3 md:right-auto md:w-64 md:max-h-[calc(100%-24px)] md:rounded-xl flex flex-col bg-card/95 shadow-xl backdrop-blur-sm border border-border overflow-hidden">
          {/* Mobile drag handle */}
          <div className="flex justify-center pt-2 pb-0 md:hidden">
            <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Routes ({filtered.length})
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {isError && !isLoading && (
              <p className="p-4 text-xs text-destructive">Failed to load routes.</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MapPin className="mb-2 h-7 w-7" />
                <p className="text-xs">No routes found.</p>
              </div>
            )}
            {!isLoading &&
              filtered.map((route) => {
                const isSelected = selectedRouteId === route.id;
                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => {
                      setSelectedRouteId(isSelected ? null : route.id);
                      setFocusedStop(null);
                      if (isSelected) setRouteBounds(null);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/60",
                      isSelected && "bg-[#1da253]/10 border-l-2 border-l-[#1da253]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {truncateId(route.id)}
                      </span>
                      <Badge
                        className={cn("text-[10px]", badgeClasses[route.status])}
                        variant="outline"
                      >
                        {statusLabel[route.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{driverName(route.assignedDriverId)}</span>
                      {route.optimizationScore != null && (
                        <>
                          <span>·</span>
                          <span
                            className={cn(
                              "font-semibold",
                              route.optimizationScore >= 85
                                ? "text-green-600"
                                : route.optimizationScore >= 70
                                ? "text-yellow-600"
                                : "text-red-600"
                            )}
                          >
                            {route.optimizationScore}%
                          </span>
                        </>
                      )}
                    </div>
                    {route.scheduledDate && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {formatDateTime(route.scheduledDate)}
                      </p>
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        {/* Floating stop info panel — right on desktop, bottom sheet overlay on mobile */}
        {selectedRouteId && (
          <div className="absolute bottom-0 left-0 right-0 z-[401] max-h-[50%] rounded-t-xl md:bottom-auto md:top-3 md:right-3 md:left-auto md:w-60 md:max-h-[calc(100%-24px)] md:rounded-xl flex flex-col bg-card/95 shadow-xl backdrop-blur-sm border border-border overflow-hidden">
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2 pb-0 md:hidden">
              <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Stops
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedRouteId(null);
                  setRouteBounds(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {stopsLoading && (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!stopsLoading && activeStops.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No stops assigned.
                </p>
              )}
              {activeStops.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  onClick={() => {
                    if (stop.latitude && stop.longitude) {
                      setFocusedStop({ lat: stop.latitude, lng: stop.longitude });
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all hover:border-[#1da253]/50 hover:bg-[#1da253]/5",
                    focusedStop?.lat === stop.latitude &&
                      focusedStop?.lng === stop.longitude
                      ? "border-[#1da253]/60 bg-[#1da253]/10"
                      : "border-border bg-card"
                  )}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1da253]/15 text-[10px] font-bold text-[#1da253]">
                    {stop.sequenceOrder}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {stop.deviceCode ?? stop.deviceId}
                    </p>
                    <p
                      className={cn(
                        "text-[10px] font-semibold mt-0.5",
                        stop.status === "serviced"
                          ? "text-green-600"
                          : stop.status === "arrived"
                          ? "text-blue-600"
                          : stop.status === "skipped"
                          ? "text-yellow-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {stop.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state overlay */}
        {!selectedRouteId && !isLoading && (
          <div className="absolute bottom-[42%] md:bottom-4 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
            <div className="rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-lg px-4 py-2 text-xs text-muted-foreground">
              Select a route from the panel to view its path
            </div>
          </div>
        )}
      </div>

      {/* Generate Route Modal */}
      {showGenerateModal && (
        <GenerateRouteModal
          subdivisions={subdivisions}
          onClose={() => {
            if (!generateRouteMutation.isPending) setShowGenerateModal(false);
          }}
          onSubmit={(params) => generateRouteMutation.mutate(params)}
          isPending={generateRouteMutation.isPending}
          isSuccess={generateRouteMutation.isSuccess}
          isError={generateRouteMutation.isError}
          result={generateResult}
        />
      )}
    </div>
  );
}
