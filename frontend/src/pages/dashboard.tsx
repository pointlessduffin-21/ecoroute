import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { DashboardStats, Alert, FillLevelDistribution } from "@/types/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Trash2,
  AlertTriangle,
  Route,
  TrendingUp,
  Battery,
  Wifi,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// KPI card definitions
// ---------------------------------------------------------------------------

interface KpiCardDef {
  label: string;
  key: keyof DashboardStats;
  icon: React.ElementType;
  color: string;
  bg: string;
  suffix?: string;
}

const kpiCards: KpiCardDef[] = [
  {
    label: "Total Bins",
    key: "totalBins",
    icon: Trash2,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    label: "Active Bins",
    key: "activeBins",
    icon: Wifi,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    label: "Overflow Alerts (24h)",
    key: "overflowAlerts24h",
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
  },
  {
    label: "Total Routes",
    key: "totalRoutes",
    icon: Route,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    label: "Completed Today",
    key: "completedRoutesToday",
    icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    label: "Avg Fill Level",
    key: "avgFillLevel",
    icon: Battery,
    color: "text-amber-600",
    bg: "bg-amber-50",
    suffix: "%",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const severityVariant: Record<Alert["severity"], "destructive" | "warning" | "info" | "secondary"> = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "info",
};

const alertTypeLabel: Record<Alert["alertType"], string> = {
  overflow: "Overflow",
  low_battery: "Low Battery",
  sensor_anomaly: "Sensor Anomaly",
  offline: "Offline",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const {
    data: stats,
    isLoading: statsLoading,
  } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await api.get("/analytics/dashboard");
      return res.data.data;
    },
    retry: false,
  });

  const {
    data: alertsData,
    isLoading: alertsLoading,
  } = useQuery<Alert[]>({
    queryKey: ["recent-alerts"],
    queryFn: async () => {
      const res = await api.get("/alerts", { params: { limit: 5 } });
      // The API returns paginated: { data: Alert[], pagination: {...} }
      if (Array.isArray(res.data)) return res.data;
      if (res.data?.data && Array.isArray(res.data.data)) return res.data.data;
      return [];
    },
    retry: false,
  });

  const {
    data: fillLevelData,
    isLoading: fillLevelLoading,
  } = useQuery<FillLevelDistribution>({
    queryKey: ["fill-levels"],
    queryFn: async () => {
      const res = await api.get("/analytics/fill-levels");
      return res.data.data;
    },
    retry: false,
  });

  // Transform fill level distribution into chart data
  const fillLevelChartData = fillLevelData
    ? [
        { range: "0-25%", count: fillLevelData.distribution.empty, fill: "#22c55e" },
        { range: "25-50%", count: fillLevelData.distribution.low, fill: "#84cc16" },
        { range: "50-75%", count: fillLevelData.distribution.medium, fill: "#f59e0b" },
        { range: "75-90%", count: fillLevelData.distribution.high, fill: "#ef4444" },
        { range: "90-100%", count: fillLevelData.distribution.critical, fill: "#dc2626" },
      ]
    : null;

  const dashboardStats = stats;
  const recentAlerts = alertsData ?? [];

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (statsLoading && alertsLoading && fillLevelLoading) {
    return (
      <div className="flex h-full items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your smart waste management system
        </p>
      </div>

      {/* ---- KPI stat cards ---- */}
      {statsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading statistics...</p>
          </div>
        </div>
      ) : dashboardStats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            const value = dashboardStats[kpi.key];
            return (
              <Card key={kpi.key}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
                      kpi.bg
                    )}
                  >
                    <Icon className={cn("h-6 w-6", kpi.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-foreground">
                      {value}
                      {kpi.suffix ?? ""}
                    </p>
                    <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No dashboard statistics available.</p>
          </CardContent>
        </Card>
      )}

      {/* ---- Charts & Alerts row ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Fill Level Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fill Level Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {fillLevelLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Loading chart data...</p>
                </div>
              </div>
            ) : fillLevelChartData ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={fillLevelChartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "0.5rem",
                        fontSize: 13,
                      }}
                      formatter={(value: number | undefined) => [`${value ?? 0} bins`, "Count"]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {fillLevelChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center py-16">
                <p className="text-sm text-muted-foreground">No fill level data available.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : recentAlerts.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="mt-0.5">
                      <AlertTriangle
                        className={cn(
                          "h-4 w-4",
                          alert.severity === "critical" || alert.severity === "high"
                            ? "text-red-500"
                            : alert.severity === "medium"
                              ? "text-yellow-500"
                              : "text-blue-500"
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={severityVariant[alert.severity]}>
                          {alertTypeLabel[alert.alertType]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-foreground leading-snug">
                        {alert.message ?? "No message provided"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {timeAgo(alert.createdAt)} &middot; {formatDateTime(alert.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No recent alerts.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
