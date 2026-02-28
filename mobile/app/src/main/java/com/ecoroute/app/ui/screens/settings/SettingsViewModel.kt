package com.ecoroute.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.SystemConfig
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val configs: Map<String, String> = emptyMap(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val isSaving: Boolean = false,
    val saveSuccess: Boolean = false,

    // Editable fields
    val subdivisionName: String = "",
    val depotAddress: String = "",
    val fillThreshold: Float = 80f,
    val lowBatteryVoltage: Float = 3.3f,
    val emailAlerts: Boolean = true,
    val pushAlerts: Boolean = true,
    val smsAlerts: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        loadConfig()
    }

    fun loadConfig() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            repository.getSystemConfig()
                .onSuccess { configs ->
                    val map = configs.associate { it.configKey to it.configValue }
                    _uiState.update {
                        it.copy(
                            configs = map,
                            isLoading = false,
                            subdivisionName = map["subdivision_name"] ?: "",
                            depotAddress = map["depot_address"] ?: "",
                            fillThreshold = map["default_fill_threshold"]?.toFloatOrNull() ?: 80f,
                            lowBatteryVoltage = map["low_battery_voltage"]?.toFloatOrNull() ?: 3.3f,
                            emailAlerts = map["email_alerts"]?.toBoolean() ?: true,
                            pushAlerts = map["push_alerts"]?.toBoolean() ?: true,
                            smsAlerts = map["sms_alerts"]?.toBoolean() ?: false,
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
        }
    }

    fun updateSubdivisionName(value: String) { _uiState.update { it.copy(subdivisionName = value) } }
    fun updateDepotAddress(value: String) { _uiState.update { it.copy(depotAddress = value) } }
    fun updateFillThreshold(value: Float) { _uiState.update { it.copy(fillThreshold = value) } }
    fun updateLowBatteryVoltage(value: Float) { _uiState.update { it.copy(lowBatteryVoltage = value) } }
    fun toggleEmailAlerts() { _uiState.update { it.copy(emailAlerts = !it.emailAlerts) } }
    fun togglePushAlerts() { _uiState.update { it.copy(pushAlerts = !it.pushAlerts) } }
    fun toggleSmsAlerts() { _uiState.update { it.copy(smsAlerts = !it.smsAlerts) } }

    fun saveGeneralSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, saveSuccess = false) }
            val state = _uiState.value
            repository.updateSystemConfig("subdivision_name", state.subdivisionName)
            repository.updateSystemConfig("depot_address", state.depotAddress)
            _uiState.update { it.copy(isSaving = false, saveSuccess = true) }
        }
    }

    fun saveThresholdSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, saveSuccess = false) }
            val state = _uiState.value
            repository.updateSystemConfig("default_fill_threshold", state.fillThreshold.toInt().toString())
            repository.updateSystemConfig("low_battery_voltage", "%.1f".format(state.lowBatteryVoltage))
            _uiState.update { it.copy(isSaving = false, saveSuccess = true) }
        }
    }

    fun saveNotificationSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, saveSuccess = false) }
            val state = _uiState.value
            repository.updateSystemConfig("email_alerts", state.emailAlerts.toString())
            repository.updateSystemConfig("push_alerts", state.pushAlerts.toString())
            repository.updateSystemConfig("sms_alerts", state.smsAlerts.toString())
            _uiState.update { it.copy(isSaving = false, saveSuccess = true) }
        }
    }

    fun clearSaveSuccess() {
        _uiState.update { it.copy(saveSuccess = false) }
    }
}
