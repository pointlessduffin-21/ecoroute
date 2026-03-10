import { useState, useEffect } from "react";
import { Plus, Search, Map as MapIcon, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";

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
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Subdivisions</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Subdivision
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Side: Table View */}
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subdivisions..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      Loading data...
                    </TableCell>
                  </TableRow>
                ) : filteredSubdivisions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      No subdivisions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubdivisions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.code}</TableCell>
                      <TableCell>{sub.name}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{sub.contactEmail || "No email"}</div>
                          <div className="text-muted-foreground text-xs">{sub.contactPhone || "No phone"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            sub.isActive
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {sub.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right Side: Map View */}
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 h-[590px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2">
              <MapIcon className="h-4 w-4" /> Geofence Map
            </h3>
            <span className="text-xs text-muted-foreground">Provider: OpenStreetMap</span>
          </div>
          
          <div className="flex-1 rounded-md overflow-hidden border z-0 relative">
             <MapContainer 
              center={defaultCenter} 
              zoom={13} 
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
        </div>
      </div>
    </div>
  );
}
