import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { SmartBin, BinTelemetry, PaginatedResponse } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Plus,
  Search,
  MapPin,
  Trash2,
  Battery,
  Wifi,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers & constants
// ---------------------------------------------------------------------------

type BinStatus = SmartBin["status"];

const STATUS_OPTIONS: { label: string; value: BinStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Offline", value: "offline" },
];

const statusBadgeVariant: Record<
  BinStatus,
  "success" | "secondary" | "warning" | "destructive"
> = {
  active: "success",
  inactive: "secondary",
  maintenance: "warning",
  offline: "destructive",
};

function fillBarColor(percent: number): string {
  if (percent > 80) return "bg-red-500";
  if (percent >= 50) return "bg-yellow-500";
  return "bg-green-500";
}

// ---------------------------------------------------------------------------
// Signal-strength helper
// ---------------------------------------------------------------------------

function signalLabel(rssi: number | null): { text: string; color: string } {
  if (rssi === null) return { text: "N/A", color: "text-muted-foreground" };
  if (rssi >= -70) return { text: "Good", color: "text-green-600" };
  if (rssi >= -85) return { text: "Fair", color: "text-yellow-600" };
  return { text: "Weak", color: "text-red-600" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BinsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BinStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state for Add Bin modal
  const [formDeviceCode, setFormDeviceCode] = useState("");
  const [formLatitude, setFormLatitude] = useState("");
  const [formLongitude, setFormLongitude] = useState("");
  const [formCapacity, setFormCapacity] = useState("");

  // ---- Queries ----

  const {
    data: binsResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["bins"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<SmartBin>>("/bins");
      return res.data;
    },
  });

  const bins: SmartBin[] = binsResponse?.data ?? [];

  // Telemetry keyed by bin id -- fetch latest for each bin
  const { data: telemetryMap } = useQuery({
    queryKey: ["bins-telemetry"],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<BinTelemetry>>(
        "/telemetry?limit=200&sort=-recordedAt"
      );
      const map: Record<string, BinTelemetry> = {};
      for (const t of res.data.data) {
        if (!map[t.deviceId]) map[t.deviceId] = t;
      }
      return map;
    },
  });

  const telemetry: Record<string, BinTelemetry> = telemetryMap ?? {};

  // ---- Mutations ----

  const addBinMutation = useMutation({
    mutationFn: async (payload: {
      deviceCode: string;
      latitude: number;
      longitude: number;
      capacityLiters: number;
    }) => {
      const res = await api.post("/bins", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bins"] });
      setModalOpen(false);
      resetForm();
    },
  });

  function resetForm() {
    setFormDeviceCode("");
    setFormLatitude("");
    setFormLongitude("");
    setFormCapacity("");
  }

  function handleAddBin(e: React.FormEvent) {
    e.preventDefault();
    addBinMutation.mutate({
      deviceCode: formDeviceCode,
      latitude: parseFloat(formLatitude),
      longitude: parseFloat(formLongitude),
      capacityLiters: parseInt(formCapacity, 10),
    });
  }

  // ---- Filtering ----

  const filtered = bins.filter((bin) => {
    const matchesSearch = bin.deviceCode
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || bin.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Smart Bins</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage IoT waste bins across all subdivisions.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Bin
        </Button>
      </div>

      {/* Top bar: search + status filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search device code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Loading / Error states */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load bins.
        </div>
      )}

      {/* Grid of bin cards */}
      {!isLoading && (
        <>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Trash2 className="mb-3 h-10 w-10" />
              <p className="text-sm">No bins match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((bin) => {
                const t = telemetry[bin.id];
                const fill = t?.fillLevelPercent ?? 0;
                const signal = signalLabel(t?.signalStrength ?? null);

                return (
                  <Card key={bin.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">
                          {bin.deviceCode}
                        </CardTitle>
                        <Badge variant={statusBadgeVariant[bin.status]}>
                          {bin.status}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Fill level bar */}
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Fill Level</span>
                          <span className="font-medium text-foreground">
                            {fill}%
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              fillBarColor(fill)
                            )}
                            style={{ width: `${fill}%` }}
                          />
                        </div>
                      </div>

                      {/* Telemetry row */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Battery className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            {t?.batteryVoltage != null
                              ? `${t.batteryVoltage.toFixed(2)} V`
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Wifi
                            className={cn("h-3.5 w-3.5", signal.color)}
                          />
                          <span className={signal.color}>{signal.text}</span>
                        </div>
                        <div className="text-right text-muted-foreground">
                          {bin.capacityLiters}L
                        </div>
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {bin.latitude.toFixed(4)}, {bin.longitude.toFixed(4)}
                        </span>
                      </div>

                      {/* Last seen */}
                      {bin.lastSeenAt && (
                        <p className="text-xs text-muted-foreground">
                          Last seen {formatDateTime(bin.lastSeenAt)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* -------- Add Bin Modal -------- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setModalOpen(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">Add New Bin</h2>

            <form onSubmit={handleAddBin} className="space-y-4">
              <div>
                <label
                  htmlFor="add-device-code"
                  className="mb-1 block text-sm font-medium"
                >
                  Device Code
                </label>
                <Input
                  id="add-device-code"
                  placeholder="ECO-BIN-XXXX"
                  value={formDeviceCode}
                  onChange={(e) => setFormDeviceCode(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="add-latitude"
                    className="mb-1 block text-sm font-medium"
                  >
                    Latitude
                  </label>
                  <Input
                    id="add-latitude"
                    type="number"
                    step="any"
                    placeholder="14.5547"
                    value={formLatitude}
                    onChange={(e) => setFormLatitude(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="add-longitude"
                    className="mb-1 block text-sm font-medium"
                  >
                    Longitude
                  </label>
                  <Input
                    id="add-longitude"
                    type="number"
                    step="any"
                    placeholder="121.0244"
                    value={formLongitude}
                    onChange={(e) => setFormLongitude(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="add-capacity"
                  className="mb-1 block text-sm font-medium"
                >
                  Capacity (liters)
                </label>
                <Input
                  id="add-capacity"
                  type="number"
                  min={1}
                  placeholder="240"
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(e.target.value)}
                  required
                />
              </div>

              {addBinMutation.isError && (
                <p className="text-sm text-destructive">
                  Failed to create bin. Please try again.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setModalOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addBinMutation.isPending}>
                  {addBinMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Bin"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
