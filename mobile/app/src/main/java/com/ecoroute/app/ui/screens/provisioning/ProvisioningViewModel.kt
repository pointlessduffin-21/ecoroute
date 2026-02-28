package com.ecoroute.app.ui.screens.provisioning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.BuildConfig
import com.ecoroute.app.ble.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProvisioningUiState(
    val isScanning: Boolean = false,
    val scannedDevices: List<ScannedDevice> = emptyList(),
    val selectedDevice: ScannedDevice? = null,
    val isConnecting: Boolean = false,
    val isConnected: Boolean = false,
    val deviceStatus: DeviceStatus? = null,
    val isWritingConfig: Boolean = false,
    val showConfigDialog: Boolean = false,
    val provisioningComplete: Boolean = false,
    val error: String? = null,
    // Config form fields
    val wifiSsid: String = "",
    val wifiPassword: String = "",
    val deviceCode: String = "",
    val apiUrl: String = BuildConfig.API_BASE_URL.replace("/api/v1", "/api/v1/device/telemetry"),
    val reportIntervalSec: Int = 900,
    val binHeightCm: Float = 100f,
)

@HiltViewModel
class ProvisioningViewModel @Inject constructor(
    private val bleManager: BleManager,
) : ViewModel() {

    private val _state = MutableStateFlow(ProvisioningUiState())
    val state: StateFlow<ProvisioningUiState> = _state.asStateFlow()

    init {
        // Observe BLE scanning state
        viewModelScope.launch {
            bleManager.isScanning.collect { scanning ->
                _state.update { it.copy(isScanning = scanning) }
            }
        }
        viewModelScope.launch {
            bleManager.scannedDevices.collect { devices ->
                _state.update { it.copy(scannedDevices = devices) }
            }
        }
        viewModelScope.launch {
            bleManager.isConnected.collect { connected ->
                _state.update { it.copy(isConnected = connected) }
            }
        }
    }

    fun startScan() {
        _state.update { it.copy(error = null, provisioningComplete = false) }
        bleManager.startScan()

        // Auto-stop scan after timeout
        viewModelScope.launch {
            delay(BleConstants.SCAN_TIMEOUT_MS)
            if (_state.value.isScanning) {
                bleManager.stopScan()
            }
        }
    }

    fun stopScan() {
        bleManager.stopScan()
    }

    fun selectDevice(device: ScannedDevice) {
        _state.update {
            it.copy(
                selectedDevice = device,
                isConnecting = true,
                error = null,
                deviceCode = device.name,  // Pre-fill device code from BLE name
            )
        }
        bleManager.stopScan()

        viewModelScope.launch {
            try {
                val connected = bleManager.connect(device.address)
                if (connected) {
                    val status = bleManager.readStatus()
                    _state.update {
                        it.copy(
                            isConnecting = false,
                            deviceStatus = status,
                            showConfigDialog = true,
                            deviceCode = status?.deviceCode?.ifEmpty { device.name } ?: device.name,
                        )
                    }
                } else {
                    _state.update {
                        it.copy(isConnecting = false, error = "Failed to connect to device")
                    }
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isConnecting = false, error = "Connection error: ${e.message}")
                }
            }
        }
    }

    fun updateWifiSsid(ssid: String) = _state.update { it.copy(wifiSsid = ssid) }
    fun updateWifiPassword(pass: String) = _state.update { it.copy(wifiPassword = pass) }
    fun updateDeviceCode(code: String) = _state.update { it.copy(deviceCode = code) }
    fun updateApiUrl(url: String) = _state.update { it.copy(apiUrl = url) }
    fun updateReportInterval(sec: Int) = _state.update { it.copy(reportIntervalSec = sec) }
    fun updateBinHeight(cm: Float) = _state.update { it.copy(binHeightCm = cm) }

    fun dismissConfigDialog() {
        _state.update { it.copy(showConfigDialog = false) }
        bleManager.disconnect()
    }

    fun provisionDevice() {
        val s = _state.value
        if (s.wifiSsid.isBlank() || s.deviceCode.isBlank() || s.apiUrl.isBlank()) {
            _state.update { it.copy(error = "WiFi SSID, device code, and API URL are required") }
            return
        }

        _state.update { it.copy(isWritingConfig = true, error = null) }

        viewModelScope.launch {
            try {
                val config = DeviceConfig(
                    wifiSsid = s.wifiSsid,
                    wifiPassword = s.wifiPassword,
                    deviceCode = s.deviceCode,
                    apiUrl = s.apiUrl,
                    reportIntervalSec = s.reportIntervalSec,
                    binHeightCm = s.binHeightCm,
                )

                bleManager.writeConfig(config)
                delay(200)

                // Send save and restart command
                bleManager.sendCommand(BleConstants.CMD_SAVE_AND_RESTART)
                delay(500)

                _state.update {
                    it.copy(
                        isWritingConfig = false,
                        showConfigDialog = false,
                        provisioningComplete = true,
                    )
                }

                bleManager.disconnect()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isWritingConfig = false,
                        error = "Provisioning failed: ${e.message}",
                    )
                }
            }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    override fun onCleared() {
        bleManager.stopScan()
        bleManager.disconnect()
        super.onCleared()
    }
}
