package com.ecoroute.app.ui.screens.routes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.CollectionRoute
import com.ecoroute.app.data.model.RouteStop
import com.ecoroute.app.data.model.User
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RoutesUiState(
    val routes: List<CollectionRoute> = emptyList(),
    val stopsMap: Map<String, List<RouteStop>> = emptyMap(),
    val driversMap: Map<String, String> = emptyMap(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val statusFilter: String = "all",
    val driverFilter: String? = null,
    val expandedRouteId: String? = null,
    val isGenerating: Boolean = false,
)

@HiltViewModel
class RoutesViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RoutesUiState())
    val uiState: StateFlow<RoutesUiState> = _uiState.asStateFlow()

    init {
        loadRoutes()
        loadDrivers()
    }

    fun loadRoutes() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val status = _uiState.value.statusFilter.let { if (it == "all") null else it }
            val driverId = _uiState.value.driverFilter

            repository.getRoutes(status = status, driverId = driverId)
                .onSuccess { routes ->
                    _uiState.update { it.copy(routes = routes, isLoading = false) }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
        }
    }

    fun setDriverFilter(driverId: String?) {
        _uiState.update { it.copy(driverFilter = driverId) }
        loadRoutes()
    }

    private fun loadDrivers() {
        viewModelScope.launch {
            repository.getUsers(role = "driver")
                .onSuccess { users ->
                    val map = users.associate { it.id to it.fullName }
                    _uiState.update { it.copy(driversMap = map) }
                }
        }
    }

    fun setStatusFilter(status: String) {
        _uiState.update { it.copy(statusFilter = status) }
        loadRoutes()
    }

    fun toggleExpanded(routeId: String) {
        val current = _uiState.value.expandedRouteId
        if (current == routeId) {
            _uiState.update { it.copy(expandedRouteId = null) }
        } else {
            _uiState.update { it.copy(expandedRouteId = routeId) }
            if (!_uiState.value.stopsMap.containsKey(routeId)) {
                loadStops(routeId)
            }
        }
    }

    private fun loadStops(routeId: String) {
        viewModelScope.launch {
            repository.getRouteStops(routeId)
                .onSuccess { stops ->
                    _uiState.update {
                        it.copy(stopsMap = it.stopsMap + (routeId to stops))
                    }
                }
        }
    }

    fun generateRoute() {
        viewModelScope.launch {
            _uiState.update { it.copy(isGenerating = true) }
            repository.generateRoute("")
                .onSuccess { loadRoutes() }
                .onFailure { }
            _uiState.update { it.copy(isGenerating = false) }
        }
    }
}
