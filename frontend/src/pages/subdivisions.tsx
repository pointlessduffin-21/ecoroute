import { useState, useEffect } from "react";
import { Plus, Search, Map as MapIcon, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Map related imports
import { MapContainer, TileLayer, Polygon, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's default icon missing issue in React
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export function SubdivisionsPage() {
  const [subdivisions, setSubdivisions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredSubdivisions = subdivisions.filter(
    (sub) => sub.name.toLowerCase().includes(searchQuery.toLowerCase()) || sub.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Parse GeoJSON for map display. 
  // Expecting geofence to be stored as a stringified GeoJSON Polygon object.
  const getPolygonPositions = (geojsonStr: string) => {
    try {
      if (!geojsonStr) return [];
      const feature = JSON.parse(geojsonStr);
      // GeoJSON is [lon, lat], Leaflet wants [lat, lon]
      if (feature.type === "Polygon" && feature.coordinates && feature.coordinates[0]) {
        return feature.coordinates[0].map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
      }
      return [];
    } catch (e) {
      return [];
    }
  };

  // Manila Default Center
  const defaultCenter: [number, number] = [14.5995, 120.9842];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subdivisions</h1>
          <p className="text-sm text-muted-foreground">
            Manage your operational zones and geofences.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Subdivision
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Side: Table View */}
        <Card className="h-[550px] flex flex-col overflow-hidden shadow-sm">
          <CardContent className="flex-1 flex flex-col p-0">
            {/* Search Bar Area */}
            <div className="p-6 pb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search subdivisions..."
                  className="pl-9 h-10 border-input bg-background/50 focus-visible:ring-1 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto px-6 pb-6">
              <div className="rounded-xl border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b">
                      <TableHead className="font-semibold text-muted-foreground h-11 w-24">Code</TableHead>
                      <TableHead className="font-semibold text-muted-foreground h-11">Name</TableHead>
                      <TableHead className="font-semibold text-muted-foreground h-11">Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                            <span className="text-sm">Loading subdivisions...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredSubdivisions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center space-y-1">
                            <MapIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
                            <span className="text-sm font-medium">No results found</span>
                            <span className="text-xs">Try adjusting your search query.</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSubdivisions.map((sub) => (
                        <TableRow key={sub.id} className="group transition-colors hover:bg-muted/50">
                          <TableCell className="font-medium align-top py-4 w-24">{sub.code}</TableCell>
                          <TableCell className="font-medium text-foreground/90 align-top py-4">{sub.name}</TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col space-y-1">
                              <span className="text-sm text-foreground/90">{sub.contactEmail || "No email"}</span>
                              <span className="text-sm text-muted-foreground">{sub.contactPhone || "No phone"}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Side: Map View */}
        <Card className="h-[550px] flex flex-col overflow-hidden shadow-sm">
          <CardHeader className="pb-4 pt-6 px-6 flex flex-row items-start justify-between border-b">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <MapIcon className="h-5 w-5 text-green-600" /> Geofence Map
              </CardTitle>
              <CardDescription className="text-sm max-w-[200px] leading-relaxed mt-1">
                Viewing spatial boundaries of subdivisions.
              </CardDescription>
            </div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right leading-tight pt-1">
              Provider:<br />OpenStreetMap
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 relative z-0 bg-muted/20">
            <div className="h-full w-full">
               <MapContainer 
                center={defaultCenter} 
                zoom={12} 
                scrollWheelZoom={true} 
                style={{ height: '100%', width: '100%', zIndex: 0 }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {filteredSubdivisions.map((sub) => {
                  const positions = getPolygonPositions(sub.geofence);
                  if (positions.length > 0) {
                    return (
                      <Polygon 
                        key={sub.id} 
                        positions={positions} 
                        color="#0ea5e9"
                        fillColor="#38bdf8"
                        fillOpacity={0.2}
                        weight={2}
                      >
                        <Popup>
                          <div className="font-semibold">{sub.name}</div>
                          <div className="text-sm">Code: {sub.code}</div>
                        </Popup>
                      </Polygon>
                    );
                  }
                  return null;
                })}
              </MapContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
