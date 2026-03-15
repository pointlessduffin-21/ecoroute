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
  Popup,
  useMap,
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

export function SubdivisionsPage() {
  const [subdivisions, setSubdivisions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapBounds, setMapBounds] = useState<[number, number][] | null>(null);
  const [hoveredSubId, setHoveredSubId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

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
    setSelectedSubId(selectedSubId === sub.id ? null : sub.id);
    const coords = getPolygonPositions(sub.geofence);
    if (coords.length > 0) setMapBounds(coords);
  };

  const resetView = () => {
    setSelectedSubId(null);
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
        <Button className="bg-[#1da253] text-white hover:bg-[#1da253]/90">
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
    </div>
  );
}
