import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Plus,
  Search,
  MapPin,
  RefreshCw,
  Eye,
  Play,
  CheckCircle,
  X,
  Loader2,
  Settings2,
  TrendingUp,
} from "lucide-react";

// Map related imports
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's default icon missing issue in React
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
// Helpers & constants
// ---------------------------------------------------------------------------

type RouteStatus = CollectionRoute["status"];

const STATUS_TABS: { label: string; value: RouteStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Planned", value: "planned" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
];

const statusBadgeVariant: Record<
  RouteStatus,
  "info" | "warning" | "success" | "destructive"
> = {
  planned: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

const statusLabel: Record<RouteStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const stopStatusBadgeVariant: Record<
  RouteStop["status"],
  "secondary" | "info" | "success" | "warning"
> = {
  pending: "secondary",
  arrived: "info",
  serviced: "success",
  skipped: "warning",
};

// ---------------------------------------------------------------------------
// Optimization score color
// ---------------------------------------------------------------------------

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 85) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoutesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<RouteStatus | "all">("all");
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateParams, setGenerateParams] = useState<RouteOptimizationRequest>({
    subdivisionId: "",
    numVehicles: 1,
    vehicleCapacityLiters: 1000,
    thresholdPercent: 80,
    includePredicted: false,
  });
  const [generateResult, setGenerateResult] = useState<CollectionRoute | null>(null);

  // ---- Queries ----

  const {
    data: routesResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["routes"],
    queryFn: async () => {
      const res =
        await api.get<PaginatedResponse<CollectionRoute>>("/routes");
      return res.data;
    },
  });

  const routes: CollectionRoute[] = routesResponse?.data ?? [];

  // Fetch stops for expanded route
  const { data: stopsResponse, isLoading: stopsLoading } = useQuery({
    queryKey: ["route-stops", expandedRouteId],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<RouteStop>>(
        `/routes/${expandedRouteId}/stops`
      );
      return res.data;
    },
    enabled: !!expandedRouteId,
  });

  function getStopsForRoute(routeId: string): RouteStop[] {
    if (expandedRouteId === routeId && stopsResponse) {
      return stopsResponse.data;
    }
    return [];
  }

  // Fetch maintenance staff for display names
  const { data: driversResponse } = useQuery({
    queryKey: ["maintenance-staff"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<User>>("/users", { params: { role: "maintenance" } });
      return res.data;
    },
  });

  const driverMap = new Map((driversResponse?.data ?? []).map(d => [d.id, d.fullName]));

  // Fetch subdivisions for dropdown
  const { data: subdivisionsResponse } = useQuery({
    queryKey: ["subdivisions"],
    queryFn: async () => {
      const res = await api.get("/subdivisions");
      const payload = res.data;
      if (Array.isArray(payload)) return payload as Subdivision[];
      if (payload?.data && Array.isArray(payload.data)) return payload.data as Subdivision[];
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
      setGenerateResult(data);
    },
  });

  // ---- Filtering ----

  const filtered = routes.filter((route) => {
    if (statusFilter === "all") return true;
    return route.status === statusFilter;
  });

  // ---- Helpers ----

  function truncateId(id: string): string {
    if (id.length <= 12) return id;
    return id.slice(0, 8) + "...";
  }

  function toggleExpand(routeId: string) {
    setExpandedRouteId((prev) => (prev === routeId ? null : routeId));
  }

  function driverName(driverId: string | null): string {
    if (!driverId) return "Unassigned";
    return driverMap.get(driverId) ?? driverId.slice(0, 10);
  }

  // ---- Render ----

  // ---- Map Helpers ----
  // Default to Manila
  const defaultCenter: [number, number] = [14.5995, 120.9842];
  
  // Get active route coordinates for Polyline
  const getActiveRouteCoords = (): [number, number][] => {
    if (!expandedRouteId) return [];
    const stops = getStopsForRoute(expandedRouteId);
    if (!stops || stops.length === 0) return [];
    
    // Sort stops and extract coordinates
    return stops
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .filter(s => s.latitude && s.longitude)
      .map(s => [s.latitude!, s.longitude!]);
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Route Planning & Dispatch
          </h1>
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

      {/* Generation result feedback */}
      {generateRouteMutation.isSuccess && !showGenerateModal && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle className="mr-1.5 inline-block h-4 w-4" />
          New route generated successfully.
          {generateResult?.optimizationScore != null && (
            <span className="ml-2 font-semibold">
              Optimization Score: {generateResult.optimizationScore}%
            </span>
          )}
        </div>
      )}
      {generateRouteMutation.isError && !showGenerateModal && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to generate route. Please try again.
        </div>
      )}

      {/* Generate Route Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (!generateRouteMutation.isPending) setShowGenerateModal(false);
            }}
          />
          {/* Modal content */}
          <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-6">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Generate Optimized Route</h2>
              </div>
              <button
                onClick={() => {
                  if (!generateRouteMutation.isPending) setShowGenerateModal(false);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 p-6">
              {/* Subdivision selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Subdivision</label>
                <select
                  value={generateParams.subdivisionId}
                  onChange={(e) =>
                    setGenerateParams({ ...generateParams, subdivisionId: e.target.value })
                  }
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

              <div className="grid grid-cols-2 gap-4">
                {/* Number of vehicles */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Number of Vehicles</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={generateParams.numVehicles}
                    onChange={(e) =>
                      setGenerateParams({
                        ...generateParams,
                        numVehicles: Number(e.target.value),
                      })
                    }
                  />
                </div>

                {/* Vehicle capacity */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vehicle Capacity (L)</label>
                  <Input
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={generateParams.vehicleCapacityLiters}
                    onChange={(e) =>
                      setGenerateParams({
                        ...generateParams,
                        vehicleCapacityLiters: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              {/* Fill threshold */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Fill Threshold (%) - Include bins above this level
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={10}
                    max={100}
                    value={generateParams.thresholdPercent}
                    onChange={(e) =>
                      setGenerateParams({
                        ...generateParams,
                        thresholdPercent: Number(e.target.value),
                      })
                    }
                    className="w-24"
                  />
                  <div className="flex-1">
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all",
                          (generateParams.thresholdPercent ?? 80) >= 90
                            ? "bg-red-500"
                            : (generateParams.thresholdPercent ?? 80) >= 75
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        )}
                        style={{
                          width: `${generateParams.thresholdPercent ?? 80}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Include predicted overflows */}
              <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={generateParams.includePredicted ?? false}
                  onChange={(e) =>
                    setGenerateParams({
                      ...generateParams,
                      includePredicted: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Include Predicted Overflows</p>
                  <p className="text-xs text-muted-foreground">
                    Include bins that are predicted to exceed threshold before next collection.
                  </p>
                </div>
                <TrendingUp className="ml-auto h-4 w-4 text-muted-foreground" />
              </label>

              {/* Error in modal */}
              {generateRouteMutation.isError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  Failed to generate route. Check parameters and try again.
                </div>
              )}

              {/* Success in modal */}
              {generateRouteMutation.isSuccess && generateResult && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <CheckCircle className="mr-1.5 inline-block h-4 w-4" />
                  Route generated successfully!
                  {generateResult.optimizationScore != null && (
                    <span className="ml-1 font-semibold">
                      Score: {generateResult.optimizationScore}%
                    </span>
                  )}
                  {generateResult.estimatedDistanceKm != null && (
                    <span className="ml-2">
                      Distance: {generateResult.estimatedDistanceKm.toFixed(1)} km
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border p-6">
              <Button
                variant="outline"
                onClick={() => setShowGenerateModal(false)}
                disabled={generateRouteMutation.isPending}
              >
                {generateRouteMutation.isSuccess ? "Close" : "Cancel"}
              </Button>
              {!generateRouteMutation.isSuccess && (
                <Button
                  onClick={() => generateRouteMutation.mutate(generateParams)}
                  disabled={
                    generateRouteMutation.isPending || !generateParams.subdivisionId
                  }
                >
                  {generateRouteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Generate Route
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

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
          )
        })}
      </div>

      {/* Main Content Layout */}
      <div className="grid gap-6 md:grid-cols-2 flex-1 min-h-[500px]">
        
        {/* Left Side: Routes Table */}
        <div className="flex flex-col gap-4">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {isError && !isLoading && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load routes from server.
            </div>
          )}

          {!isLoading && (
            <>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border bg-card">
                  <MapPin className="mb-3 h-10 w-10" />
                  <p className="text-sm">No routes match the current filter.</p>
                </div>
              ) : (
                <Card className="h-full overflow-hidden flex flex-col">
                  <CardContent className="p-0 flex-1 overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b">
                      <TableHead className="font-semibold text-muted-foreground h-11">Route ID</TableHead>
                      <TableHead className="font-semibold text-muted-foreground h-11">Status</TableHead>
                      <TableHead className="font-semibold text-muted-foreground h-11">Driver</TableHead>
                      <TableHead className="font-semibold text-muted-foreground h-11">Scheduled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((route) => {
                      const stops = getStopsForRoute(route.id);
                      const isExpanded = expandedRouteId === route.id;

                      return (
                        <RouteRow
                          key={route.id}
                          route={route}
                          stops={stops}
                          isExpanded={isExpanded}
                          stopsLoading={
                            isExpanded && stopsLoading
                          }
                          onToggle={() => toggleExpand(route.id)}
                          truncateId={truncateId}
                          driverName={driverName}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
      </div>

        {/* Right Side: Map View */}
        <div className="flex flex-col rounded-xl border bg-white overflow-hidden shadow-sm h-[600px] sticky top-4">
          <div className="flex items-center justify-between p-4 border-b bg-white">
            <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
              <MapPin className="h-5 w-5 text-foreground" /> Route Visualizer
            </h3>
            <span className="text-sm text-muted-foreground font-medium mr-2">
              {expandedRouteId ? `Viewing Route ${truncateId(expandedRouteId)}` : "Select a route to view its path"}
            </span>
          </div>
          
          <div className="flex-1 z-0 relative bg-muted/20">
             <MapContainer 
              center={defaultCenter} 
              zoom={12} 
              scrollWheelZoom={true} 
              style={{ height: '100%', width: '100%', zIndex: 0 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* Draw Route Polyline if coordinates exist */}
              {expandedRouteId && getActiveRouteCoords().length > 0 && (
                <Polyline 
                  positions={getActiveRouteCoords()} 
                  color="#0ea5e9"
                  weight={4}
                  opacity={0.8}
                />
              )}
              
              {/* Draw Markers for Stops */}
              {expandedRouteId && getStopsForRoute(expandedRouteId).map((stop) => {
                 // Skip if no coordinates
                 if (!stop.latitude || !stop.longitude) return null;
                 
                 return (
                   <Marker 
                    key={stop.id} 
                    position={[stop.latitude, stop.longitude]}
                   >
                     <Popup>
                       <div className="font-semibold">Stop {stop.sequenceOrder}</div>
                       <div className="text-sm text-muted-foreground">Device: {stop.deviceId}</div>
                       <Badge variant={stopStatusBadgeVariant[stop.status]} className="mt-1">
                         {stop.status}
                       </Badge>
                     </Popup>
                   </Marker>
                 );
              })}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route row sub-component
// ---------------------------------------------------------------------------

function RouteRow({
  route,
  stops,
  isExpanded,
  stopsLoading,
  onToggle,
  truncateId,
  driverName,
}: {
  route: CollectionRoute;
  stops: RouteStop[];
  isExpanded: boolean;
  stopsLoading: boolean;
  onToggle: () => void;
  truncateId: (id: string) => string;
  driverName: (id: string | null) => string;
}) {
  const badgeClasses: Record<string, string> = {
    planned: "bg-blue-100 text-blue-700 hover:bg-blue-100/80 border-transparent rounded-full font-semibold px-3 py-0.5",
    in_progress: "bg-[#fef3c7] text-[#92400e] hover:bg-[#fef3c7]/80 border-transparent rounded-full font-semibold px-3 py-0.5",
    completed: "bg-green-100 text-green-700 hover:bg-green-100/80 border-transparent rounded-full font-semibold px-3 py-0.5",
    cancelled: "bg-red-500 text-white hover:bg-red-500/80 border-transparent rounded-full font-semibold px-3 py-0.5",
  };

  return (
    <>
      <TableRow
        className={cn("cursor-pointer hover:bg-muted/50 transition-colors border-b", isExpanded && "bg-muted/30")}
        onClick={onToggle}
      >
        <TableCell className="font-mono text-xs py-4">
          {truncateId(route.id)}
        </TableCell>
        <TableCell className="py-4">
          <Badge className={badgeClasses[route.status]} variant="outline">
            {statusLabel[route.status]}
          </Badge>
        </TableCell>
        <TableCell className="text-sm py-4">
          {driverName(route.assignedDriverId)}
        </TableCell>
        <TableCell className="text-sm py-4">
          {route.scheduledDate ? (
            <div className="whitespace-pre-line leading-tight text-muted-foreground">
              {formatDateTime(route.scheduledDate).replace(", ", ",\n")}
            </div>
          ) : (
            "Not scheduled"
          )}
        </TableCell>
      </TableRow>

      {/* Expanded detail section */}
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={4} className="bg-muted/20 p-0">
            <div className="px-6 py-4">
              <h4 className="mb-3 text-sm font-semibold">
                Route Stops ({stops.length})
              </h4>

              {stopsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading stops...
                </div>
              ) : stops.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No stops assigned to this route.
                </p>
              ) : (
                <div className="space-y-2">
                  {stops
                    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                    .map((stop) => (
                      <div
                        key={stop.id}
                        className="flex items-center gap-4 rounded-md border border-border bg-card p-3 text-sm"
                      >
                        {/* Sequence circle */}
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {stop.sequenceOrder}
                        </div>

                        {/* Device ID */}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-mono text-xs">
                            {stop.deviceId}
                          </span>
                        </div>

                        {/* Stop status badge */}
                        <Badge
                          variant={stopStatusBadgeVariant[stop.status]}
                          className="shrink-0"
                        >
                          {stop.status}
                        </Badge>

                        {/* Timestamps */}
                        <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                          {stop.servicedAt
                            ? `Serviced ${formatDateTime(stop.servicedAt)}`
                            : stop.arrivedAt
                            ? `Arrived ${formatDateTime(stop.arrivedAt)}`
                            : "Pending"}
                        </div>

                        {/* Notes */}
                        {stop.notes && (
                          <span
                            className="hidden max-w-[200px] truncate text-xs italic text-muted-foreground lg:inline"
                            title={stop.notes}
                          >
                            {stop.notes}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
