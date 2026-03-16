import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  CollectionRoute,
  RouteStop,
  PaginatedResponse,
} from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import {
  ArrowLeft,
  Play,
  CheckCircle,
  MapPin,
  Clock,
  Truck,
  Camera,
  MessageSquare,
  AlertTriangle,
  SkipForward,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  ImageIcon,
  Printer,
  FileText,
  RefreshCw,
  XCircle,
  Timer,
  Eye,
  Trash2,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

function makeReportStopIcon(seq: number, status: string) {
  const bg = status === "serviced" ? "#16a34a" : status === "skipped" ? "#d97706" : "#6b7280";
  return L.divIcon({
    className: "",
    html: `<div style="background:${bg};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${seq}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type RouteStatus = CollectionRoute["status"];
type StopStatus = RouteStop["status"];

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
  StopStatus,
  "secondary" | "info" | "success" | "warning"
> = {
  pending: "secondary",
  arrived: "info",
  serviced: "success",
  skipped: "warning",
};

const stopStatusLabel: Record<StopStatus, string> = {
  pending: "Pending",
  arrived: "Arrived",
  serviced: "Serviced",
  skipped: "Skipped",
};

const issueSeverityBadge: Record<string, "warning" | "destructive" | "info"> = {
  minor: "info",
  major: "warning",
  critical: "destructive",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse issue info embedded in stop notes (format: [ISSUE - SEVERITY] description) */
function parseIssueFromNotes(notes: string | null): {
  severity: string;
  description: string;
} | null {
  if (!notes) return null;
  const match = notes.match(/\[ISSUE\s*-\s*(\w+)\]\s*(.*)/);
  if (!match) return null;
  return { severity: match[1].toLowerCase(), description: match[2] };
}

/** Calculate duration between two date strings in a human-readable format */
function calcDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "--";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "--";
  if (ms < 60000) return "< 1 min";
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RouteExecutionPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Local UI state
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [stopNotes, setStopNotes] = useState<Record<string, string>>({});
  const [skipReasons, setSkipReasons] = useState<Record<string, string>>({});
  const [showSkipModal, setShowSkipModal] = useState<string | null>(null);
  const [issueReports, setIssueReports] = useState<
    Record<string, { severity: string; description: string }>
  >({});
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>(
    {}
  );
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ---- Fetch route details (auto-refresh when in_progress) ----
  const {
    data: route,
    isLoading: routeLoading,
    isError: routeError,
    dataUpdatedAt: routeUpdatedAt,
  } = useQuery<CollectionRoute>({
    queryKey: ["route", routeId],
    queryFn: async () => {
      const res = await api.get(`/routes/${routeId}`);
      const payload = res.data;
      if (payload?.data) return payload.data;
      return payload;
    },
    enabled: !!routeId,
    refetchInterval: (query) => {
      const routeData = query.state.data as CollectionRoute | undefined;
      return routeData?.status === "in_progress" ? 10000 : false;
    },
  });

  // ---- Fetch route stops (auto-refresh when in_progress) ----
  const {
    data: stopsData,
    isLoading: stopsLoading,
  } = useQuery<RouteStop[]>({
    queryKey: ["route-stops", routeId],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<RouteStop>>(
        `/routes/${routeId}/stops`
      );
      const payload = res.data;
      if (Array.isArray(payload)) return payload;
      if (payload?.data && Array.isArray(payload.data)) return payload.data;
      return [];
    },
    enabled: !!routeId,
    refetchInterval: () => {
      return route?.status === "in_progress" ? 10000 : false;
    },
  });

  const stops = useMemo(
    () =>
      (stopsData ?? []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    [stopsData]
  );

  // ---- Derived state ----
  const servicedStops = stops.filter((s) => s.status === "serviced").length;
  const skippedStops = stops.filter((s) => s.status === "skipped").length;
  const completedStops = servicedStops + skippedStops;
  const totalStops = stops.length;
  const progressPercent =
    totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
  const allStopsDone = totalStops > 0 && completedStops === totalStops;
  const nextPendingStop = stops.find((s) => s.status === "pending");
  const isCompleted = route?.status === "completed";
  const isInProgress = route?.status === "in_progress";

  // Issues extracted from stop notes
  const stopsWithIssues = useMemo(
    () =>
      stops
        .map((s) => ({ stop: s, issue: parseIssueFromNotes(s.notes) }))
        .filter((x) => x.issue !== null) as Array<{
        stop: RouteStop;
        issue: { severity: string; description: string };
      }>,
    [stops]
  );

  // Timeline events for completed route report
  const timelineEvents = useMemo(() => {
    if (!route) return [];
    const events: Array<{
      time: string;
      label: string;
      type: "start" | "arrive" | "service" | "skip" | "complete";
      stopSeq?: number;
    }> = [];

    if (route.startedAt) {
      events.push({
        time: route.startedAt,
        label: "Route started",
        type: "start",
      });
    }

    for (const stop of stops) {
      if (stop.arrivedAt) {
        events.push({
          time: stop.arrivedAt,
          label: `Arrived at Stop ${stop.sequenceOrder} (${stop.deviceCode || stop.deviceId.slice(0, 8)})`,
          type: "arrive",
          stopSeq: stop.sequenceOrder,
        });
      }
      if (stop.servicedAt) {
        events.push({
          time: stop.servicedAt,
          label: `Serviced Stop ${stop.sequenceOrder} (${stop.deviceCode || stop.deviceId.slice(0, 8)})`,
          type: "service",
          stopSeq: stop.sequenceOrder,
        });
      }
      if (stop.status === "skipped" && stop.arrivedAt) {
        events.push({
          time: stop.arrivedAt,
          label: `Skipped Stop ${stop.sequenceOrder} (${stop.deviceCode || stop.deviceId.slice(0, 8)})`,
          type: "skip",
          stopSeq: stop.sequenceOrder,
        });
      }
    }

    if (route.completedAt) {
      events.push({
        time: route.completedAt,
        label: "Route completed",
        type: "complete",
      });
    }

    return events.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
  }, [route, stops]);

  // ---- Mutations ----

  const updateRouteStatus = useMutation({
    mutationFn: async (status: RouteStatus) => {
      const res = await api.patch(`/routes/${routeId}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route", routeId] });
      queryClient.invalidateQueries({ queryKey: ["my-routes"] });
    },
  });

  const updateStopStatus = useMutation({
    mutationFn: async ({
      stopId,
      status,
      notes,
      photoProofUrl,
    }: {
      stopId: string;
      status: StopStatus;
      notes?: string;
      photoProofUrl?: string;
    }) => {
      const body: Record<string, unknown> = { status };
      if (notes) body.notes = notes;
      if (photoProofUrl) body.photoProofUrl = photoProofUrl;
      const res = await api.patch(`/routes/${routeId}/stops/${stopId}`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-stops", routeId] });
    },
  });

  // ---- Handlers ----

  function handleStartRoute() {
    updateRouteStatus.mutate("in_progress");
  }

  function handleCompleteRoute() {
    updateRouteStatus.mutate("completed");
  }

  function handleArriveStop(stopId: string) {
    const notes = stopNotes[stopId];
    updateStopStatus.mutate({ stopId, status: "arrived", notes: notes || undefined });
  }

  function handleServiceStop(stopId: string) {
    const notes = stopNotes[stopId];
    // If there is an issue report, include it in notes
    const issue = issueReports[stopId];
    let combinedNotes = notes || "";
    if (issue?.description) {
      combinedNotes += combinedNotes
        ? `\n[ISSUE - ${issue.severity?.toUpperCase() || "MINOR"}] ${issue.description}`
        : `[ISSUE - ${issue.severity?.toUpperCase() || "MINOR"}] ${issue.description}`;
    }

    updateStopStatus.mutate({
      stopId,
      status: "serviced",
      notes: combinedNotes || undefined,
      photoProofUrl: undefined, // Would be set after upload in real flow
    });
  }

  function handleSkipStop(stopId: string) {
    const reason = skipReasons[stopId] || "Skipped by driver";
    updateStopStatus.mutate({
      stopId,
      status: "skipped",
      notes: `[SKIPPED] ${reason}`,
    });
    setShowSkipModal(null);
  }

  function handlePhotoSelect(stopId: string, file: File) {
    setPhotoFiles((prev) => ({ ...prev, [stopId]: file }));
    const url = URL.createObjectURL(file);
    setPhotoPreviews((prev) => ({ ...prev, [stopId]: url }));
  }

  function handleRemovePhoto(stopId: string) {
    if (photoPreviews[stopId]) {
      URL.revokeObjectURL(photoPreviews[stopId]);
    }
    setPhotoFiles((prev) => {
      const next = { ...prev };
      delete next[stopId];
      return next;
    });
    setPhotoPreviews((prev) => {
      const next = { ...prev };
      delete next[stopId];
      return next;
    });
    if (fileInputRefs.current[stopId]) {
      fileInputRefs.current[stopId]!.value = "";
    }
  }

  function toggleStopExpanded(stopId: string) {
    setExpandedStopId((prev) => (prev === stopId ? null : stopId));
  }

  const handlePrintReport = useCallback(() => {
    window.print();
  }, []);

  // ---- Loading / Error states ----

  if (routeLoading || stopsLoading) {
    return (
      <div className="flex h-full items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading route details...</p>
        </div>
      </div>
    );
  }

  if (routeError || !route) {
    return (
      <div className="space-y-4 py-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load route. The route may not exist or you may not have permission to view it.
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  // ---- Render ----

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Back navigation */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* ---- Header section ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {isCompleted ? "Route Report" : "Route Monitoring"}
            </h1>
            <Badge variant={statusBadgeVariant[route.status]}>
              {statusLabel[route.status]}
            </Badge>
            {isInProgress && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Live -- auto-refreshing
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            ID: {route.id}
          </p>
          {routeUpdatedAt > 0 && isInProgress && (
            <p className="text-xs text-muted-foreground">
              Last updated: {formatDateTime(new Date(routeUpdatedAt))}
            </p>
          )}
        </div>

        {/* Route controls */}
        <div className="flex flex-wrap gap-2 print:hidden">
          {route.status === "planned" && (
            <Button
              onClick={handleStartRoute}
              disabled={updateRouteStatus.isPending}
            >
              {updateRouteStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Route
            </Button>
          )}
          {route.status === "in_progress" && allStopsDone && (
            <Button
              onClick={handleCompleteRoute}
              disabled={updateRouteStatus.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {updateRouteStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Complete Route
            </Button>
          )}
          {isCompleted && (
            <Button variant="outline" onClick={handlePrintReport}>
              <Printer className="h-4 w-4" />
              Print Report
            </Button>
          )}
        </div>
      </div>

      {/* Route status mutation feedback */}
      {updateRouteStatus.isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive print:hidden">
          Failed to update route status. Please try again.
        </div>
      )}

      {/* ---- Route info cards ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {route.scheduledDate ? formatDate(route.scheduledDate) : "Not set"}
              </p>
              <p className="text-xs text-muted-foreground">Scheduled</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50">
              <Truck className="h-5 w-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {route.estimatedDistanceKm != null
                  ? `${route.estimatedDistanceKm.toFixed(1)} km`
                  : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Distance</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <Timer className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {isCompleted
                  ? calcDuration(route.startedAt, route.completedAt)
                  : route.estimatedDurationMinutes != null
                    ? `${route.estimatedDurationMinutes} min`
                    : "--"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isCompleted ? "Actual Duration" : "Est. Duration"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50">
              <MapPin className="h-5 w-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {completedStops}/{totalStops}
              </p>
              <p className="text-xs text-muted-foreground">Stops Done</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Progress bar ---- */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Progress</span>
            <span className="text-sm font-semibold text-foreground">
              {progressPercent}%
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-3 rounded-full transition-all duration-500 ease-out",
                progressPercent === 100
                  ? "bg-green-500"
                  : progressPercent >= 50
                    ? "bg-primary"
                    : "bg-amber-500"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {servicedStops} serviced, {skippedStops} skipped of {totalStops} stops
            {allStopsDone && route.status === "in_progress" && (
              <span className="ml-2 font-medium text-green-600">
                -- All stops done! You can now complete the route.
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* ---- Stop list ---- */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Collection Stops
        </h2>

        {stops.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MapPin className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No stops assigned to this route.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {stops.map((stop) => {
              const isNext =
                nextPendingStop?.id === stop.id &&
                route.status === "in_progress";
              const isExpanded = expandedStopId === stop.id;
              const isActionable = route.status === "in_progress";

              return (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  isNext={isNext}
                  isExpanded={isExpanded}
                  isActionable={isActionable}
                  isMonitoringView={isCompleted || isInProgress}
                  notes={stopNotes[stop.id] || ""}
                  photoPreview={photoPreviews[stop.id]}
                  issueReport={issueReports[stop.id]}
                  isUpdating={updateStopStatus.isPending}
                  onToggleExpand={() => toggleStopExpanded(stop.id)}
                  onArrive={() => handleArriveStop(stop.id)}
                  onService={() => handleServiceStop(stop.id)}
                  onSkip={() => setShowSkipModal(stop.id)}
                  onNotesChange={(val) =>
                    setStopNotes((prev) => ({ ...prev, [stop.id]: val }))
                  }
                  onPhotoSelect={(file) => handlePhotoSelect(stop.id, file)}
                  onRemovePhoto={() => handleRemovePhoto(stop.id)}
                  onIssueChange={(issue) =>
                    setIssueReports((prev) => ({ ...prev, [stop.id]: issue }))
                  }
                  fileInputRef={(el) => {
                    fileInputRefs.current[stop.id] = el;
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Route Report (shown when route is completed) ---- */}
      {isCompleted && (
        <RouteReport
          route={route}
          stops={stops}
          totalStops={totalStops}
          servicedStops={servicedStops}
          skippedStops={skippedStops}
          stopsWithIssues={stopsWithIssues}
          timelineEvents={timelineEvents}
          onPrint={handlePrintReport}
        />
      )}

      {/* ---- Skip modal ---- */}
      {showSkipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSkipModal(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-base font-semibold">Skip Stop</h3>
              <button
                onClick={() => setShowSkipModal(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                Please provide a reason for skipping this stop.
              </p>
              <textarea
                value={skipReasons[showSkipModal] || ""}
                onChange={(e) =>
                  setSkipReasons((prev) => ({
                    ...prev,
                    [showSkipModal]: e.target.value,
                  }))
                }
                placeholder="Enter reason for skipping..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border p-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSkipModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleSkipStop(showSkipModal)}
                disabled={updateStopStatus.isPending}
              >
                {updateStopStatus.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SkipForward className="h-4 w-4" />
                )}
                Skip Stop
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BinPhotoInReport — fetches and shows the bin's photo + latest telemetry
// ---------------------------------------------------------------------------

function BinPhotoInReport({ deviceId, deviceCode }: { deviceId: string; deviceCode: string }) {
  const { data: binData } = useQuery({
    queryKey: ["bin-report", deviceId],
    queryFn: async () => {
      const res = await api.get(`/bins/${deviceId}`);
      return res.data.data as { photoUrl?: string; capacityLiters?: number; latestTelemetry?: { fillLevelPercent?: number; batteryVoltage?: number } };
    },
    staleTime: 60000,
  });

  if (!binData) return null;

  const hasPhoto = binData.photoUrl;
  const fill = binData.latestTelemetry?.fillLevelPercent;
  const battery = binData.latestTelemetry?.batteryVoltage;

  return (
    <div className="mb-2 flex gap-3 items-start">
      {hasPhoto && (
        <img
          src={binData.photoUrl}
          alt={`Bin ${deviceCode}`}
          className="h-16 w-16 rounded-md border border-border object-cover shrink-0"
        />
      )}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {binData.capacityLiters && <p>Capacity: {binData.capacityLiters}L</p>}
        {fill != null && <p>Current fill: {fill.toFixed(1)}%</p>}
        {battery != null && <p>Battery: {battery.toFixed(2)}V</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RouteReport sub-component — shown when route is completed
// ---------------------------------------------------------------------------

interface RouteReportProps {
  route: CollectionRoute;
  stops: RouteStop[];
  totalStops: number;
  servicedStops: number;
  skippedStops: number;
  stopsWithIssues: Array<{
    stop: RouteStop;
    issue: { severity: string; description: string };
  }>;
  timelineEvents: Array<{
    time: string;
    label: string;
    type: "start" | "arrive" | "service" | "skip" | "complete";
    stopSeq?: number;
  }>;
  onPrint: () => void;
}

function RouteReport({
  route,
  stops,
  totalStops,
  servicedStops,
  skippedStops,
  stopsWithIssues,
  timelineEvents,
  onPrint,
}: RouteReportProps) {
  const duration = calcDuration(route.startedAt, route.completedAt);

  return (
    <div className="space-y-6 border-t border-border pt-6" id="route-report">
      {/* Report header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <FileText className="h-5 w-5 text-green-700" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Route Completion Report</h2>
            <p className="text-sm text-muted-foreground">
              Completed {route.completedAt ? formatDateTime(route.completedAt) : "N/A"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={onPrint} className="print:hidden">
          <Printer className="h-4 w-4" />
          Print Report
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{totalStops}</p>
            <p className="text-xs text-green-600 font-medium">Total Stops</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{servicedStops}</p>
            <p className="text-xs text-green-600 font-medium">Serviced</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-700">{skippedStops}</p>
            <p className="text-xs text-amber-600 font-medium">Skipped</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{duration}</p>
            <p className="text-xs text-blue-600 font-medium">Duration</p>
          </CardContent>
        </Card>
      </div>

      {/* Route Map */}
      {(() => {
        const mapStops = stops.filter(s => s.latitude && s.longitude);
        if (mapStops.length === 0) return null;
        const center: [number, number] = [mapStops[0]!.latitude!, mapStops[0]!.longitude!];
        const positions = mapStops.map(s => [s.latitude!, s.longitude!] as [number, number]);
        return (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Route Map</h3>
              <div className="h-64 rounded-lg overflow-hidden border border-border">
                <MapContainer
                  center={center}
                  zoom={14}
                  scrollWheelZoom={true}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  />
                  {positions.length > 1 && (
                    <Polyline positions={positions} pathOptions={{ color: "#1da253", weight: 3, opacity: 0.7, dashArray: "8 4" }} />
                  )}
                  {mapStops.map((stop) => (
                    <Marker key={stop.id} position={[stop.latitude!, stop.longitude!]} icon={makeReportStopIcon(stop.sequenceOrder, stop.status)}>
                      <Popup>
                        <div className="text-xs space-y-0.5">
                          <p className="font-semibold">{stop.deviceCode || stop.deviceId.slice(0, 8)}</p>
                          <p className="capitalize">{stop.status}</p>
                          {stop.notes && <p className="text-gray-500">{stop.notes.slice(0, 60)}</p>}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Additional route metrics */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Route Metrics</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Distance</p>
              <p className="font-semibold">
                {route.estimatedDistanceKm != null
                  ? `${route.estimatedDistanceKm.toFixed(1)} km`
                  : "--"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Optimization Score</p>
              <p className="font-semibold">
                {route.optimizationScore != null
                  ? `${route.optimizationScore}%`
                  : "--"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p className="font-semibold">
                {route.startedAt ? formatDateTime(route.startedAt) : "--"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="font-semibold">
                {route.completedAt ? formatDateTime(route.completedAt) : "--"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline of events */}
      {timelineEvents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Event Timeline</h3>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

              <div className="space-y-3">
                {timelineEvents.map((event, idx) => {
                  const iconColor =
                    event.type === "start"
                      ? "bg-blue-500"
                      : event.type === "complete"
                        ? "bg-green-500"
                        : event.type === "service"
                          ? "bg-green-400"
                          : event.type === "skip"
                            ? "bg-amber-400"
                            : "bg-blue-300";
                  return (
                    <div key={idx} className="relative flex items-start gap-3 pl-1">
                      <div
                        className={cn(
                          "relative z-10 mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-white shadow-sm",
                          iconColor
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{event.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(event.time)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-stop details with before/after photos */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Stop Details
          </h3>
          <div className="space-y-4">
            {stops.map((stop) => {
              const issue = parseIssueFromNotes(stop.notes);
              return (
                <div
                  key={stop.id}
                  className={cn(
                    "rounded-lg border p-3",
                    stop.status === "serviced"
                      ? "border-green-200 bg-green-50/30"
                      : stop.status === "skipped"
                        ? "border-amber-200 bg-amber-50/30"
                        : "border-border"
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        stop.status === "serviced"
                          ? "bg-green-100 text-green-700"
                          : stop.status === "skipped"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-primary/10 text-primary"
                      )}
                    >
                      {stop.sequenceOrder}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {stop.deviceCode || stop.deviceId.slice(0, 8)}
                      </span>
                    </div>
                    <Badge
                      variant={stopStatusBadgeVariant[stop.status]}
                      className="text-[10px]"
                    >
                      {stopStatusLabel[stop.status]}
                    </Badge>
                  </div>

                  {/* Location + Timestamps row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                    {stop.latitude && stop.longitude && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                      </span>
                    )}
                    {stop.arrivedAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Arrived: {formatDateTime(stop.arrivedAt)}
                      </span>
                    )}
                    {stop.servicedAt && (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Serviced: {formatDateTime(stop.servicedAt)}
                      </span>
                    )}
                  </div>

                  {/* Bin photo from smart_bin record */}
                  <BinPhotoInReport deviceId={stop.deviceId} deviceCode={stop.deviceCode || stop.deviceId.slice(0, 8)} />

                  {/* Photo proof thumbnail (before/after from route execution) */}
                  {stop.photoProofUrl && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Collection Evidence
                      </p>
                      <img
                        src={stop.photoProofUrl}
                        alt={`Proof for stop ${stop.sequenceOrder}`}
                        className="h-24 w-auto rounded-md border border-border object-cover"
                      />
                    </div>
                  )}

                  {/* Notes */}
                  {stop.notes && !stop.notes.startsWith("[ISSUE") && (
                    <div className="rounded-md bg-muted/50 p-2 text-xs text-foreground">
                      <Trash2 className="h-3 w-3 inline mr-1 text-muted-foreground" />
                      {stop.notes}
                    </div>
                  )}

                  {/* Issue badge */}
                  {issue && (
                    <div className="mt-2 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <Badge
                        variant={issueSeverityBadge[issue.severity] || "warning"}
                        className="text-[10px]"
                      >
                        {issue.severity.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-foreground">
                        {issue.description}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Issue summary */}
      {stopsWithIssues.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">
                Issues Reported ({stopsWithIssues.length})
              </h3>
            </div>
            <div className="space-y-2">
              {stopsWithIssues.map(({ stop, issue }) => (
                <div
                  key={stop.id}
                  className="flex items-start gap-3 rounded-md border border-amber-100 bg-amber-50/50 p-3"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                    {stop.sequenceOrder}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {stop.deviceCode || stop.deviceId.slice(0, 8)}
                      </span>
                      <Badge
                        variant={issueSeverityBadge[issue.severity] || "warning"}
                        className="text-[10px]"
                      >
                        {issue.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {issue.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print report button at bottom */}
      <div className="flex justify-center print:hidden">
        <Button variant="outline" size="lg" onClick={onPrint}>
          <Printer className="h-4 w-4" />
          Download / Print Report
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StopCard sub-component
// ---------------------------------------------------------------------------

interface StopCardProps {
  stop: RouteStop;
  isNext: boolean;
  isExpanded: boolean;
  isActionable: boolean;
  isMonitoringView: boolean;
  notes: string;
  photoPreview?: string;
  issueReport?: { severity: string; description: string };
  isUpdating: boolean;
  onToggleExpand: () => void;
  onArrive: () => void;
  onService: () => void;
  onSkip: () => void;
  onNotesChange: (val: string) => void;
  onPhotoSelect: (file: File) => void;
  onRemovePhoto: () => void;
  onIssueChange: (issue: { severity: string; description: string }) => void;
  fileInputRef: (el: HTMLInputElement | null) => void;
}

function StopCard({
  stop,
  isNext,
  isExpanded,
  isActionable,
  isMonitoringView,
  notes,
  photoPreview,
  issueReport,
  isUpdating,
  onToggleExpand,
  onArrive,
  onService,
  onSkip,
  onNotesChange,
  onPhotoSelect,
  onRemovePhoto,
  onIssueChange,
  fileInputRef,
}: StopCardProps) {
  const isDone = stop.status === "serviced" || stop.status === "skipped";
  const parsedIssue = parseIssueFromNotes(stop.notes);

  return (
    <Card
      className={cn(
        "transition-all",
        isNext && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isDone && !isMonitoringView && "opacity-75"
      )}
    >
      {/* Stop header - always visible */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Sequence number */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            isNext
              ? "bg-primary text-primary-foreground"
              : stop.status === "serviced"
                ? "bg-green-100 text-green-700"
                : stop.status === "skipped"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-primary/10 text-primary"
          )}
        >
          {stop.sequenceOrder}
        </div>

        {/* Stop info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {stop.deviceCode || `Bin ${stop.deviceId.slice(0, 8)}`}
            </span>
            <Badge variant={stopStatusBadgeVariant[stop.status]} className="text-[10px]">
              {stopStatusLabel[stop.status]}
            </Badge>
            {isNext && (
              <Badge className="bg-primary/20 text-primary text-[10px] border-0">
                Next Stop
              </Badge>
            )}
            {/* Issue severity badge inline */}
            {parsedIssue && (
              <Badge
                variant={issueSeverityBadge[parsedIssue.severity] || "warning"}
                className="text-[10px]"
              >
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                {parsedIssue.severity.toUpperCase()}
              </Badge>
            )}
          </div>
          {/* Timestamps */}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {stop.servicedAt ? (
              <span>Serviced at {formatDateTime(stop.servicedAt)}</span>
            ) : stop.arrivedAt ? (
              <span>Arrived at {formatDateTime(stop.arrivedAt)}</span>
            ) : stop.latitude && stop.longitude ? (
              <span>
                {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}
              </span>
            ) : (
              <span className="font-mono">{stop.deviceId.slice(0, 16)}...</span>
            )}
          </div>
        </div>

        {/* Photo proof indicator (monitoring view) */}
        {isMonitoringView && stop.photoProofUrl && (
          <div className="shrink-0 print:hidden">
            <Camera className="h-4 w-4 text-green-500" />
          </div>
        )}

        {/* Action buttons (visible at card level on non-mobile) */}
        {isActionable && !isDone && (
          <div className="hidden sm:flex items-center gap-2 print:hidden">
            {stop.status === "pending" && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onArrive();
                }}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                Arrive
              </Button>
            )}
            {stop.status === "arrived" && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onService();
                }}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
                Service Done
              </Button>
            )}
            {(stop.status === "pending" || stop.status === "arrived") && (
              <Button
                size="sm"
                variant="outline"
                className="text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onSkip();
                }}
                disabled={isUpdating}
              >
                <SkipForward className="h-3 w-3" />
                Skip
              </Button>
            )}
          </div>
        )}

        {/* Expand toggle */}
        <div className="shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Mobile action buttons */}
          {isActionable && !isDone && (
            <div className="flex flex-wrap gap-2 sm:hidden print:hidden">
              {stop.status === "pending" && (
                <Button size="sm" onClick={onArrive} disabled={isUpdating}>
                  {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}
                  Arrive
                </Button>
              )}
              {stop.status === "arrived" && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={onService}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3 w-3" />
                  )}
                  Service Done
                </Button>
              )}
              {(stop.status === "pending" || stop.status === "arrived") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-amber-600 border-amber-300 hover:bg-amber-50"
                  onClick={onSkip}
                  disabled={isUpdating}
                >
                  <SkipForward className="h-3 w-3" />
                  Skip
                </Button>
              )}
            </div>
          )}

          {/* Stop details grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Device info */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Device ID
              </p>
              <p className="text-sm font-mono text-foreground break-all">
                {stop.deviceId}
              </p>
            </div>

            {stop.latitude && stop.longitude && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Location
                </p>
                <p className="text-sm text-foreground">
                  {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                </p>
              </div>
            )}

            {stop.arrivedAt && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Arrived At
                </p>
                <p className="text-sm text-foreground">
                  {formatDateTime(stop.arrivedAt)}
                </p>
              </div>
            )}

            {stop.servicedAt && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Serviced At
                </p>
                <p className="text-sm text-foreground">
                  {formatDateTime(stop.servicedAt)}
                </p>
              </div>
            )}
          </div>

          {/* Existing notes from server */}
          {stop.notes && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Saved Notes
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {stop.notes}
              </p>
            </div>
          )}

          {/* Existing photo proof */}
          {stop.photoProofUrl && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Photo Proof
              </p>
              <img
                src={stop.photoProofUrl}
                alt="Service proof"
                className="h-32 w-auto rounded-md border border-border object-cover"
              />
            </div>
          )}

          {/* Issue report display (monitoring view) */}
          {parsedIssue && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <Badge
                  variant={issueSeverityBadge[parsedIssue.severity] || "warning"}
                  className="text-[10px]"
                >
                  {parsedIssue.severity.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm text-foreground">{parsedIssue.description}</p>
            </div>
          )}

          {/* Editable sections (only for actionable stops) */}
          {isActionable && !isDone && (
            <>
              {/* Driver notes */}
              <div className="space-y-2 print:hidden">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="Add notes about this stop..."
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={2}
                />
              </div>

              {/* Photo proof upload */}
              <div className="space-y-2 print:hidden">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                  Photo Proof
                </label>
                {photoPreview ? (
                  <div className="relative inline-block">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="h-24 w-auto rounded-md border border-border object-cover"
                    />
                    <button
                      onClick={onRemovePhoto}
                      className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input p-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                    <ImageIcon className="h-4 w-4" />
                    <span>Select photo...</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPhotoSelect(file);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Issue reporting */}
              <div className="space-y-2 print:hidden">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                  Report Issue
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <select
                    value={issueReport?.severity || "minor"}
                    onChange={(e) =>
                      onIssueChange({
                        severity: e.target.value,
                        description: issueReport?.description || "",
                      })
                    }
                    className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-32"
                  >
                    <option value="minor">Minor</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                  <input
                    type="text"
                    value={issueReport?.description || ""}
                    onChange={(e) =>
                      onIssueChange({
                        severity: issueReport?.severity || "minor",
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe the issue..."
                    className="flex h-9 flex-1 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
