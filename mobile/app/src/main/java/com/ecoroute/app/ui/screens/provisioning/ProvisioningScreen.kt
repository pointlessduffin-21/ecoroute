package com.ecoroute.app.ui.screens.provisioning

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.ble.ScannedDevice

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProvisioningScreen(
    viewModel: ProvisioningViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // BLE permission launcher
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        if (allGranted) {
            viewModel.startScan()
        }
    }

    val blePermissions = remember {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.ACCESS_FINE_LOCATION,
            )
        } else {
            arrayOf(
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION,
            )
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        // Header card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer,
            ),
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    Icons.Filled.BluetoothSearching,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(32.dp),
                )
                Column {
                    Text(
                        "Device Provisioning",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Scan and configure ESP32 smart bin sensors via BLE",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Scan button
        Button(
            onClick = {
                if (state.isScanning) {
                    viewModel.stopScan()
                } else {
                    permissionLauncher.launch(blePermissions)
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.isScanning) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(8.dp))
                Text("Stop Scanning")
            } else {
                Icon(Icons.Filled.BluetoothSearching, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Scan for Devices")
            }
        }

        // Success message
        if (state.provisioningComplete) {
            Spacer(Modifier.height(12.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                ),
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.tertiary,
                    )
                    Text(
                        "Device provisioned successfully! It will now restart and begin reporting.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        // Error message
        state.error?.let { error ->
            Spacer(Modifier.height(12.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                ),
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        Icons.Filled.Error,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                    Text(
                        error,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { viewModel.clearError() }) {
                        Icon(Icons.Filled.Close, contentDescription = "Dismiss")
                    }
                }
            }
        }

        // Connecting indicator
        if (state.isConnecting) {
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(12.dp))
                Text("Connecting to ${state.selectedDevice?.name}...")
            }
        }

        Spacer(Modifier.height(16.dp))

        // Device list
        if (state.scannedDevices.isEmpty() && !state.isScanning) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Filled.BluetoothDisabled,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "No devices found",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "Tap 'Scan for Devices' to discover nearby ESP32 bins",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    )
                }
            }
        } else {
            Text(
                "Discovered Devices (${state.scannedDevices.size})",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.scannedDevices) { device ->
                    DeviceCard(
                        device = device,
                        onClick = { viewModel.selectDevice(device) },
                        enabled = !state.isConnecting,
                    )
                }
            }
        }
    }

    // Config dialog
    if (state.showConfigDialog) {
        ConfigDialog(
            state = state,
            onDismiss = { viewModel.dismissConfigDialog() },
            onProvision = { viewModel.provisionDevice() },
            onWifiSsidChange = { viewModel.updateWifiSsid(it) },
            onWifiPasswordChange = { viewModel.updateWifiPassword(it) },
            onDeviceCodeChange = { viewModel.updateDeviceCode(it) },
            onApiUrlChange = { viewModel.updateApiUrl(it) },
            onIntervalChange = { viewModel.updateReportInterval(it) },
            onBinHeightChange = { viewModel.updateBinHeight(it) },
        )
    }
}

@Composable
private fun DeviceCard(
    device: ScannedDevice,
    onClick: () -> Unit,
    enabled: Boolean,
) {
    Card(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.Bluetooth,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    device.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    device.address,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Signal indicator
            val signalIcon = when {
                device.rssi > -60 -> Icons.Filled.SignalWifi4Bar
                device.rssi > -70 -> Icons.Filled.NetworkWifi3Bar
                device.rssi > -80 -> Icons.Filled.NetworkWifi2Bar
                else -> Icons.Filled.NetworkWifi1Bar
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    signalIcon,
                    contentDescription = "Signal strength",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    "${device.rssi} dBm",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConfigDialog(
    state: ProvisioningUiState,
    onDismiss: () -> Unit,
    onProvision: () -> Unit,
    onWifiSsidChange: (String) -> Unit,
    onWifiPasswordChange: (String) -> Unit,
    onDeviceCodeChange: (String) -> Unit,
    onApiUrlChange: (String) -> Unit,
    onIntervalChange: (Int) -> Unit,
    onBinHeightChange: (Float) -> Unit,
) {
    var passwordVisible by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!state.isWritingConfig) onDismiss() },
        title = {
            Text("Configure Device")
        },
        text = {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Device status
                state.deviceStatus?.let { status ->
                    item {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            ),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text("Device Info", style = MaterialTheme.typography.labelMedium)
                                Text("Firmware: ${status.firmwareVersion}", style = MaterialTheme.typography.bodySmall)
                                Text("Battery: ${status.batteryVoltage}V", style = MaterialTheme.typography.bodySmall)
                                Text(
                                    "Status: ${if (status.isConfigured) "Configured" else "Not configured"}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }

                // WiFi SSID
                item {
                    OutlinedTextField(
                        value = state.wifiSsid,
                        onValueChange = onWifiSsidChange,
                        label = { Text("WiFi SSID") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = { Icon(Icons.Filled.Wifi, contentDescription = null) },
                    )
                }

                // WiFi Password
                item {
                    OutlinedTextField(
                        value = state.wifiPassword,
                        onValueChange = onWifiPasswordChange,
                        label = { Text("WiFi Password") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                    contentDescription = "Toggle password",
                                )
                            }
                        },
                    )
                }

                // Device Code
                item {
                    OutlinedTextField(
                        value = state.deviceCode,
                        onValueChange = onDeviceCodeChange,
                        label = { Text("Device Code") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = { Icon(Icons.Filled.QrCode, contentDescription = null) },
                    )
                }

                // API URL
                item {
                    OutlinedTextField(
                        value = state.apiUrl,
                        onValueChange = onApiUrlChange,
                        label = { Text("API Endpoint URL") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = { Icon(Icons.Filled.Cloud, contentDescription = null) },
                    )
                }

                // Report Interval
                item {
                    val intervals = listOf(
                        300 to "5 minutes",
                        600 to "10 minutes",
                        900 to "15 minutes",
                        1800 to "30 minutes",
                        3600 to "1 hour",
                    )
                    var expanded by remember { mutableStateOf(false) }

                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = !expanded },
                    ) {
                        OutlinedTextField(
                            value = intervals.find { it.first == state.reportIntervalSec }?.second ?: "${state.reportIntervalSec}s",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Report Interval") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(),
                            leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                        )
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                        ) {
                            intervals.forEach { (seconds, label) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = {
                                        onIntervalChange(seconds)
                                        expanded = false
                                    },
                                )
                            }
                        }
                    }
                }

                // Bin Height
                item {
                    OutlinedTextField(
                        value = state.binHeightCm.toInt().toString(),
                        onValueChange = { it.toFloatOrNull()?.let(onBinHeightChange) },
                        label = { Text("Bin Height (cm)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = { Icon(Icons.Filled.Straighten, contentDescription = null) },
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onProvision,
                enabled = !state.isWritingConfig &&
                    state.wifiSsid.isNotBlank() &&
                    state.deviceCode.isNotBlank() &&
                    state.apiUrl.isNotBlank(),
            ) {
                if (state.isWritingConfig) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text("Provision Device")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !state.isWritingConfig,
            ) {
                Text("Cancel")
            }
        },
    )
}
