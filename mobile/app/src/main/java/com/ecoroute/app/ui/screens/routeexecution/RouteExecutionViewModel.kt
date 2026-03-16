package com.ecoroute.app.ui.screens.routeexecution

import android.app.Application
import android.net.Uri
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

data class StopPhotoState(
    val beforePhotoUri: Uri? = null,
    val afterPhotoUri: Uri? = null,
    val beforePhotoUrl: String? = null,
    val afterPhotoUrl: String? = null,
    val isUploading: Boolean = false,
    val uploadError: String? = null,
)

data class RouteExecutionUiState(
    val route: CollectionRoute? = null,
    val stops: List<RouteStop> = emptyList(),
    val currentStopIndex: Int = 0,
    val isLoading: Boolean = true,
    val error: String? = null,
    val actionInProgress: String? = null,
    val successMessage: String? = null,
    val stopPhotos: Map<String, StopPhotoState> = emptyMap(),
)

@HiltViewModel
class RouteExecutionViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
    private val application: Application,
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

    fun setBeforePhoto(stopId: String, uri: Uri) {
        _uiState.update { state ->
            val current = state.stopPhotos[stopId] ?: StopPhotoState()
            state.copy(stopPhotos = state.stopPhotos + (stopId to current.copy(beforePhotoUri = uri)))
        }
    }

    fun setAfterPhoto(stopId: String, uri: Uri) {
        _uiState.update { state ->
            val current = state.stopPhotos[stopId] ?: StopPhotoState()
            state.copy(stopPhotos = state.stopPhotos + (stopId to current.copy(afterPhotoUri = uri)))
        }
    }

    fun serviceStop(stopId: String, notes: String?, photoUri: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgress = "servicing_$stopId") }

            val photoState = _uiState.value.stopPhotos[stopId]
            var beforeUrl: String? = null
            var afterUrl: String? = null

            // Upload before photo if present
            photoState?.beforePhotoUri?.let { uri ->
                _uiState.update { state ->
                    val current = state.stopPhotos[stopId] ?: StopPhotoState()
                    state.copy(stopPhotos = state.stopPhotos + (stopId to current.copy(isUploading = true)))
                }

                repository.uploadStopPhoto(routeId, stopId, uri, "before", application)
                    .onSuccess { url -> beforeUrl = url }
                    .onFailure { e ->
                        _uiState.update {
                            it.copy(
                                actionInProgress = null,
                                error = "Failed to upload before photo: ${e.message}",
                            )
                        }
                        updatePhotoUploading(stopId, false)
                        return@launch
                    }
            }

            // Upload after photo if present
            photoState?.afterPhotoUri?.let { uri ->
                repository.uploadStopPhoto(routeId, stopId, uri, "after", application)
                    .onSuccess { url -> afterUrl = url }
                    .onFailure { e ->
                        _uiState.update {
                            it.copy(
                                actionInProgress = null,
                                error = "Failed to upload after photo: ${e.message}",
                            )
                        }
                        updatePhotoUploading(stopId, false)
                        return@launch
                    }
            }

            updatePhotoUploading(stopId, false)

            // Build the combined photo URL (before + after, separated by comma if both)
            val combinedPhotoUrl = listOfNotNull(beforeUrl, afterUrl, photoUri)
                .filter { it.isNotBlank() }
                .joinToString(",")
                .ifBlank { null }

            repository.updateStopStatus(
                routeId = routeId,
                stopId = stopId,
                status = "serviced",
                notes = notes?.takeIf { it.isNotBlank() },
                photoProofUrl = combinedPhotoUrl,
            )
                .onSuccess { updatedStop ->
                    updateStopInList(updatedStop)
                    // Update photo URLs in state
                    _uiState.update { state ->
                        val current = state.stopPhotos[stopId] ?: StopPhotoState()
                        state.copy(
                            actionInProgress = null,
                            successMessage = "Stop serviced",
                            stopPhotos = state.stopPhotos + (stopId to current.copy(
                                beforePhotoUrl = beforeUrl,
                                afterPhotoUrl = afterUrl,
                            )),
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

            val photoState = _uiState.value.stopPhotos[stopId]
            var photoUrl: String? = null

            // Upload before photo as issue evidence if present
            photoState?.beforePhotoUri?.let { uri ->
                repository.uploadStopPhoto(routeId, stopId, uri, "issue", application)
                    .onSuccess { url -> photoUrl = url }
            }

            repository.reportStopIssue(
                routeId = routeId,
                stopId = stopId,
                severity = severity,
                description = description,
                photoUrl = photoUrl,
            )
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            actionInProgress = null,
                            successMessage = "Issue reported",
                        )
                    }
                }
                .onFailure { e ->
                    // Fallback: append issue note to stop status
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
                        .onFailure { fallbackError ->
                            _uiState.update {
                                it.copy(
                                    actionInProgress = null,
                                    error = "Failed to report issue: ${fallbackError.message}",
                                )
                            }
                        }
                }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, successMessage = null) }
    }

    private fun updatePhotoUploading(stopId: String, uploading: Boolean) {
        _uiState.update { state ->
            val current = state.stopPhotos[stopId] ?: StopPhotoState()
            state.copy(stopPhotos = state.stopPhotos + (stopId to current.copy(isUploading = uploading)))
        }
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
