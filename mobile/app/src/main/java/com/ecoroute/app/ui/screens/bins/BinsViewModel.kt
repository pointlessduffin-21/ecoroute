package com.ecoroute.app.ui.screens.bins

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.BinTelemetry
import com.ecoroute.app.data.model.CreateBinRequest
import com.ecoroute.app.data.model.SmartBin
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BinsUiState(
    val bins: List<SmartBin> = emptyList(),
    val telemetryMap: Map<String, BinTelemetry> = emptyMap(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val statusFilter: String = "all",
    val searchQuery: String = "",
    val isCreating: Boolean = false,
    val createError: String? = null,
)

@HiltViewModel
class BinsViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BinsUiState())
    val uiState: StateFlow<BinsUiState> = _uiState.asStateFlow()

    init {
        loadBins()
    }

    fun loadBins() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val status = _uiState.value.statusFilter.let { if (it == "all") null else it }

            repository.getBins(status = status)
                .onSuccess { bins ->
                    _uiState.update { it.copy(bins = bins, isLoading = false) }
                    loadTelemetry()
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
        }
    }

    private fun loadTelemetry() {
        viewModelScope.launch {
            repository.getLatestTelemetry()
                .onSuccess { telemetryList ->
                    val map = telemetryList.associateBy { it.deviceId }
                    _uiState.update { it.copy(telemetryMap = map) }
                }
        }
    }

    fun setStatusFilter(status: String) {
        _uiState.update { it.copy(statusFilter = status) }
        loadBins()
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun createBin(request: CreateBinRequest) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true, createError = null) }
            repository.createBin(request)
                .onSuccess {
                    _uiState.update { it.copy(isCreating = false) }
                    loadBins()
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isCreating = false, createError = e.message) }
                }
        }
    }

    val filteredBins: List<SmartBin>
        get() {
            val state = _uiState.value
            return state.bins.filter { bin ->
                state.searchQuery.isBlank() ||
                    bin.deviceCode.contains(state.searchQuery, ignoreCase = true)
            }
        }
}
