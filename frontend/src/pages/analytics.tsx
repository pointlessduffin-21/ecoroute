import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  CollectionHistoryEntry,
  CollectionRoute,
  DriverPerformanceEntry,
  AIInsight,
  FillPrediction,
} from "@/types/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Settings,
  Loader2,
  AlertCircle,
  BarChart3,
  TrendingUp,
  Users,
  Zap,
  Clock,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

// ---------------------------------------------------------------------------
// Shared tooltip style
// ---------------------------------------------------------------------------

const tooltipStyle = {
  backgroundColor: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.5rem",
  fontSize: 13,
};

// ---------------------------------------------------------------------------
// Helper: render stars
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  const stars: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push("full");
    else if (i === full && hasHalf) stars.push("half");
    else stars.push("empty");
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {stars.map((type, idx) => (
        <svg
          key={idx}
          viewBox="0 0 20 20"
          className={cn(
            "h-4 w-4",
            type === "full"
              ? "text-amber-400"
              : type === "half"
                ? "text-amber-400"
                : "text-gray-200"
          )}
          fill="currentColor"
        >
          {type === "half" ? (
            <>
              <defs>
                <linearGradient id={`half-${idx}`}>
                  <stop offset="50%" stopColor="currentColor" />
                  <stop offset="50%" stopColor="#e5e7eb" />
                </linearGradient>
              </defs>
              <path
                fill={`url(#half-${idx})`}
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z"
              />
            </>
          ) : (
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
          )}
        </svg>
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Custom pie chart label
// ---------------------------------------------------------------------------

function renderPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
}) {
  const RADIAN = Math.PI / 180;
  const _cx = cx ?? 0;
  const _cy = cy ?? 0;
  const _mid = midAngle ?? 0;
  const _inner = innerRadius ?? 0;
  const _outer = outerRadius ?? 0;
  const radius = _inner + (_outer - _inner) * 1.4;
  const x = _cx + radius * Math.cos(-_mid * RADIAN);
  const y = _cy + radius * Math.sin(-_mid * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="var(--color-foreground)"
      textAnchor={x > _cx ? "start" : "end"}
      dominantBaseline="central"
      className="text-xs"
    >
      {name} ({((percent ?? 0) * 100).toFixed(0)}%)
    </text>
  );
}

// ---------------------------------------------------------------------------
// Day name helper
// ---------------------------------------------------------------------------

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDayName(dateStr: string): string {
  const d = new Date(dateStr);
  return dayNames[d.getDay()] ?? dateStr;
}

// ---------------------------------------------------------------------------
// Route status colors
// ---------------------------------------------------------------------------

const routeStatusColors: Record<string, string> = {
  planned: "#3b82f6",
  in_progress: "#f59e0b",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

const routeStatusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Inline loading spinner
// ---------------------------------------------------------------------------

function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Insight type config
// ---------------------------------------------------------------------------

const INSIGHT_TYPES = [
  { type: "general", label: "General Overview", icon: Sparkles },
  { type: "hotspots", label: "Hotspots", icon: BarChart3 },
  { type: "peak_days", label: "Peak Days", icon: TrendingUp },
  { type: "staffing", label: "Staffing", icon: Users },
  { type: "efficiency", label: "Efficiency", icon: Zap },
] as const;

// ---------------------------------------------------------------------------
// Time-to-threshold color helper
// ---------------------------------------------------------------------------

function thresholdColor(minutes: number): string {
  if (minutes < 60) return "text-red-600";
  if (minutes < 240) return "text-yellow-600";
  return "text-green-600";
}

function thresholdBg(minutes: number): string {
  if (minutes < 60) return "bg-red-50 border-red-200";
  if (minutes < 240) return "bg-yellow-50 border-yellow-200";
  return "bg-green-50 border-green-200";
}

export function AnalyticsPage() {
  // ---- AI Insights state ----
  const [selectedInsightType, setSelectedInsightType] = useState<string | null>(null);
  const [insightResult, setInsightResult] = useState<AIInsight | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);

  const insightMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await api.post<AIInsight>("/ai/insights", { type });
      return res.data;
    },
    onSuccess: (data) => {
      setInsightResult(data);
      setInsightError(null);
    },
    onError: (error: unknown) => {
      setInsightResult(null);
      const errData = (error as { response?: { data?: { error?: string } } })?.response?.data;
      if (errData?.error?.toLowerCase().includes("not configured") || errData?.error?.toLowerCase().includes("disabled")) {
        setInsightError("AI is not configured. Please set up an AI provider in Settings.");
      } else {
        setInsightError(errData?.error ?? "Failed to generate AI insight. Please try again.");
      }
    },
  });

  const handleInsightClick = (type: string) => {
    setSelectedInsightType(type);
    setInsightError(null);
    insightMutation.mutate(type);
  };

  // ---- Predictions state ----
  const [predictions, setPredictions] = useState<FillPrediction[]>([]);
  const [predictionsError, setPredictionsError] = useState<string | null>(null);

  const predictionMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/ai/predict/all");
      return res.data;
    },
    onSuccess: (data) => {
      const items = Array.isArray(data) ? data : data?.predictions ?? data?.data ?? [];
      setPredictions(items);
      setPredictionsError(null);
    },
    onError: (error: unknown) => {
      setPredictions([]);
      const errData = (error as { response?: { data?: { error?: string } } })?.response?.data;
      setPredictionsError(errData?.error ?? "Failed to run predictions.");
    },
  });

  // ---- Query 1: Collection history (last 7 days) ----
  const {
    data: collectionHistory,
    isLoading: collectionsLoading,
  } = useQuery<CollectionHistoryEntry[]>({
    queryKey: ["collection-history", 7],
    queryFn: async () => {
      const res = await api.get("/analytics/collection-history", {
        params: { days: 7 },
      });
      const payload = res.data;
      if (Array.isArray(payload)) return payload;
      if (payload?.data && Array.isArray(payload.data)) return payload.data;
      return [];
    },
    retry: false,
  });

  // ---- Query 2: Routes (for efficiency pie chart) ----
  const {
    data: routes,
    isLoading: routesLoading,
  } = useQuery<CollectionRoute[]>({
    queryKey: ["routes-all"],
    queryFn: async () => {
      const res = await api.get("/routes", { params: { limit: 1000 } });
      const payload = res.data;
      if (Array.isArray(payload)) return payload;
      if (payload?.data && Array.isArray(payload.data)) return payload.data;
      return [];
    },
    retry: false,
  });

  // ---- Query 3: Driver performance ----
  const {
    data: driverPerformance,
    isLoading: driversLoading,
  } = useQuery<DriverPerformanceEntry[]>({
    queryKey: ["driver-performance", 30],
    queryFn: async () => {
      const res = await api.get("/analytics/driver-performance", {
        params: { days: 30 },
      });
      const payload = res.data;
      if (Array.isArray(payload)) return payload;
      if (payload?.data && Array.isArray(payload.data)) return payload.data;
      return [];
    },
    retry: false,
  });

  // ---- Transform: Collection history -> chart data ----
  const collectionsChartData = collectionHistory
    ? collectionHistory.map((entry) => ({
        day: toDayName(entry.collection_date),
        collections: entry.routes_completed,
      }))
    : null;

  // ---- Transform: Collection history -> bins serviced trend chart ----
  const binsServicedChartData = collectionHistory
    ? collectionHistory.map((entry) => ({
        day: toDayName(entry.collection_date),
        binsServiced: entry.bins_serviced,
        avgDistance: Number(entry.avg_distance_km?.toFixed(1) ?? 0),
      }))
    : null;

  // ---- Transform: Routes -> efficiency pie chart ----
  const routeEfficiencyData = routes && routes.length > 0
    ? Object.entries(
        routes.reduce<Record<string, number>>((acc, route) => {
          const status = route.status;
          acc[status] = (acc[status] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([status, count]) => ({
        name: routeStatusLabels[status] ?? status,
        value: count,
        color: routeStatusColors[status] ?? "#6b7280",
      }))
    : null;

  // ---- Transform: Driver performance -> sorted by completed_routes ----
  const sortedDrivers = driverPerformance
    ? [...driverPerformance].sort((a, b) => b.completed_routes - a.completed_routes)
    : null;

  // -------------------------------------------------------------------------
  // Full-page loading state
  // -------------------------------------------------------------------------

  if (collectionsLoading && routesLoading && driversLoading) {
    return (
      <div className="flex h-full items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Performance metrics and operational insights
        </p>
      </div>

      {/* ---- AI Insights Panel ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <div>
              <CardTitle className="text-base">AI Insights</CardTitle>
              <CardDescription>
                Get AI-powered analysis of your waste collection data
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Insight type buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {INSIGHT_TYPES.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.type}
                  variant={selectedInsightType === item.type ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleInsightClick(item.type)}
                  disabled={insightMutation.isPending}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {item.label}
                </Button>
              );
            })}
          </div>

          {/* Loading state */}
          {insightMutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                <p className="text-sm text-muted-foreground">Generating AI insight...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {insightError && !insightMutation.isPending && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">{insightError}</p>
                  {insightError.includes("Settings") && (
                    <a
                      href="/settings"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-destructive underline hover:no-underline"
                    >
                      <Settings className="h-3 w-3" />
                      Go to Settings
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Insight result */}
          {insightResult && !insightMutation.isPending && !insightError && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-3">
              <div className="prose prose-sm max-w-none text-foreground">
                {insightResult.insight.split("\n").map((line, i) => {
                  if (!line.trim()) return <br key={i} />;
                  // Bold headers (lines starting with ** or ##)
                  if (line.trim().startsWith("**") || line.trim().startsWith("##")) {
                    const text = line.replace(/[#*]/g, "").trim();
                    return (
                      <p key={i} className="font-semibold text-foreground mt-2 mb-1">
                        {text}
                      </p>
                    );
                  }
                  // Bullet points
                  if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
                    return (
                      <p key={i} className="ml-4 text-sm text-foreground/90">
                        {line.trim()}
                      </p>
                    );
                  }
                  return (
                    <p key={i} className="text-sm text-foreground/90">
                      {line}
                    </p>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-purple-200">
                <Badge variant="secondary" className="text-[10px]">
                  {insightResult.provider}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  Model: {insightResult.model}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  <Clock className="inline-block h-3 w-3 mr-0.5" />
                  {new Date(insightResult.generatedAt).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!insightMutation.isPending && !insightResult && !insightError && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <p className="text-sm">Select an insight type above to generate AI analysis.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Fill Level Predictions Panel ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <CardTitle className="text-base">Fill Level Predictions</CardTitle>
                <CardDescription>
                  AI-predicted fill levels and time to overflow threshold
                </CardDescription>
              </div>
            </div>
            <Button
              onClick={() => predictionMutation.mutate()}
              disabled={predictionMutation.isPending}
              size="sm"
            >
              {predictionMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Run Predictions
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading */}
          {predictionMutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <p className="text-sm text-muted-foreground">Running fill level predictions...</p>
              </div>
            </div>
          )}

          {/* Error */}
          {predictionsError && !predictionMutation.isPending && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <p className="text-sm text-destructive">{predictionsError}</p>
              </div>
            </div>
          )}

          {/* Results table */}
          {predictions.length > 0 && !predictionMutation.isPending && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Device Code</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Current Fill %</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Predicted Fill %</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Time to Threshold</th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {predictions.map((pred) => (
                    <tr key={pred.id} className="group">
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs">{pred.deviceId}</span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="font-medium">
                          {/* Current fill not in prediction model -- show dash or predicted minus delta */}
                          -
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="font-semibold">
                          {Math.round(pred.predictedFillPercent)}%
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                            thresholdBg(pred.timeToThresholdMinutes),
                            thresholdColor(pred.timeToThresholdMinutes)
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {pred.timeToThresholdMinutes < 60
                            ? `${Math.round(pred.timeToThresholdMinutes)} min`
                            : `${(pred.timeToThresholdMinutes / 60).toFixed(1)} hrs`}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <span className="text-muted-foreground">
                          {(pred.confidenceScore * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {predictions.length === 0 && !predictionMutation.isPending && !predictionsError && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <p className="text-sm">Click "Run Predictions" to generate fill level forecasts.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Row 1: Line charts ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Collection Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collection Performance</CardTitle>
            <p className="text-xs text-muted-foreground">Collections completed over the last 7 days</p>
          </CardHeader>
          <CardContent>
            {collectionsLoading ? (
              <LoadingSpinner message="Loading collection data..." />
            ) : collectionsChartData && collectionsChartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={collectionsChartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="collections"
                      stroke="#16a34a"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#16a34a" }}
                      activeDot={{ r: 6 }}
                      name="Collections"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState message="No collection data available." />
            )}
          </CardContent>
        </Card>

        {/* Bins Serviced & Distance Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bins Serviced Trend</CardTitle>
            <p className="text-xs text-muted-foreground">Bins serviced per day over the last 7 days</p>
          </CardHeader>
          <CardContent>
            {collectionsLoading ? (
              <LoadingSpinner message="Loading trend data..." />
            ) : binsServicedChartData && binsServicedChartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={binsServicedChartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number | undefined, name?: string) => {
                        if (name === "binsServiced") return [`${value ?? 0}`, "Bins Serviced"];
                        if (name === "avgDistance") return [`${value ?? 0} km`, "Avg Distance"];
                        return [`${value ?? 0}`, name ?? ""];
                      }}
                    />
                    <Bar
                      dataKey="binsServiced"
                      fill="#f59e0b"
                      radius={[6, 6, 0, 0]}
                      name="binsServiced"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState message="No trend data available." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Row 2: Pie chart + Driver table ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Route Efficiency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Route Efficiency</CardTitle>
            <p className="text-xs text-muted-foreground">Breakdown of route completion status</p>
          </CardHeader>
          <CardContent>
            {routesLoading ? (
              <LoadingSpinner message="Loading route data..." />
            ) : routeEfficiencyData && routeEfficiencyData.length > 0 ? (
              <>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={routeEfficiencyData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        label={renderPieLabel}
                        labelLine={false}
                      >
                        {routeEfficiencyData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number | undefined, name?: string) => [
                          `${value ?? 0} routes`,
                          name ?? "",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="mt-2 flex items-center justify-center gap-4">
                  {routeEfficiencyData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-xs text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState message="No route data available." />
            )}
          </CardContent>
        </Card>

        {/* Driver Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Driver Performance</CardTitle>
            <p className="text-xs text-muted-foreground">Top drivers ranked by routes completed (last 30 days)</p>
          </CardHeader>
          <CardContent>
            {driversLoading ? (
              <LoadingSpinner message="Loading driver data..." />
            ) : sortedDrivers && sortedDrivers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">Driver</th>
                      <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Routes</th>
                      <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Avg Time</th>
                      <th className="pb-3 font-medium text-muted-foreground">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedDrivers.map((driver, idx) => (
                      <tr key={driver.driver_id} className="group">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {driver.driver_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{driver.driver_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {idx === 0 ? (
                                  <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                    Top Performer
                                  </Badge>
                                ) : (
                                  `Rank #${idx + 1}`
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right font-medium text-foreground">
                          {driver.completed_routes}
                        </td>
                        <td className="py-3 pr-4 text-right text-muted-foreground">
                          {Math.round(driver.avg_duration_minutes)} min
                        </td>
                        <td className="py-3">
                          <StarRating rating={driver.avg_optimization_score / 20} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No driver performance data available." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
