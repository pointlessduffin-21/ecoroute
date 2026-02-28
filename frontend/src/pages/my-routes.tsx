import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { CollectionRoute, PaginatedResponse } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import {
  MapPin,
  Clock,
  Truck,
  Play,
  CheckCircle,
  RefreshCw,
  Calendar,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type RouteStatus = CollectionRoute["status"];

type TabValue = "in_progress" | "planned" | "completed";

const TABS: { label: string; value: TabValue; icon: React.ElementType }[] = [
  { label: "Active", value: "in_progress", icon: Play },
  { label: "Upcoming", value: "planned", icon: Calendar },
  { label: "Completed", value: "completed", icon: CheckCircle },
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MyRoutesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabValue>("in_progress");

  // Fetch all routes assigned to this driver
  const {
    data: routesData,
    isLoading,
    isError,
  } = useQuery<CollectionRoute[]>({
    queryKey: ["my-routes", user?.id],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<CollectionRoute>>("/routes", {
        params: { driverId: user?.id },
      });
      const payload = res.data;
      if (Array.isArray(payload)) return payload;
      if (payload?.data && Array.isArray(payload.data)) return payload.data;
      return [];
    },
    enabled: !!user?.id,
  });

  const routes = routesData ?? [];

  // Filter by active tab
  const filteredRoutes = routes.filter((r) => r.status === activeTab);

  // Sort: active by startedAt desc, upcoming by scheduledDate asc, completed by completedAt desc
  const sortedRoutes = [...filteredRoutes].sort((a, b) => {
    if (activeTab === "in_progress") {
      return (
        new Date(b.startedAt || b.updatedAt).getTime() -
        new Date(a.startedAt || a.updatedAt).getTime()
      );
    }
    if (activeTab === "planned") {
      return (
        new Date(a.scheduledDate || a.createdAt).getTime() -
        new Date(b.scheduledDate || b.createdAt).getTime()
      );
    }
    // completed
    return (
      new Date(b.completedAt || b.updatedAt).getTime() -
      new Date(a.completedAt || a.updatedAt).getTime()
    );
  });

  // Count per tab
  const counts: Record<TabValue, number> = {
    in_progress: routes.filter((r) => r.status === "in_progress").length,
    planned: routes.filter((r) => r.status === "planned").length,
    completed: routes.filter((r) => r.status === "completed").length,
  };

  function handleRouteClick(routeId: string) {
    navigate(`/routes/${routeId}/execute`);
  }

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          My Routes
        </h1>
        <p className="text-sm text-muted-foreground">
          View and manage your assigned collection routes.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.value];
          return (
            <Button
              key={tab.value}
              variant={activeTab === tab.value ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.value)}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "ml-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                    activeTab === tab.value
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading your routes...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load your routes. Please try refreshing the page.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && sortedRoutes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Truck className="mb-3 h-12 w-12" />
          <p className="text-base font-medium">No {TABS.find((t) => t.value === activeTab)?.label.toLowerCase()} routes</p>
          <p className="mt-1 text-sm">
            {activeTab === "in_progress"
              ? "You don't have any active routes right now."
              : activeTab === "planned"
                ? "No upcoming routes have been assigned to you."
                : "No completed routes to show yet."}
          </p>
        </div>
      )}

      {/* Route cards */}
      {!isLoading && !isError && sortedRoutes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedRoutes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              onClick={() => handleRouteClick(route.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RouteCard sub-component
// ---------------------------------------------------------------------------

function RouteCard({
  route,
  onClick,
}: {
  route: CollectionRoute;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group"
      onClick={onClick}
    >
      <CardContent className="p-5">
        {/* Top row: status + date */}
        <div className="flex items-center justify-between mb-3">
          <Badge variant={statusBadgeVariant[route.status]}>
            {statusLabel[route.status]}
          </Badge>
          {route.optimizationScore != null && (
            <span
              className={cn(
                "text-xs font-semibold",
                route.optimizationScore >= 85
                  ? "text-green-600"
                  : route.optimizationScore >= 70
                    ? "text-yellow-600"
                    : "text-red-600"
              )}
            >
              Score: {route.optimizationScore}%
            </span>
          )}
        </div>

        {/* Route ID */}
        <p className="text-xs font-mono text-muted-foreground mb-3 truncate">
          {route.id}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground truncate">
              {route.scheduledDate ? formatDate(route.scheduledDate) : "No date"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground">
              {route.estimatedDistanceKm != null
                ? `${route.estimatedDistanceKm.toFixed(1)} km`
                : "--"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground">
              {route.estimatedDurationMinutes != null
                ? `${route.estimatedDurationMinutes} min`
                : "--"}
            </span>
          </div>
        </div>

        {/* Time info */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {route.status === "in_progress" && route.startedAt && (
              <span>Started {formatDate(route.startedAt)}</span>
            )}
            {route.status === "completed" && route.completedAt && (
              <span>Completed {formatDate(route.completedAt)}</span>
            )}
            {route.status === "planned" && route.scheduledDate && (
              <span>Scheduled {formatDate(route.scheduledDate)}</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            {route.status === "in_progress"
              ? "Continue"
              : route.status === "planned"
                ? "View Route"
                : "View Details"}
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
