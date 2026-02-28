package com.ecoroute.app.ui.screens.routeexecution

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.CollectionRoute
import com.ecoroute.app.data.model.RouteStop
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RouteExecutionUiState(
    val route: CollectionRoute? = null,
    val stops: List<RouteStop> = emptyList(),
    val currentStopIndex: Int = 0,
    val isLoading: Boolean = true,
    val error: String? = null,
    val actionInProgress: String? = null,
    val successMessage: String? = null,
)

@HiltViewModel
class RouteExecutionViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val routeId: String = savedStateHandle.get<String>("routeId") ?: ""

    private val _uiState = MutableStateFlow(RouteExecutionUiState())
    val uiState: StateFlow<RouteExecutionUiState> = _uiState.asStateFlow()

    init {
        loadRouteDetails()
    }

    fun loadRouteDetails() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            val routeResult = repository.getRoute(routeId)
            val stopsResult = repository.getRouteStops(routeId)

            routeResult.onSuccess { route ->
                stopsResult.onSuccess { stops ->
                    val sortedStops = stops.sortedBy { it.sequenceOrder }
                    val currentIndex = sortedStops.indexOfFirst { stop ->
                        stop.status == "pending" || stop.status == "arrived"
                    }.let { if (it == -1) sortedStops.size else it }

                    _uiState.update {
                        it.copy(
                            route = route,
                            stops = sortedStops,
                            currentStopIndex = currentIndex,
                            isLoading = false,
                        )
                    }
                }.onFailure { e ->
                    _uiState.update {
                        it.copy(
                            route = route,
                            isLoading = false,
                            error = "Failed to load stops: ${e.message}",
                        )
                    }
                }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(isLoading = false, error = "Failed to load route: ${e.message}")
                }
            }
        }
    }

    fun startRoute() {
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgress = "starting") }

            repository.updateRouteStatus(routeId, "in_progress")
                .onSuccess { updatedRoute ->
                    _uiState.update {
                        it.copy(
                            route = updatedRoute,
                            actionInProgress = null,
                            successMessage = "Route started",
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(actionInProgress = null, error = "Failed to start route: ${e.message}")
                    }
                }
        }
    }

    fun completeRoute() {
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgress = "completing") }

            repository.updateRouteStatus(routeId, "completed")
                .onSuccess { updatedRoute ->
                    _uiState.update {
                        it.copy(
                            route = updatedRoute,
                            actionInProgress = null,
                            successMessage = "Route completed",
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(actionInProgress = null, error = "Failed to complete route: ${e.message}")
                    }
                }
        }
    }

    fun arriveAtStop(stopId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgress = "arriving_$stopId") }

            repository.updateStopStatus(routeId, stopId, "arrived")
                .onSuccess { updatedStop ->
                    updateStopInList(updatedStop)
                    _uiState.update {
                        it.copy(
                            actionInProgress = null,
                            successMessage = "Arrived at stop",
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(actionInProgress = null, error = "Failed to mark arrival: ${e.message}")
                    }
                }
        }
    }

    fun serviceStop(stopId: String, notes: String?, photoUri: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgress = "servicing_$stopId") }

            repository.updateStopStatus(
                routeId = routeId,
                stopId = stopId,
                status = "serviced",
                notes = notes?.takeIf { it.isNotBlank() },
                photoProofUrl = photoUri,
            )
                .onSuccess { updatedStop ->
                    updateStopInList(updatedStop)
                    _uiState.update {
                        it.copy(
                            actionInProgress = null,
                            successMessage = "Stop serviced",
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(actionInProgress = null, error = "Failed to service stop: ${e.message}")
                    }
                }
        }
    }

    fun skipStop(stopId: String, reason: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgress = "skipping_$stopId") }

            repository.updateStopStatus(
                routeId = routeId,
                stopId = stopId,
                status = "skipped",
                notes = reason,
            )
                .onSuccess { updatedStop ->
                    updateStopInList(updatedStop)
                    _uiState.update {
                        it.copy(
                            actionInProgress = null,
                            successMessage = "Stop skipped",
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(actionInProgress = null, error = "Failed to skip stop: ${e.message}")
                    }
                }
        }
    }

    fun reportIssue(stopId: String, description: String, severity: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgress = "reporting_$stopId") }

            val issueNote = "[ISSUE - ${severity.uppercase()}] $description"

            repository.updateStopStatus(
                routeId = routeId,
                stopId = stopId,
                status = "arrived",
                notes = issueNote,
            )
                .onSuccess { updatedStop ->
                    updateStopInList(updatedStop)
                    _uiState.update {
                        it.copy(
                            actionInProgress = null,
                            successMessage = "Issue reported",
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(actionInProgress = null, error = "Failed to report issue: ${e.message}")
                    }
                }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, successMessage = null) }
    }

    private fun updateStopInList(updatedStop: RouteStop) {
        _uiState.update { state ->
            val updatedStops = state.stops.map { stop ->
                if (stop.id == updatedStop.id) updatedStop else stop
            }
            val currentIndex = updatedStops.indexOfFirst { stop ->
                stop.status == "pending" || stop.status == "arrived"
            }.let { if (it == -1) updatedStops.size else it }

            state.copy(stops = updatedStops, currentStopIndex = currentIndex)
        }
    }
}
