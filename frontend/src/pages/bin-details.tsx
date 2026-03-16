import { useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import api from "@/lib/api";
import type { SmartBin, BinTelemetry } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDateTime } from "@/lib/utils";
import {
  ArrowLeft,
  Battery,
  Wifi,
  MapPin,
  Activity,
  Trash2,
  RefreshCw,
  Gauge,
  Radio,
  Cpu,
  Pencil,
  X,
  Camera,
  Upload,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const statusBadgeVariant: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
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

function EditMapClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onSelect(e.latlng.lat, e.latlng.lng); } });
  return null;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace("/api/v1", "") || "http://localhost:3000";

export function BinDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    deviceCode: "",
    capacityLiters: "",
    thresholdPercent: "",
    status: "active" as string,
    latitude: "",
    longitude: "",
  });

  const { data: binData, isLoading: binLoading } = useQuery({
    queryKey: ["bin", id],
    queryFn: async () => {
      const res = await api.get(`/bins/${id}`);
      return res.data.data as SmartBin & { latestTelemetry: BinTelemetry | null; photoUrl?: string | null };
    },
    enabled: !!id,
  });

  const { data: telemetryData, isLoading: telemetryLoading } = useQuery({
    queryKey: ["bin-telemetry", id],
    queryFn: async () => {
      const res = await api.get(`/bins/${id}/telemetry?limit=50`);
      return res.data.data as BinTelemetry[];
    },
    enabled: !!id,
    refetchInterval: 30000,
  });

  const updateBinMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await api.put(`/bins/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bin", id] });
      setEditOpen(false);
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("photo", file);
      const res = await api.post(`/bins/${id}/photo`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bin", id] });
    },
  });

  function openEdit() {
    if (!binData) return;
    setEditForm({
      deviceCode: binData.deviceCode,
      capacityLiters: String(binData.capacityLiters),
      thresholdPercent: String(binData.thresholdPercent),
      status: binData.status,
      latitude: String(binData.latitude),
      longitude: String(binData.longitude),
    });
    setEditOpen(true);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateBinMutation.mutate({
      deviceCode: editForm.deviceCode,
      capacityLiters: parseFloat(editForm.capacityLiters),
      thresholdPercent: parseFloat(editForm.thresholdPercent),
      status: editForm.status,
      latitude: parseFloat(editForm.latitude),
      longitude: parseFloat(editForm.longitude),
    });
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadPhotoMutation.mutate(file);
  }

  if (binLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!binData) {
    return (
      <div className="space-y-4">
        <Link to="/bins" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Bins
        </Link>
        <p className="text-muted-foreground">Bin not found.</p>
      </div>
    );
  }

  const bin = binData;
  const latest = bin.latestTelemetry;
  const fill = latest?.fillLevelPercent ?? 0;

  const chartData = (telemetryData ?? [])
    .slice()
    .reverse()
    .map((t) => ({
      time: new Date(t.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      fill: t.fillLevelPercent,
    }));

  const tooltipStyle = {
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    fontSize: 12,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link to="/bins" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="h-4 w-4" /> Back to Bins
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Bin photo */}
            <div
              className="relative h-14 w-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              {bin.photoUrl ? (
                <img
                  src={`${API_BASE}${bin.photoUrl}`}
                  alt={bin.deviceCode}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Camera className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Upload className="h-4 w-4 text-white" />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{bin.deviceCode}</h1>
              <p className="text-sm text-muted-foreground">
                {bin.latitude.toFixed(4)}, {bin.longitude.toFixed(4)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Badge variant={statusBadgeVariant[bin.status] ?? "secondary"} className="text-sm">
              {bin.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Fill Level</CardDescription>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fill.toFixed(1)}%</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full transition-all", fillBarColor(fill))}
                style={{ width: `${fill}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Battery</CardDescription>
            <Battery className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latest?.batteryVoltage != null ? `${latest.batteryVoltage.toFixed(2)}V` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {latest?.batteryVoltage != null && latest.batteryVoltage >= 3.6 ? "Healthy" : latest?.batteryVoltage != null ? "Low" : "Unknown"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Signal</CardDescription>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latest?.signalStrength != null ? `${latest.signalStrength} dBm` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {latest?.signalStrength != null && latest.signalStrength >= -70 ? "Good" : latest?.signalStrength != null && latest.signalStrength >= -85 ? "Fair" : latest?.signalStrength != null ? "Weak" : "Unknown"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Distance</CardDescription>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latest?.distanceCm != null ? `${latest.distanceCm.toFixed(1)} cm` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Capacity: {bin.capacityLiters}L</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts + Map */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Fill Level History</CardTitle>
            <CardDescription>Last {chartData.length} readings</CardDescription>
          </CardHeader>
          <CardContent>
            {telemetryLoading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No telemetry data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, "Fill Level"]} />
                  <Line type="monotone" dataKey="fill" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52 rounded-md overflow-hidden border border-border">
              <MapContainer
                center={[bin.latitude, bin.longitude]}
                zoom={16}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                />
                <Marker position={[bin.latitude, bin.longitude]}>
                  <Popup>{bin.deviceCode}</Popup>
                </Marker>
              </MapContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Device Info + Telemetry Table */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Device Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Firmware:</span>
              <span>{bin.firmwareVersion ?? "Unknown"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">MQTT Topic:</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">ecoroute/trash_can/{bin.deviceCode}</code>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Coords:</span>
              <span>{bin.latitude.toFixed(6)}, {bin.longitude.toFixed(6)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Capacity:</span>
              <span>{bin.capacityLiters}L (threshold: {bin.thresholdPercent}%)</span>
            </div>
            {bin.lastSeenAt && (
              <p className="text-xs text-muted-foreground pt-1">
                Last seen: {formatDateTime(bin.lastSeenAt)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Telemetry</CardTitle>
            <CardDescription>Raw readings from the device</CardDescription>
          </CardHeader>
          <CardContent>
            {(telemetryData ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No telemetry data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 text-left font-medium">Time</th>
                      <th className="py-2 text-right font-medium">Fill</th>
                      <th className="py-2 text-right font-medium">Distance</th>
                      <th className="py-2 text-right font-medium">Battery</th>
                      <th className="py-2 text-right font-medium">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(telemetryData ?? []).slice(0, 15).map((t) => (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="py-1.5">{formatDateTime(t.recordedAt)}</td>
                        <td className="py-1.5 text-right font-medium">{t.fillLevelPercent}%</td>
                        <td className="py-1.5 text-right">{t.distanceCm?.toFixed(1) ?? "—"} cm</td>
                        <td className="py-1.5 text-right">{t.batteryVoltage?.toFixed(2) ?? "—"} V</td>
                        <td className="py-1.5 text-right">{t.signalStrength ?? "—"} dBm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditOpen(false)} />
          <Card className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit Bin</CardTitle>
                <button onClick={() => setEditOpen(false)} className="rounded-md p-1 hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Device Code</label>
                  <Input
                    value={editForm.deviceCode}
                    onChange={(e) => setEditForm({ ...editForm, deviceCode: e.target.value })}
                    required
                  />
                </div>

                {/* MQTT Configuration (display-only) */}
                <div className="rounded-md border border-border p-4 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">MQTT Configuration</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs text-muted-foreground">Broker Address</label>
                      <Input
                        value="109.123.238.215"
                        disabled
                        className="opacity-60 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Port</label>
                      <Input
                        value="1883"
                        disabled
                        className="opacity-60 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Topic</label>
                    <Input
                      value={`ecoroute/trash_can/${editForm.deviceCode}`}
                      disabled
                      className="opacity-60 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Capacity (L)</label>
                    <Input
                      type="number"
                      value={editForm.capacityLiters}
                      onChange={(e) => setEditForm({ ...editForm, capacityLiters: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Threshold (%)</label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={editForm.thresholdPercent}
                      onChange={(e) => setEditForm({ ...editForm, thresholdPercent: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>

                {/* Location — Map Picker */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Location
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(click map to move)</span>
                  </label>
                  <div className="h-44 rounded-md overflow-hidden border border-border">
                    <MapContainer
                      center={[parseFloat(editForm.latitude) || 14.5, parseFloat(editForm.longitude) || 121.0]}
                      zoom={15}
                      style={{ height: "100%", width: "100%" }}
                      scrollWheelZoom={true}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                      />
                      <EditMapClickHandler onSelect={(lat, lng) => {
                        setEditForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
                      }} />
                      {editForm.latitude && editForm.longitude && (
                        <Marker position={[parseFloat(editForm.latitude), parseFloat(editForm.longitude)]} />
                      )}
                    </MapContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Latitude</label>
                      <Input
                        type="number"
                        step="any"
                        value={editForm.latitude}
                        onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Longitude</label>
                      <Input
                        type="number"
                        step="any"
                        value={editForm.longitude}
                        onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateBinMutation.isPending}>
                    {updateBinMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
