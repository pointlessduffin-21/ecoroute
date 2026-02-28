package com.ecoroute.app.ui.screens.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.Alert
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AlertsUiState(
    val alerts: List<Alert> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val typeFilter: String = "all",
    val severityFilter: String = "all",
)

@HiltViewModel
class AlertsViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AlertsUiState())
    val uiState: StateFlow<AlertsUiState> = _uiState.asStateFlow()

    init {
        loadAlerts()
    }

    fun loadAlerts() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val type = _uiState.value.typeFilter.let { if (it == "all") null else it }
            val severity = _uiState.value.severityFilter.let { if (it == "all") null else it }

            repository.getAlerts(type = type, severity = severity)
                .onSuccess { alerts ->
                    _uiState.update { it.copy(alerts = alerts, isLoading = false) }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
        }
    }

    fun setTypeFilter(type: String) {
        _uiState.update { it.copy(typeFilter = type) }
        loadAlerts()
    }

    fun setSeverityFilter(severity: String) {
        _uiState.update { it.copy(severityFilter = severity) }
        loadAlerts()
    }

    fun acknowledgeAlert(alertId: String) {
        viewModelScope.launch {
            repository.acknowledgeAlert(alertId)
                .onSuccess { loadAlerts() }
        }
    }

    fun getUnacknowledgedCount(type: String): Int {
        return _uiState.value.alerts.count { it.alertType == type && !it.isAcknowledged }
    }
}
