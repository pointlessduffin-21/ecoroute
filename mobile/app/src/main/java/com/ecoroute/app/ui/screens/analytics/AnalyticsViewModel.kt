package com.ecoroute.app.ui.screens.analytics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.CollectionHistoryEntry
import com.ecoroute.app.data.model.DriverPerformanceEntry
import com.ecoroute.app.data.model.FillLevelDistribution
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AnalyticsUiState(
    val fillDistribution: FillLevelDistribution? = null,
    val collectionHistory: List<CollectionHistoryEntry> = emptyList(),
    val driverPerformance: List<DriverPerformanceEntry> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class AnalyticsViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnalyticsUiState())
    val uiState: StateFlow<AnalyticsUiState> = _uiState.asStateFlow()

    init {
        loadAnalytics()
    }

    fun loadAnalytics() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            val fillResult = repository.getFillLevels()
            val historyResult = repository.getCollectionHistory()
            val driverResult = repository.getDriverPerformance()

            _uiState.update {
                it.copy(
                    fillDistribution = fillResult.getOrNull(),
                    collectionHistory = historyResult.getOrDefault(emptyList()),
                    driverPerformance = driverResult.getOrDefault(emptyList()),
                    isLoading = false,
                    error = if (fillResult.isFailure && historyResult.isFailure && driverResult.isFailure) {
                        fillResult.exceptionOrNull()?.message ?: "Failed to load analytics"
                    } else null,
                )
            }
        }
    }
}
