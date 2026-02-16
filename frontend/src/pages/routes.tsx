import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  CollectionRoute,
  RouteStop,
  User,
  PaginatedResponse,
} from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

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

  // Fetch drivers for display names
  const { data: driversResponse } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<User>>("/users", { params: { role: "driver" } });
      return res.data;
    },
  });

  const driverMap = new Map((driversResponse?.data ?? []).map(d => [d.id, d.fullName]));

  // ---- Mutations ----

  const generateRouteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/routes/generate");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
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

  return (
    <div className="space-y-6">
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
          onClick={() => generateRouteMutation.mutate()}
          disabled={generateRouteMutation.isPending}
        >
          {generateRouteMutation.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Generate Route
            </>
          )}
        </Button>
      </div>

      {/* Generation result feedback */}
      {generateRouteMutation.isSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle className="mr-1.5 inline-block h-4 w-4" />
          New route generated successfully.
        </div>
      )}
      {generateRouteMutation.isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to generate route. Please try again.
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Loading / Error states */}
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

      {/* Routes table */}
      {!isLoading && (
        <>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MapPin className="mb-3 h-10 w-10" />
              <p className="text-sm">No routes match the current filter.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Route ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead className="text-right">Distance</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right">Stops</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="w-10" />
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
  return (
    <>
      <TableRow
        className={cn("cursor-pointer", isExpanded && "bg-muted/30")}
        onClick={onToggle}
      >
        <TableCell className="font-mono text-xs">
          {truncateId(route.id)}
        </TableCell>
        <TableCell>
          <Badge variant={statusBadgeVariant[route.status]}>
            {statusLabel[route.status]}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">
          {driverName(route.assignedDriverId)}
        </TableCell>
        <TableCell className="text-sm">
          {route.scheduledDate
            ? formatDateTime(route.scheduledDate)
            : "Not scheduled"}
        </TableCell>
        <TableCell className="text-right text-sm">
          {route.estimatedDistanceKm != null
            ? `${route.estimatedDistanceKm.toFixed(1)} km`
            : "-"}
        </TableCell>
        <TableCell className="text-right text-sm">
          {route.estimatedDurationMinutes != null
            ? `${route.estimatedDurationMinutes} min`
            : "-"}
        </TableCell>
        <TableCell className="text-right text-sm">{stops.length}</TableCell>
        <TableCell
          className={cn(
            "text-right text-sm font-semibold",
            scoreColor(route.optimizationScore)
          )}
        >
          {route.optimizationScore != null
            ? `${route.optimizationScore}%`
            : "-"}
        </TableCell>
        <TableCell>
          <Eye
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180 text-primary"
            )}
          />
        </TableCell>
      </TableRow>

      {/* Expanded detail section */}
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="bg-muted/20 p-0">
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
