import { useState, useEffect, useMemo } from "react";
import { Plus, Search, Map as MapIcon, Mail, Phone, MapPin, Building2, X } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Map related imports
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Popup,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

function MapController({ bounds }: { bounds: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], duration: 1.2 });
    }
  }, [bounds, map]);
  return null;
}

function GeofenceDrawer({ points, onAddPoint, enabled }: { points: [number, number][]; onAddPoint: (lat: number, lng: number) => void; enabled: boolean }) {
  useMapEvents({
    click(e) {
      if (enabled) onAddPoint(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function SubdivisionsPage() {
  const [subdivisions, setSubdivisions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapBounds, setMapBounds] = useState<[number, number][] | null>(null);
  const [hoveredSubId, setHoveredSubId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSub, setEditingSub] = useState<any | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [geofencePoints, setGeofencePoints] = useState<[number, number][]>([]);
  const [drawingGeofence, setDrawingGeofence] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bins, setBins] = useState<any[]>([]);
  const [subDetail, setSubDetail] = useState<any | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignType, setAssignType] = useState<"user" | "bin">("user");
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allBinsForAssign, setAllBinsForAssign] = useState<any[]>([]);

  useEffect(() => {
    api.get("/bins?limit=100").then(res => setBins(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSubdivisions();
  }, []);

  const fetchSubdivisions = async () => {
    try {
      setIsLoading(true);
      const res = await api.get("/subdivisions");
      setSubdivisions(res.data.data);
    } catch (error) {
      console.error("Failed to fetch subdivisions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (showAssignModal && assignType === "user") {
      api.get("/users").then(res => setAllUsers(res.data.data)).catch(() => {});
    }
    if (showAssignModal && assignType === "bin") {
      api.get("/bins?limit=100").then(res => setAllBinsForAssign(res.data.data)).catch(() => {});
    }
  }, [showAssignModal, assignType]);

  const filteredSubdivisions = useMemo(
    () =>
      subdivisions.filter(
        (sub) =>
          sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sub.code.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [subdivisions, searchQuery]
  );

  useEffect(() => {
    if (filteredSubdivisions.length > 0) {
      const allCoords: [number, number][] = [];
      filteredSubdivisions.forEach((sub) => {
        const poly = getPolygonPositions(sub.geofence);
        if (poly.length > 0) allCoords.push(...poly);
      });
      if (allCoords.length > 0) setMapBounds(allCoords);
    }
  }, [filteredSubdivisions]);

  const handleSubFocus = (sub: any) => {
    const newId = selectedSubId === sub.id ? null : sub.id;
    setSelectedSubId(newId);
    if (newId) {
      api.get(`/subdivisions/${sub.id}`).then(res => setSubDetail(res.data.data)).catch(() => {});
    } else {
      setSubDetail(null);
    }
    const coords = getPolygonPositions(sub.geofence);
    if (coords.length > 0) setMapBounds(coords);
  };

  const resetView = () => {
    setSelectedSubId(null);
    setSubDetail(null);
    const allCoords: [number, number][] = [];
    filteredSubdivisions.forEach((sub) => {
      const poly = getPolygonPositions(sub.geofence);
      if (poly.length > 0) allCoords.push(...poly);
    });
    if (allCoords.length > 0) setMapBounds(allCoords);
  };

  const getPolygonPositions = (geojsonStr: string) => {
    try {
      if (!geojsonStr) return [];
      const feature = JSON.parse(geojsonStr);
      if (feature.type === "Polygon" && feature.coordinates?.[0]) {
        return feature.coordinates[0].map(
          (coord: number[]) => [coord[1], coord[0]] as [number, number]
        );
      }
      return [];
    } catch {
      return [];
    }
  };

  function openModal(sub: any | null) {
    setEditingSub(sub);
    setFormName(sub?.name ?? "");
    setFormCode(sub?.code ?? "");
    setFormAddress(sub?.address ?? "");
    setFormEmail(sub?.contactEmail ?? "");
    setFormPhone(sub?.contactPhone ?? "");
    setGeofencePoints(sub ? getPolygonPositions(sub.geofence) : []);
    setDrawingGeofence(false);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingSub(null);
    setGeofencePoints([]);
    setDrawingGeofence(false);
  }

  async function handleSave() {
    setSaving(true);
    const geojson = geofencePoints.length >= 3 ? JSON.stringify({
      type: "Polygon",
      coordinates: [[...geofencePoints.map(([lat, lng]) => [lng, lat]), [geofencePoints[0]![1], geofencePoints[0]![0]]]],
    }) : undefined;

    const payload = {
      name: formName,
      code: formCode,
      address: formAddress || undefined,
      contactEmail: formEmail || undefined,
      contactPhone: formPhone || undefined,
      geofence: geojson,
    };

    try {
      if (editingSub) {
        await api.put(`/subdivisions/${editingSub.id}`, payload);
      } else {
        await api.post("/subdivisions", payload);
      }
      fetchSubdivisions();
      closeModal();
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this subdivision?")) return;
    try {
      await api.delete(`/subdivisions/${id}`);
      fetchSubdivisions();
      setSelectedSubId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function handleAssign(itemId: string) {
    if (!selectedSubId) return;
    try {
      if (assignType === "user") {
        await api.post(`/subdivisions/${selectedSubId}/assign-user`, { userId: itemId });
      } else {
        await api.post(`/subdivisions/${selectedSubId}/assign-bin`, { binId: itemId });
      }
      // Refresh detail
      const res = await api.get(`/subdivisions/${selectedSubId}`);
      setSubDetail(res.data.data);
      setShowAssignModal(false);
      // Also refresh bins on map
      api.get("/bins?limit=100").then(res => setBins(res.data.data)).catch(() => {});
    } catch (err) {
      console.error("Assign failed:", err);
    }
  }

  const selectedSub = subdivisions.find((s) => s.id === selectedSubId) ?? null;
  const defaultCenter: [number, number] = [14.5995, 120.9842];

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subdivisions</h1>
          <p className="text-sm text-muted-foreground">
            Manage your operational zones and geofences.
          </p>
        </div>
        <Button className="bg-[#1da253] text-white hover:bg-[#1da253]/90" onClick={() => openModal(null)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Subdivision
        </Button>
      </div>

      {/* Map-first layout */}
      <div className="relative isolate rounded-xl overflow-hidden border shadow-sm" style={{ height: "calc(100vh - 220px)", minHeight: "500px" }}>
        {/* Full-bleed map */}
        <MapContainer
          center={defaultCenter}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%", zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController bounds={mapBounds} />

          {filteredSubdivisions.map((sub) => {
            const positions = getPolygonPositions(sub.geofence);
            if (positions.length === 0) return null;

            const highlight = selectedSubId === sub.id || hoveredSubId === sub.id;

            return (
              <Polygon
                key={sub.id}
                positions={positions}
                pathOptions={{
                  color: highlight ? "#1da253" : "#64748b",
                  fillColor: highlight ? "#1da253" : "#94a3b8",
                  fillOpacity: highlight ? 0.3 : 0.12,
                  weight: highlight ? 3 : 1.5,
                }}
                eventHandlers={{
                  mouseover: () => setHoveredSubId(sub.id),
                  mouseout: () => setHoveredSubId(null),
                  click: () => handleSubFocus(sub),
                }}
              >
                <Popup>
                  <div className="space-y-1">
                    <div className="font-semibold text-sm">{sub.name}</div>
                    <div className="text-xs text-gray-500">Code: {sub.code}</div>
                    {sub.address && (
                      <div className="text-xs text-gray-500">{sub.address}</div>
                    )}
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {bins.map((bin: any) => (
            <Marker key={bin.id} position={[bin.latitude, bin.longitude]}>
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">{bin.deviceCode}</p>
                  <p className="text-gray-500">{bin.capacityLiters}L — {bin.status}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Floating subdivision list panel — left on desktop, bottom sheet on mobile */}
        <div className="absolute bottom-0 left-0 right-0 z-[400] max-h-[40%] rounded-t-xl md:bottom-auto md:top-3 md:left-3 md:right-auto md:w-72 md:max-h-[calc(100%-24px)] md:rounded-xl flex flex-col bg-card/95 shadow-xl backdrop-blur-sm border border-border overflow-hidden">
          {/* Mobile drag handle */}
          <div className="flex justify-center pt-2 pb-0 md:hidden">
            <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          {/* Search header */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search subdivisions..."
                className="pl-8 h-8 text-xs border-input bg-background/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#1da253]" />
                <span className="text-xs text-muted-foreground mt-2">Loading…</span>
              </div>
            )}

            {!isLoading && filteredSubdivisions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <MapIcon className="h-7 w-7 mb-2 text-muted-foreground/40" />
                <span className="text-xs font-medium">No subdivisions found</span>
              </div>
            )}

            {!isLoading &&
              filteredSubdivisions.map((sub) => {
                const isSelected = selectedSubId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleSubFocus(sub)}
                    onMouseEnter={() => setHoveredSubId(sub.id)}
                    onMouseLeave={() => setHoveredSubId(null)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border/50 transition-all",
                      isSelected
                        ? "bg-[#1da253]/10 border-l-[3px] border-l-[#1da253]"
                        : "border-l-[3px] border-l-transparent hover:bg-muted/60"
                    )}
                  >
                    {/* Name + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1da253]/10">
                          <Building2 className="h-3.5 w-3.5 text-[#1da253]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {sub.name}
                          </p>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {sub.code}
                          </span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          sub.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        )}
                      >
                        {sub.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {/* Address */}
                    {sub.address && (
                      <p className="mt-1.5 flex items-start gap-1 text-[10px] text-muted-foreground leading-tight">
                        <MapPin className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                        {sub.address}
                      </p>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Footer */}
          {!isLoading && (
            <div className="px-3 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground font-medium">
              {filteredSubdivisions.length} subdivision{filteredSubdivisions.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Floating detail card — right on desktop, bottom sheet overlay on mobile */}
        {selectedSub && (
          <div className="absolute bottom-0 left-0 right-0 z-[401] max-h-[55%] rounded-t-xl md:bottom-auto md:top-3 md:right-3 md:left-auto md:w-64 md:max-h-none md:rounded-xl bg-card/95 shadow-xl backdrop-blur-sm border border-border overflow-hidden">
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2 pb-0 md:hidden">
              <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Details
              </p>
              <button
                type="button"
                onClick={resetView}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{selectedSub.name}</h3>
                <span className="text-[11px] font-mono text-muted-foreground">{selectedSub.code}</span>
              </div>

              {selectedSub.address && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#1da253]" />
                  <span className="leading-tight">{selectedSub.address}</span>
                </div>
              )}

              {selectedSub.contactEmail && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-[#1da253]" />
                  <span className="truncate">{selectedSub.contactEmail}</span>
                </div>
              )}

              {selectedSub.contactPhone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-[#1da253]" />
                  <span>{selectedSub.contactPhone}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                    selectedSub.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  )}
                >
                  {selectedSub.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openModal(selectedSub)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 hover:text-red-700" onClick={() => handleDelete(selectedSub.id)}>
                  Deactivate
                </Button>
              </div>

              {/* Users assigned */}
              {subDetail?.users && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Users ({subDetail.users.length})</p>
                  {subDetail.users.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No users assigned</p>
                  ) : (
                    <div className="space-y-1">
                      {subDetail.users.map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between text-xs">
                          <span className="truncate">{u.fullName}</span>
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                            u.role === "admin" ? "bg-purple-100 text-purple-700" :
                            u.role === "dispatcher" ? "bg-blue-100 text-blue-700" :
                            "bg-green-100 text-green-700"
                          )}>{u.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bins assigned */}
              {subDetail?.bins && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Bins ({subDetail.bins.length})</p>
                  {subDetail.bins.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No bins assigned</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {subDetail.bins.map((b: any) => (
                        <div key={b.id} className="flex items-center justify-between text-xs">
                          <span className="truncate">{b.deviceCode}</span>
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                            b.status === "active" ? "bg-green-100 text-green-700" :
                            b.status === "maintenance" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-700"
                          )}>{b.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Assign buttons */}
              <div className="pt-2 border-t border-border space-y-1.5">
                <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={() => { setAssignType("user"); setShowAssignModal(true); }}>
                  + Assign User
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={() => { setAssignType("bin"); setShowAssignModal(true); }}>
                  + Assign Bin
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state hint */}
        {!selectedSubId && !isLoading && (
          <div className="absolute bottom-[42%] md:bottom-4 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
            <div className="rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-lg px-4 py-2 text-xs text-muted-foreground">
              Click a subdivision to view its geofence
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-500 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!saving) closeModal(); }} />
          <div className="relative z-10 w-full max-w-3xl mx-4 rounded-xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold">{editingSub ? "Edit Subdivision" : "Add Subdivision"}</h2>
              <button onClick={closeModal} className="p-1.5 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Greenfield Estate" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Code</label>
                  <Input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="GFE" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Address</label>
                <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Barangay, City, Province" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Email</label>
                  <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="admin@subdivision.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Phone</label>
                  <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+63 912 345 6789" />
                </div>
              </div>

              {/* Geofence Map */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Geofence Boundary</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={drawingGeofence ? "default" : "outline"}
                      className={cn("text-xs h-7", drawingGeofence && "bg-[#1da253] hover:bg-[#1da253]/90")}
                      onClick={() => setDrawingGeofence(!drawingGeofence)}
                    >
                      {drawingGeofence ? "Drawing... (click map)" : "Draw Geofence"}
                    </Button>
                    {geofencePoints.length > 0 && (
                      <Button type="button" size="sm" variant="outline" className="text-xs h-7" onClick={() => setGeofencePoints([])}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <div className="h-64 rounded-lg overflow-hidden border border-border">
                  <MapContainer
                    center={geofencePoints.length > 0 ? geofencePoints[0]! : [10.3157, 123.8854]}
                    zoom={14}
                    scrollWheelZoom={true}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
                    <GeofenceDrawer points={geofencePoints} onAddPoint={(lat, lng) => setGeofencePoints(prev => [...prev, [lat, lng]])} enabled={drawingGeofence} />
                    {geofencePoints.length >= 3 && (
                      <Polygon positions={geofencePoints} pathOptions={{ color: "#1da253", fillColor: "#1da253", fillOpacity: 0.2, weight: 2 }} />
                    )}
                    {geofencePoints.length > 0 && geofencePoints.length < 3 && (
                      <Polyline positions={geofencePoints} pathOptions={{ color: "#1da253", weight: 2, dashArray: "5 5" }} />
                    )}
                    {geofencePoints.map((p, i) => (
                      <Marker key={i} position={p} />
                    ))}
                  </MapContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {geofencePoints.length === 0 ? "Click \"Draw Geofence\" then click on the map to place boundary points (min 3)." :
                   geofencePoints.length < 3 ? `${geofencePoints.length} point(s) placed — need at least 3 for a polygon.` :
                   `${geofencePoints.length} points — polygon ready.`}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <Button variant="outline" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !formName || !formCode} className="bg-[#1da253] hover:bg-[#1da253]/90">
                {saving ? "Saving..." : editingSub ? "Save Changes" : "Create Subdivision"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign User/Bin Modal */}
      {showAssignModal && selectedSubId && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAssignModal(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-sm font-semibold">Assign {assignType === "user" ? "User" : "Bin"} to {selectedSub?.name}</h3>
              <button onClick={() => setShowAssignModal(false)} className="p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {assignType === "user" ? (
                allUsers.filter(u => u.subdivisionId !== selectedSubId).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">All users are already in this subdivision</p>
                ) : (
                  allUsers.filter(u => u.subdivisionId !== selectedSubId).map(u => (
                    <button key={u.id} onClick={() => handleAssign(u.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/60 text-sm">
                      <div>
                        <p className="font-medium text-xs">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        u.role === "admin" ? "bg-purple-100 text-purple-700" :
                        u.role === "dispatcher" ? "bg-blue-100 text-blue-700" :
                        "bg-green-100 text-green-700"
                      )}>{u.role}</span>
                    </button>
                  ))
                )
              ) : (
                allBinsForAssign.filter(b => b.subdivisionId !== selectedSubId).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">All bins are already in this subdivision</p>
                ) : (
                  allBinsForAssign.filter(b => b.subdivisionId !== selectedSubId).map(b => (
                    <button key={b.id} onClick={() => handleAssign(b.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/60 text-sm">
                      <div>
                        <p className="font-medium text-xs">{b.deviceCode}</p>
                        <p className="text-xs text-muted-foreground">{b.capacityLiters}L</p>
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        b.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                      )}>{b.status}</span>
                    </button>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
