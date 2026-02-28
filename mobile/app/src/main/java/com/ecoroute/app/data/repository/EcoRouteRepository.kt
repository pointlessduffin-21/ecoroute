package com.ecoroute.app.data.repository

import com.ecoroute.app.data.model.*
import com.ecoroute.app.data.remote.ApiService
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EcoRouteRepository @Inject constructor(
    private val api: ApiService,
) {
    // ── Generic helpers ─────────────────────────────────────────────

    private fun <T> handleResponse(response: Response<ApiResponse<T>>): Result<T> {
        return if (response.isSuccessful) {
            Result.success(response.body()!!.data)
        } else {
            Result.failure(Exception("Request failed (${response.code()})"))
        }
    }

    private fun <T> handlePaginatedResponse(response: Response<PaginatedResponse<T>>): Result<List<T>> {
        return if (response.isSuccessful) {
            Result.success(response.body()!!.data)
        } else {
            Result.failure(Exception("Request failed (${response.code()})"))
        }
    }

    // ── Dashboard / Analytics ───────────────────────────────────────

    suspend fun getDashboardStats(): Result<DashboardStats> {
        return try {
            handleResponse(api.getDashboardStats())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getFillLevels(): Result<FillLevelDistribution> {
        return try {
            handleResponse(api.getFillLevels())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getCollectionHistory(days: Int = 7): Result<List<CollectionHistoryEntry>> {
        return try {
            handleResponse(api.getCollectionHistory(days))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getDriverPerformance(): Result<List<DriverPerformanceEntry>> {
        return try {
            handleResponse(api.getDriverPerformance())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Bins ────────────────────────────────────────────────────────

    suspend fun getBins(
        page: Int = 1,
        limit: Int = 50,
        status: String? = null,
    ): Result<List<SmartBin>> {
        return try {
            handlePaginatedResponse(api.getBins(page, limit, status))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getBinTelemetry(binId: String): Result<List<BinTelemetry>> {
        return try {
            handlePaginatedResponse(api.getBinTelemetry(binId))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getLatestTelemetry(): Result<List<BinTelemetry>> {
        return try {
            handleResponse(api.getLatestTelemetry())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createBin(request: CreateBinRequest): Result<SmartBin> {
        return try {
            handleResponse(api.createBin(request))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Alerts ──────────────────────────────────────────────────────

    suspend fun getAlerts(
        page: Int = 1,
        limit: Int = 50,
        type: String? = null,
        severity: String? = null,
    ): Result<List<Alert>> {
        return try {
            handlePaginatedResponse(api.getAlerts(page, limit, type, severity))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun acknowledgeAlert(id: String): Result<Alert> {
        return try {
            handleResponse(api.acknowledgeAlert(id))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Routes ──────────────────────────────────────────────────────

    suspend fun getRoutes(
        page: Int = 1,
        limit: Int = 50,
        status: String? = null,
        driverId: String? = null,
    ): Result<List<CollectionRoute>> {
        return try {
            handlePaginatedResponse(api.getRoutes(page, limit, status, driverId))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getRoute(routeId: String): Result<CollectionRoute> {
        return try {
            handleResponse(api.getRoute(routeId))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getRouteStops(routeId: String): Result<List<RouteStop>> {
        return try {
            handleResponse(api.getRouteStops(routeId))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateRouteStatus(routeId: String, status: String): Result<CollectionRoute> {
        return try {
            handleResponse(api.updateRouteStatus(routeId, UpdateRouteStatusRequest(status)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateStopStatus(
        routeId: String,
        stopId: String,
        status: String,
        notes: String? = null,
        photoProofUrl: String? = null,
    ): Result<RouteStop> {
        return try {
            handleResponse(api.updateStopStatus(routeId, stopId, UpdateStopStatusRequest(status, notes, photoProofUrl)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun generateRoute(subdivisionId: String): Result<CollectionRoute> {
        return try {
            handleResponse(api.generateRoute(mapOf("subdivisionId" to subdivisionId)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Users ───────────────────────────────────────────────────────

    suspend fun getUsers(
        page: Int = 1,
        limit: Int = 50,
        role: String? = null,
        search: String? = null,
    ): Result<List<User>> {
        return try {
            handlePaginatedResponse(api.getUsers(page, limit, role, search))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createUser(request: CreateUserRequest): Result<User> {
        return try {
            handleResponse(api.createUser(request))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Notifications ───────────────────────────────────────────────

    suspend fun getNotifications(): Result<List<Notification>> {
        return try {
            handlePaginatedResponse(api.getNotifications())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── System Config ───────────────────────────────────────────────

    suspend fun getSystemConfig(): Result<List<SystemConfig>> {
        return try {
            handlePaginatedResponse(api.getSystemConfig())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateSystemConfig(key: String, value: String, description: String? = null): Result<SystemConfig> {
        return try {
            handleResponse(api.updateSystemConfig(key, ConfigUpdateRequest(value, description)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
