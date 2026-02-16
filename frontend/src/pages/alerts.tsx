import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Alert, PaginatedResponse } from "@/types/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
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
  AlertTriangle,
  BatteryLow,
  Activity,
  WifiOff,
  CheckCircle,
  Bell,
  Filter,
} from "lucide-react";

const ALERT_TYPE_OPTIONS = [
  "all",
  "overflow",
  "low_battery",
  "sensor_anomaly",
  "offline",
] as const;

const SEVERITY_OPTIONS = [
  "all",
  "low",
  "medium",
  "high",
  "critical",
] as const;

type TypeFilter = (typeof ALERT_TYPE_OPTIONS)[number];
type SeverityFilter = (typeof SEVERITY_OPTIONS)[number];

const alertTypeConfig = (type: Alert["alertType"]) => {
  switch (type) {
    case "overflow":
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        label: "Overflow",
        variant: "warning" as const,
      };
    case "low_battery":
      return {
        icon: <BatteryLow className="h-4 w-4" />,
        label: "Low Battery",
        variant: "info" as const,
      };
    case "sensor_anomaly":
      return {
        icon: <Activity className="h-4 w-4" />,
        label: "Sensor Anomaly",
        variant: "secondary" as const,
      };
    case "offline":
      return {
        icon: <WifiOff className="h-4 w-4" />,
        label: "Offline",
        variant: "destructive" as const,
      };
  }
};

const severityVariant = (severity: Alert["severity"]) => {
  switch (severity) {
    case "low":
      return "outline" as const;
    case "medium":
      return "warning" as const;
    case "high":
      return "destructive" as const;
    case "critical":
      return "destructive" as const;
  }
};

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>("all");

  const { data: alertsResponse, isLoading } = useQuery<
    PaginatedResponse<Alert>
  >({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await api.get("/alerts");
      return res.data;
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await api.patch(`/alerts/${alertId}/acknowledge`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const alerts = alertsResponse?.data ?? [];

  const unacknowledgedAlerts = alerts.filter((a) => !a.isAcknowledged);
  const overflowCount = unacknowledgedAlerts.filter(
    (a) => a.alertType === "overflow"
  ).length;
  const lowBatteryCount = unacknowledgedAlerts.filter(
    (a) => a.alertType === "low_battery"
  ).length;
  const sensorAnomalyCount = unacknowledgedAlerts.filter(
    (a) => a.alertType === "sensor_anomaly"
  ).length;
  const offlineCount = unacknowledgedAlerts.filter(
    (a) => a.alertType === "offline"
  ).length;

  const filteredAlerts = alerts.filter((alert) => {
    const matchesType =
      typeFilter === "all" || alert.alertType === typeFilter;
    const matchesSeverity =
      severityFilter === "all" || alert.severity === severityFilter;
    return matchesType && matchesSeverity;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Alerts & Notifications
        </h1>
        <p className="text-muted-foreground">
          Monitor and manage system alerts across all bins.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={cn(overflowCount > 0 && "border-yellow-300")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Overflow</CardDescription>
            <AlertTriangle
              className={cn(
                "h-4 w-4",
                overflowCount > 0
                  ? "text-yellow-600"
                  : "text-muted-foreground"
              )}
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overflowCount}</div>
            <p className="text-xs text-muted-foreground">unacknowledged</p>
          </CardContent>
        </Card>
        <Card className={cn(lowBatteryCount > 0 && "border-blue-300")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Low Battery</CardDescription>
            <BatteryLow
              className={cn(
                "h-4 w-4",
                lowBatteryCount > 0
                  ? "text-blue-600"
                  : "text-muted-foreground"
              )}
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowBatteryCount}</div>
            <p className="text-xs text-muted-foreground">unacknowledged</p>
          </CardContent>
        </Card>
        <Card className={cn(sensorAnomalyCount > 0 && "border-gray-300")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Sensor Anomaly</CardDescription>
            <Activity
              className={cn(
                "h-4 w-4",
                sensorAnomalyCount > 0
                  ? "text-purple-600"
                  : "text-muted-foreground"
              )}
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sensorAnomalyCount}</div>
            <p className="text-xs text-muted-foreground">unacknowledged</p>
          </CardContent>
        </Card>
        <Card
          className={cn(offlineCount > 0 && "border-red-300")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Offline</CardDescription>
            <WifiOff
              className={cn(
                "h-4 w-4",
                offlineCount > 0 ? "text-red-600" : "text-muted-foreground"
              )}
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{offlineCount}</div>
            <p className="text-xs text-muted-foreground">unacknowledged</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Alert History</CardTitle>
              <CardDescription>
                All system alerts with their current status.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as TypeFilter)
                }
                className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ALERT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type === "all"
                      ? "All Types"
                      : type
                          .split("_")
                          .map(
                            (w) =>
                              w.charAt(0).toUpperCase() + w.slice(1)
                          )
                          .join(" ")}
                  </option>
                ))}
              </select>
              <select
                value={severityFilter}
                onChange={(e) =>
                  setSeverityFilter(e.target.value as SeverityFilter)
                }
                className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {SEVERITY_OPTIONS.map((sev) => (
                  <option key={sev} value={sev}>
                    {sev === "all"
                      ? "All Severities"
                      : sev.charAt(0).toUpperCase() + sev.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="min-w-[300px]">Message</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Bell className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          No alerts match the selected filters.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAlerts.map((alert) => {
                    const typeConf = alertTypeConfig(alert.alertType);
                    return (
                      <TableRow
                        key={alert.id}
                        className={cn(
                          !alert.isAcknowledged && "bg-muted/30"
                        )}
                      >
                        <TableCell>
                          <Badge
                            variant={typeConf.variant}
                            className="inline-flex items-center gap-1"
                          >
                            {typeConf.icon}
                            {typeConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={severityVariant(alert.severity)}
                            className={cn(
                              alert.severity === "critical" &&
                                "animate-pulse"
                            )}
                          >
                            {alert.severity.charAt(0).toUpperCase() +
                              alert.severity.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[400px]">
                          <p className="truncate text-sm">
                            {alert.message}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDateTime(alert.createdAt)}
                        </TableCell>
                        <TableCell>
                          {alert.isAcknowledged ? (
                            <Badge
                              variant="success"
                              className="inline-flex items-center gap-1"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Acknowledged
                            </Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!alert.isAcknowledged && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                acknowledgeMutation.mutate(alert.id)
                              }
                              disabled={
                                acknowledgeMutation.isPending &&
                                acknowledgeMutation.variables === alert.id
                              }
                            >
                              {acknowledgeMutation.isPending &&
                              acknowledgeMutation.variables === alert.id
                                ? "..."
                                : "Acknowledge"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
