export interface Subdivision {
  id: string;
  name: string;
  code: string;
  geofence: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  subdivisionId: string | null;
  email: string;
  fullName: string;
  role: "admin" | "dispatcher" | "maintenance";
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SmartBin {
  id: string;
  subdivisionId: string;
  deviceCode: string;
  imei: string | null;
  latitude: number;
  longitude: number;
  capacityLiters: number;
  thresholdPercent: number;
  status: "active" | "inactive" | "maintenance" | "offline";
  installDate: string | null;
  lastSeenAt: string | null;
  firmwareVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BinTelemetry {
  id: number;
  deviceId: string;
  fillLevelPercent: number;
  distanceCm: number | null;
  batteryVoltage: number | null;
  signalStrength: number | null;
  anomalyFlag: boolean;
  recordedAt: string;
}

export interface Alert {
  id: string;
  subdivisionId: string | null;
  deviceId: string | null;
  alertType: "overflow" | "low_battery" | "sensor_anomaly" | "offline";
  severity: "low" | "medium" | "high" | "critical";
  message: string | null;
  isAcknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface CollectionRoute {
  id: string;
  subdivisionId: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  optimizationScore: number | null;
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  assignedDriverId: string | null;
  assignedVehicleId: string | null;
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RouteStop {
  id: string;
  routeId: string;
  deviceId: string;
  sequenceOrder: number;
  status: "pending" | "arrived" | "serviced" | "skipped";
  arrivedAt: string | null;
  servicedAt: string | null;
  photoProofUrl: string | null;
  notes: string | null;
  deviceCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface RouteWithStops extends CollectionRoute {
  stops: RouteStop[];
}

export interface StopIssueReport {
  severity: "minor" | "major" | "critical";
  description: string;
}

export interface Notification {
  id: string;
  userId: string;
  channel: "push" | "sms" | "email" | "in_app";
  title: string | null;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface DashboardStats {
  totalBins: number;
  activeBins: number;
  overflowAlerts24h: number;
  totalRoutes: number;
  completedRoutesToday: number;
  avgFillLevel: number;
}

export interface FillLevelDistribution {
  bins: unknown[];
  distribution: {
    empty: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  total: number;
}

export interface CollectionHistoryEntry {
  collection_date: string;
  routes_completed: number;
  avg_distance_km: number;
  avg_duration_minutes: number;
  avg_optimization_score: number;
  drivers_active: number;
  bins_serviced: number;
}

export interface DriverPerformanceEntry {
  driver_id: string;
  driver_name: string;
  driver_email: string;
  total_routes: number;
  completed_routes: number;
  avg_distance_km: number;
  avg_duration_minutes: number;
  avg_optimization_score: number;
  service_events_count: number;
}

export interface FillPrediction {
  id: number;
  deviceId: string;
  deviceCode?: string;
  predictedFillPercent: number;
  timeToThresholdMinutes: number;
  confidenceScore: number;
  modelVersion: string;
  predictedAt: string;
}

export interface AIInsight {
  insight: string;
  provider: string;
  model: string;
  generatedAt: string;
}

export interface RouteOptimizationRequest {
  subdivisionId: string;
  numVehicles?: number;
  vehicleCapacityLiters?: number;
  thresholdPercent?: number;
  includePredicted?: boolean;
}
