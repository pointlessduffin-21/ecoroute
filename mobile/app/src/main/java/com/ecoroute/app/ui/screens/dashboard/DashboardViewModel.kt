package com.ecoroute.app.ui.screens.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.Alert
import com.ecoroute.app.data.model.DashboardStats
import com.ecoroute.app.data.model.FillLevelDistribution
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val stats: DashboardStats? = null,
    val fillDistribution: FillLevelDistribution? = null,
    val recentAlerts: List<Alert> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            // Load all data concurrently
            val statsResult = repository.getDashboardStats()
            val fillResult = repository.getFillLevels()
            val alertsResult = repository.getAlerts(limit = 5)

            if (statsResult.isFailure && fillResult.isFailure && alertsResult.isFailure) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = statsResult.exceptionOrNull()?.message ?: "Failed to load dashboard",
                    )
                }
                return@launch
            }

            _uiState.update {
                it.copy(
                    stats = statsResult.getOrNull(),
                    fillDistribution = fillResult.getOrNull(),
                    recentAlerts = alertsResult.getOrDefault(emptyList()),
                    isLoading = false,
                )
            }
        }
    }
}
