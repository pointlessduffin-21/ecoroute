package com.ecoroute.app.data.model

import com.google.gson.annotations.SerializedName

// ── Auth ────────────────────────────────────────────────────────────

data class LoginRequest(
    val email: String,
    val password: String,
)

data class LoginResponse(
    val user: User,
    val session: Session,
)

data class Session(
    val accessToken: String,
    val refreshToken: String?,
)

data class CreateUserRequest(
    val email: String,
    val fullName: String,
    val role: String,
    val password: String,
    val subdivisionId: String? = null,
)

// ── Core Entities ───────────────────────────────────────────────────

data class Subdivision(
    val id: String,
    val name: String,
    val code: String,
    val geofence: String?,
    val address: String?,
    val contactEmail: String?,
    val contactPhone: String?,
    val isActive: Boolean,
    val createdAt: String,
    val updatedAt: String,
)

data class User(
    val id: String,
    val subdivisionId: String?,
    val email: String,
    val fullName: String,
    val role: String,
    val phone: String?,
    val avatarUrl: String?,
    val isActive: Boolean,
    val createdAt: String,
    val updatedAt: String,
)

data class SmartBin(
    val id: String,
    val subdivisionId: String,
    val deviceCode: String,
    val imei: String?,
    val latitude: Double,
    val longitude: Double,
    val capacityLiters: Int,
    val thresholdPercent: Int,
    val status: String,
    val installDate: String?,
    val lastSeenAt: String?,
    val firmwareVersion: String?,
    val createdAt: String,
    val updatedAt: String,
)

data class BinTelemetry(
    val id: Long,
    val deviceId: String,
    val fillLevelPercent: Double,
    val distanceCm: Double?,
    val batteryVoltage: Double?,
    val signalStrength: Int?,
    val anomalyFlag: Boolean,
    val recordedAt: String,
)

data class Alert(
    val id: String,
    val subdivisionId: String?,
    val deviceId: String?,
    val alertType: String,
    val severity: String,
    val message: String?,
    val isAcknowledged: Boolean,
    val acknowledgedBy: String?,
    val acknowledgedAt: String?,
    val createdAt: String,
)

data class CollectionRoute(
    val id: String,
    val subdivisionId: String,
    val status: String,
    val optimizationScore: Double?,
    val estimatedDistanceKm: Double?,
    val estimatedDurationMinutes: Double?,
    val assignedDriverId: String?,
    val assignedVehicleId: String?,
    val scheduledDate: String?,
    val startedAt: String?,
    val completedAt: String?,
    val createdAt: String,
    val updatedAt: String,
)

data class RouteStop(
    val id: String,
    val routeId: String,
    val deviceId: String,
    val sequenceOrder: Int,
    val status: String,
    val arrivedAt: String?,
    val servicedAt: String?,
    val photoProofUrl: String?,
    val notes: String?,
    // Joined fields from bins table
    val deviceCode: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

data class Notification(
    val id: String,
    val userId: String,
    val channel: String,
    val title: String?,
    val body: String,
    val isRead: Boolean,
    val createdAt: String,
)

// ── Analytics ───────────────────────────────────────────────────────

data class DashboardStats(
    val totalBins: Int,
    val activeBins: Int,
    val overflowAlerts24h: Int,
    val totalRoutes: Int,
    val completedRoutesToday: Int,
    val avgFillLevel: Double,
)

data class FillLevelDistribution(
    val bins: List<Any>?,
    val distribution: FillDistribution,
    val total: Int,
)

data class FillDistribution(
    val empty: Int,
    val low: Int,
    val medium: Int,
    val high: Int,
    val critical: Int,
)

data class CollectionHistoryEntry(
    @SerializedName("collection_date") val collectionDate: String,
    @SerializedName("routes_completed") val routesCompleted: Int,
    @SerializedName("avg_distance_km") val avgDistanceKm: Double,
    @SerializedName("avg_duration_minutes") val avgDurationMinutes: Double,
    @SerializedName("avg_optimization_score") val avgOptimizationScore: Double,
    @SerializedName("drivers_active") val driversActive: Int,
    @SerializedName("bins_serviced") val binsServiced: Int,
)

data class DriverPerformanceEntry(
    @SerializedName("driver_id") val driverId: String,
    @SerializedName("driver_name") val driverName: String,
    @SerializedName("driver_email") val driverEmail: String,
    @SerializedName("total_routes") val totalRoutes: Int,
    @SerializedName("completed_routes") val completedRoutes: Int,
    @SerializedName("avg_distance_km") val avgDistanceKm: Double,
    @SerializedName("avg_duration_minutes") val avgDurationMinutes: Double,
    @SerializedName("avg_optimization_score") val avgOptimizationScore: Double,
    @SerializedName("service_events_count") val serviceEventsCount: Int,
)

// ── System Config ───────────────────────────────────────────────────

data class SystemConfig(
    val id: String?,
    val subdivisionId: String?,
    val configKey: String,
    val configValue: String,
    val description: String?,
    val createdAt: String?,
    val updatedAt: String?,
)

data class ConfigUpdateRequest(
    val value: String,
    val description: String? = null,
    val subdivisionId: String? = null,
)

// ── Create Bin Request ──────────────────────────────────────────────

data class CreateBinRequest(
    val deviceCode: String,
    val subdivisionId: String,
    val latitude: Double,
    val longitude: Double,
    val capacityLiters: Int,
    val thresholdPercent: Int = 80,
)

// ── Route Execution Requests ────────────────────────────────────────

data class UpdateRouteStatusRequest(
    val status: String,
)

data class UpdateStopStatusRequest(
    val status: String,
    val notes: String? = null,
    val photoProofUrl: String? = null,
)

// ── API Wrapper ─────────────────────────────────────────────────────

data class ApiResponse<T>(
    val data: T,
)

data class PaginatedResponse<T>(
    val data: List<T>,
    val pagination: Pagination?,
)

data class Pagination(
    val total: Int,
    val limit: Int,
    val offset: Int,
)
