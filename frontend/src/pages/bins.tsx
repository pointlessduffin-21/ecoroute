import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { useAuth } from "@/hooks/use-auth";
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
  X,
  Zap,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

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

function signalLabel(rssi: number | null): { text: string; color: string } {
  if (rssi === null) return { text: "N/A", color: "text-muted-foreground" };
  if (rssi >= -70) return { text: "Good", color: "text-green-600" };
  if (rssi >= -85) return { text: "Fair", color: "text-yellow-600" };
  return { text: "Weak", color: "text-red-600" };
}

// ---------------------------------------------------------------------------
// Map click handler component
// ---------------------------------------------------------------------------

function MapClickHandler({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BinsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BinStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [formDeviceCode, setFormDeviceCode] = useState("");
  const [formLatitude, setFormLatitude] = useState("");
  const [formLongitude, setFormLongitude] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formMqttBroker, setFormMqttBroker] = useState("109.123.238.215");
  const [formMqttPort, setFormMqttPort] = useState("1883");
  const [formMqttTopic, setFormMqttTopic] = useState("ecoroute/trash_can/");

  // MQTT test state
  const [mqttTestResult, setMqttTestResult] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data?: unknown;
    message?: string;
  }>({ status: "idle" });

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
      subdivisionId: string;
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
    setFormMqttBroker("109.123.238.215");
    setFormMqttPort("1883");
    setFormMqttTopic("ecoroute/trash_can/");
    setMqttTestResult({ status: "idle" });
  }

  function handleAddBin(e: React.FormEvent) {
    e.preventDefault();
    addBinMutation.mutate({
      deviceCode: formDeviceCode,
      latitude: parseFloat(formLatitude),
      longitude: parseFloat(formLongitude),
      capacityLiters: parseInt(formCapacity, 10),
      subdivisionId: user?.subdivisionId ?? "",
    });
  }

  // No auto-bind — device code and topic are independent

  // Map location select
  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setFormLatitude(lat.toFixed(6));
    setFormLongitude(lng.toFixed(6));
  }, []);

  // MQTT test
  async function handleMqttTest() {
    setMqttTestResult({ status: "loading" });
    // If topic ends with / or is a prefix, append + wildcard to catch sub-topics
    let testTopic = formMqttTopic;
    if (testTopic.endsWith("/")) testTopic += "+";
    try {
      const res = await api.post("/bins/mqtt-test", {
        broker: formMqttBroker,
        port: parseInt(formMqttPort, 10),
        topic: testTopic,
      });
      const data = res.data;
      if (data.success && data.message) {
        setMqttTestResult({
          status: "success",
          data: data.message,
          message: `Received from ${data.topic}`,
        });
      } else if (data.success && !data.message) {
        setMqttTestResult({
          status: "success",
          message: data.info || "Connected but no message received.",
        });
      } else {
        setMqttTestResult({
          status: "error",
          message: data.error || "Test failed",
        });
      }
    } catch {
      setMqttTestResult({
        status: "error",
        message: "Failed to connect to MQTT broker.",
      });
    }
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

  // Map center for the picker
  const mapLat = formLatitude ? parseFloat(formLatitude) : 14.5547;
  const mapLng = formLongitude ? parseFloat(formLongitude) : 121.0244;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { setModalOpen(false); resetForm(); }}
          />

          <div className="relative z-10 w-full max-w-lg mx-4 rounded-lg border border-border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add New Bin</h2>
              <button
                onClick={() => { setModalOpen(false); resetForm(); }}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddBin} className="space-y-5">
              {/* Device Code */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Device Code
                </label>
                <Input
                  placeholder="ECO-BIN-001"
                  value={formDeviceCode}
                  onChange={(e) => setFormDeviceCode(e.target.value)}
                  required
                />
              </div>

              {/* MQTT Configuration */}
              <div className="rounded-md border border-border p-4 space-y-3">
                <p className="text-sm font-medium">MQTT Configuration</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Broker Address
                    </label>
                    <Input
                      placeholder="109.123.238.215"
                      value={formMqttBroker}
                      onChange={(e) => setFormMqttBroker(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Port
                    </label>
                    <Input
                      type="number"
                      placeholder="1883"
                      value={formMqttPort}
                      onChange={(e) => setFormMqttPort(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Topic
                  </label>
                  <Input
                    placeholder="ecoroute/trash_can/ECO-BIN-001"
                    value={formMqttTopic}
                    onChange={(e) => setFormMqttTopic(e.target.value)}
                  />
                </div>

                {/* Test MQTT Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMqttTest}
                  disabled={mqttTestResult.status === "loading" || !formMqttBroker || !formMqttTopic}
                  className="w-full"
                >
                  {mqttTestResult.status === "loading" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Listening for message...
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5" />
                      Test MQTT Connection
                    </>
                  )}
                </Button>

                {/* Test result */}
                {mqttTestResult.status === "success" && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                      <CheckCircle className="h-3.5 w-3.5" />
                      {mqttTestResult.message}
                    </div>
                    {mqttTestResult.data != null && (
                      <pre className="mt-1 text-xs text-green-800 bg-green-100 rounded p-2 overflow-x-auto max-h-32">
                        {JSON.stringify(mqttTestResult.data as object, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
                {mqttTestResult.status === "error" && (
                  <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {mqttTestResult.message}
                  </div>
                )}
              </div>

              {/* Location — Map Picker */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Location
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (click the map to place the bin)
                  </span>
                </label>
                <div className="h-48 rounded-md overflow-hidden border border-border">
                  <MapContainer
                    center={[mapLat, mapLng]}
                    zoom={15}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    />
                    <MapClickHandler onLocationSelect={handleLocationSelect} />
                    {formLatitude && formLongitude && (
                      <Marker
                        position={[
                          parseFloat(formLatitude),
                          parseFloat(formLongitude),
                        ]}
                      />
                    )}
                  </MapContainer>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Latitude
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="14.5547"
                      value={formLatitude}
                      onChange={(e) => setFormLatitude(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Longitude
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="121.0244"
                      value={formLongitude}
                      onChange={(e) => setFormLongitude(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Capacity */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Capacity (liters)
                </label>
                <Input
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
                  onClick={() => { setModalOpen(false); resetForm(); }}
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
