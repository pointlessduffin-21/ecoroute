package com.ecoroute.app.ui.screens.provisioning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.BuildConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

// ─── State ────────────────────────────────────────────────────────────────────

data class WifiApUiState(
    // Step tracking
    val step: WifiApStep = WifiApStep.INSTRUCTIONS,
    // Device info fetched from /status
    val deviceStatus: WifiApDeviceStatus? = null,
    // Form fields
    val wifiSsid: String = "",
    val wifiPassword: String = "",
    val deviceCode: String = "",
    val apiUrl: String = BuildConfig.API_BASE_URL.replace("/api/v1", "/api/v1/device/telemetry"),
    val reportIntervalSec: Int = 900,
    val binHeightCm: Float = 100f,
    // Flow state
    val isLoading: Boolean = false,
    val provisioningComplete: Boolean = false,
    val error: String? = null,
)

enum class WifiApStep {
    INSTRUCTIONS,   // Show user how to connect to ECO-BIN-SETUP
    CONFIGURE,      // Form to fill in WiFi/config
    DONE,           // Success
}

data class WifiApDeviceStatus(
    val configured: Boolean,
    val deviceCode: String,
    val firmwareVersion: String,
    val batteryVoltage: Float,
    val reportInterval: Int,
    val binHeight: Float,
)

// ─── ViewModel ────────────────────────────────────────────────────────────────

@HiltViewModel
class WifiApProvisioningViewModel @Inject constructor() : ViewModel() {

    // Device AP is always at 192.168.4.1 (ESP32 SoftAP default gateway)
    private val apBaseUrl = "http://192.168.4.1"

    private val _state = MutableStateFlow(WifiApUiState())
    val state: StateFlow<WifiApUiState> = _state.asStateFlow()

    /** Proceed from instructions step — fetch device status from AP. */
    fun connectToDevice() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val status = fetchStatus()
                _state.update {
                    it.copy(
                        isLoading = false,
                        step = WifiApStep.CONFIGURE,
                        deviceStatus = status,
                        deviceCode = status.deviceCode.ifEmpty { it.deviceCode },
                        reportIntervalSec = if (status.reportInterval > 0) status.reportInterval else it.reportIntervalSec,
                        binHeightCm = if (status.binHeight > 0) status.binHeight else it.binHeightCm,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = "Cannot reach device at $apBaseUrl. Make sure your phone is connected to the ECO-BIN-SETUP WiFi network. (${e.message})",
                    )
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

    fun provisionDevice() {
        val s = _state.value
        if (s.wifiSsid.isBlank() || s.deviceCode.isBlank() || s.apiUrl.isBlank()) {
            _state.update { it.copy(error = "WiFi SSID, Device Code, and API URL are required") }
            return
        }

        _state.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            try {
                val body = JSONObject().apply {
                    put("wifiSsid", s.wifiSsid)
                    put("wifiPassword", s.wifiPassword)
                    put("deviceCode", s.deviceCode)
                    put("apiUrl", s.apiUrl)
                    put("reportInterval", s.reportIntervalSec)
                    put("binHeight", s.binHeightCm.toDouble())
                }
                postJson("$apBaseUrl/configure", body.toString())
                _state.update {
                    it.copy(
                        isLoading = false,
                        step = WifiApStep.DONE,
                        provisioningComplete = true,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = "Provisioning failed: ${e.message}",
                    )
                }
            }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    fun reset() = _state.update { WifiApUiState() }

    // ─── HTTP helpers ─────────────────────────────────────────────────────────

    private suspend fun fetchStatus(): WifiApDeviceStatus = withContext(Dispatchers.IO) {
        val url = URL("$apBaseUrl/status")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = 5_000
            readTimeout = 5_000
            requestMethod = "GET"
        }
        try {
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            WifiApDeviceStatus(
                configured      = json.optBoolean("configured", false),
                deviceCode      = json.optString("deviceCode", ""),
                firmwareVersion = json.optString("fw", ""),
                batteryVoltage  = json.optDouble("battery", 0.0).toFloat(),
                reportInterval  = json.optInt("interval", 900),
                binHeight       = json.optDouble("binHeight", 100.0).toFloat(),
            )
        } finally {
            conn.disconnect()
        }
    }

    private suspend fun postJson(urlString: String, body: String): String =
        withContext(Dispatchers.IO) {
            val url = URL(urlString)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 8_000
                readTimeout = 8_000
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
            try {
                OutputStreamWriter(conn.outputStream).use { it.write(body) }
                val code = conn.responseCode
                if (code !in 200..299) {
                    val err = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "HTTP $code"
                    throw Exception(err)
                }
                conn.inputStream.bufferedReader().use { it.readText() }
            } finally {
                conn.disconnect()
            }
        }
}
