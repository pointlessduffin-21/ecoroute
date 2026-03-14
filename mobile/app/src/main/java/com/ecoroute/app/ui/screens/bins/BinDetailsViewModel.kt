package com.ecoroute.app.ui.screens.bins

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.BinTelemetry
import com.ecoroute.app.data.model.SmartBin
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BinDetailsUiState(
    val bin: SmartBin? = null,
    val telemetryHistory: List<BinTelemetry> = emptyList(),
    val latestTelemetry: BinTelemetry? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class BinDetailsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val binId: String = savedStateHandle.get<String>("binId") ?: ""

    private val _uiState = MutableStateFlow(BinDetailsUiState())
    val uiState: StateFlow<BinDetailsUiState> = _uiState.asStateFlow()

    init {
        loadBinDetails()
        startAutoRefresh()
    }

    fun loadBinDetails() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            repository.getBin(binId)
                .onSuccess { bin ->
                    _uiState.update { it.copy(bin = bin, isLoading = false) }
                    loadTelemetry()
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
        }
    }

    private fun loadTelemetry() {
        viewModelScope.launch {
            repository.getBinTelemetry(binId)
                .onSuccess { telemetry ->
                    _uiState.update {
                        it.copy(
                            telemetryHistory = telemetry,
                            latestTelemetry = telemetry.firstOrNull(),
                        )
                    }
                }
        }
    }

    private fun startAutoRefresh() {
        viewModelScope.launch {
            while (true) {
                delay(30_000) // refresh every 30 seconds
                loadTelemetry()
            }
        }
    }
}
