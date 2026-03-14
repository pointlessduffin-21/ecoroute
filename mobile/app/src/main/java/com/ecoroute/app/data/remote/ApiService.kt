package com.ecoroute.app.data.remote

import com.ecoroute.app.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // ── Auth ────────────────────────────────────────────────────────

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<ApiResponse<LoginResponse>>

    @POST("auth/logout")
    suspend fun logout(): Response<Unit>

    @GET("auth/me")
    suspend fun getProfile(): Response<ApiResponse<User>>

    // ── Users ───────────────────────────────────────────────────────

    @GET("users")
    suspend fun getUsers(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
        @Query("role") role: String? = null,
        @Query("search") search: String? = null,
    ): Response<PaginatedResponse<User>>

    @POST("users")
    suspend fun createUser(@Body request: CreateUserRequest): Response<ApiResponse<User>>

    // ── Subdivisions ────────────────────────────────────────────────

    @GET("subdivisions")
    suspend fun getSubdivisions(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): Response<PaginatedResponse<Subdivision>>

    // ── Smart Bins ──────────────────────────────────────────────────

    @GET("bins")
    suspend fun getBins(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
        @Query("status") status: String? = null,
        @Query("subdivisionId") subdivisionId: String? = null,
    ): Response<PaginatedResponse<SmartBin>>

    @GET("bins/{id}")
    suspend fun getBin(@Path("id") id: String): Response<ApiResponse<SmartBin>>

    @GET("bins/{id}/telemetry")
    suspend fun getBinTelemetry(
        @Path("id") id: String,
        @Query("limit") limit: Int = 50,
    ): Response<PaginatedResponse<BinTelemetry>>

    @POST("bins")
    suspend fun createBin(@Body request: CreateBinRequest): Response<ApiResponse<SmartBin>>

    // ── Telemetry ───────────────────────────────────────────────────

    @GET("telemetry")
    suspend fun getLatestTelemetry(
        @Query("limit") limit: Int = 200,
    ): Response<PaginatedResponse<BinTelemetry>>

    // ── Alerts ──────────────────────────────────────────────────────

    @GET("alerts")
    suspend fun getAlerts(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
        @Query("type") type: String? = null,
        @Query("severity") severity: String? = null,
        @Query("acknowledged") acknowledged: Boolean? = null,
    ): Response<PaginatedResponse<Alert>>

    @PATCH("alerts/{id}/acknowledge")
    suspend fun acknowledgeAlert(@Path("id") id: String): Response<ApiResponse<Alert>>

    // ── Routes ──────────────────────────────────────────────────────

    @GET("routes")
    suspend fun getRoutes(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
        @Query("status") status: String? = null,
        @Query("driverId") driverId: String? = null,
    ): Response<PaginatedResponse<CollectionRoute>>

    @GET("routes/{id}")
    suspend fun getRoute(@Path("id") id: String): Response<ApiResponse<CollectionRoute>>

    @GET("routes/{id}/stops")
    suspend fun getRouteStops(@Path("id") id: String): Response<ApiResponse<List<RouteStop>>>

    @PATCH("routes/{id}/status")
    suspend fun updateRouteStatus(
        @Path("id") id: String,
        @Body body: UpdateRouteStatusRequest,
    ): Response<ApiResponse<CollectionRoute>>

    @PATCH("routes/{routeId}/stops/{stopId}")
    suspend fun updateStopStatus(
        @Path("routeId") routeId: String,
        @Path("stopId") stopId: String,
        @Body body: UpdateStopStatusRequest,
    ): Response<ApiResponse<RouteStop>>

    @POST("routes/generate")
    suspend fun generateRoute(
        @Body body: Map<String, String>,
    ): Response<ApiResponse<CollectionRoute>>

    // ── Service Events ──────────────────────────────────────────────

    @GET("service-events")
    suspend fun getServiceEvents(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): Response<PaginatedResponse<Any>>

    // ── Notifications ───────────────────────────────────────────────

    @GET("notifications")
    suspend fun getNotifications(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): Response<PaginatedResponse<Notification>>

    @PATCH("notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: String): Response<Unit>

    @PATCH("notifications/read-all")
    suspend fun markAllNotificationsRead(): Response<Unit>

    // ── Analytics ───────────────────────────────────────────────────

    @GET("analytics/dashboard")
    suspend fun getDashboardStats(): Response<ApiResponse<DashboardStats>>

    @GET("analytics/fill-levels")
    suspend fun getFillLevels(): Response<ApiResponse<FillLevelDistribution>>

    @GET("analytics/collection-history")
    suspend fun getCollectionHistory(
        @Query("days") days: Int = 7,
    ): Response<ApiResponse<List<CollectionHistoryEntry>>>

    @GET("analytics/driver-performance")
    suspend fun getDriverPerformance(): Response<ApiResponse<List<DriverPerformanceEntry>>>

    // ── System Config ───────────────────────────────────────────────

    @GET("system-config")
    suspend fun getSystemConfig(): Response<PaginatedResponse<SystemConfig>>

    @PUT("system-config/{key}")
    suspend fun updateSystemConfig(
        @Path("key") key: String,
        @Body request: ConfigUpdateRequest,
    ): Response<ApiResponse<SystemConfig>>
}
