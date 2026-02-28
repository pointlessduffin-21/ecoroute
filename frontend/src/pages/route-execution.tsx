import { useState, useMemo, useRef } from "react";
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
} from "lucide-react";

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

  // ---- Fetch route details ----
  const {
    data: route,
    isLoading: routeLoading,
    isError: routeError,
  } = useQuery<CollectionRoute>({
    queryKey: ["route", routeId],
    queryFn: async () => {
      const res = await api.get(`/routes/${routeId}`);
      const payload = res.data;
      if (payload?.data) return payload.data;
      return payload;
    },
    enabled: !!routeId,
  });

  // ---- Fetch route stops ----
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
  });

  const stops = useMemo(
    () =>
      (stopsData ?? []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    [stopsData]
  );

  // ---- Derived state ----
  const completedStops = stops.filter(
    (s) => s.status === "serviced" || s.status === "skipped"
  ).length;
  const totalStops = stops.length;
  const progressPercent =
    totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
  const allStopsDone = totalStops > 0 && completedStops === totalStops;
  const nextPendingStop = stops.find((s) => s.status === "pending");

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
        <Button variant="outline" onClick={() => navigate("/my-routes")}>
          <ArrowLeft className="h-4 w-4" />
          Back to My Routes
        </Button>
      </div>
    );
  }

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <button
        onClick={() => navigate("/my-routes")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Routes
      </button>

      {/* ---- Header section ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Route Execution</h1>
            <Badge variant={statusBadgeVariant[route.status]}>
              {statusLabel[route.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            ID: {route.id}
          </p>
        </div>

        {/* Route controls */}
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      {/* Route status mutation feedback */}
      {updateRouteStatus.isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {route.estimatedDurationMinutes != null
                  ? `${route.estimatedDurationMinutes} min`
                  : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Duration</p>
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
            {completedStops} of {totalStops} stops completed
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

      {/* ---- Skip modal ---- */}
      {showSkipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
// StopCard sub-component
// ---------------------------------------------------------------------------

interface StopCardProps {
  stop: RouteStop;
  isNext: boolean;
  isExpanded: boolean;
  isActionable: boolean;
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

  return (
    <Card
      className={cn(
        "transition-all",
        isNext && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isDone && "opacity-75"
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
              : isDone
                ? "bg-green-100 text-green-700"
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

        {/* Action buttons (visible at card level on non-mobile) */}
        {isActionable && !isDone && (
          <div className="hidden sm:flex items-center gap-2">
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
            <div className="flex flex-wrap gap-2 sm:hidden">
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

          {/* Editable sections (only for actionable stops) */}
          {isActionable && !isDone && (
            <>
              {/* Driver notes */}
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
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
