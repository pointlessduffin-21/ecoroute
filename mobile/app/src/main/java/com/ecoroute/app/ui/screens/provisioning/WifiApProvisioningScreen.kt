package com.ecoroute.app.ui.screens.provisioning

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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

@Composable
fun WifiApProvisioningScreen(
    viewModel: WifiApProvisioningViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        // Header
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
            ),
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    Icons.Filled.Wifi,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.size(32.dp),
                )
                Column {
                    Text(
                        "WiFi AP Provisioning",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Configure bin via its built-in WiFi hotspot",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Error banner
        state.error?.let { error ->
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
                    Icon(Icons.Filled.Error, null, tint = MaterialTheme.colorScheme.error)
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
            Spacer(Modifier.height(12.dp))
        }

        when (state.step) {
            WifiApStep.INSTRUCTIONS -> InstructionsStep(
                isLoading = state.isLoading,
                onConnect = { viewModel.connectToDevice() },
            )

            WifiApStep.CONFIGURE -> ConfigureStep(
                state = state,
                onWifiSsidChange = { viewModel.updateWifiSsid(it) },
                onWifiPasswordChange = { viewModel.updateWifiPassword(it) },
                onDeviceCodeChange = { viewModel.updateDeviceCode(it) },
                onApiUrlChange = { viewModel.updateApiUrl(it) },
                onIntervalChange = { viewModel.updateReportInterval(it) },
                onBinHeightChange = { viewModel.updateBinHeight(it) },
                onProvision = { viewModel.provisionDevice() },
            )

            WifiApStep.DONE -> DoneStep(
                onReset = { viewModel.reset() },
            )
        }
    }
}

// ─── Step 1: Instructions ─────────────────────────────────────────────────────

@Composable
private fun InstructionsStep(
    isLoading: Boolean,
    onConnect: () -> Unit,
) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text(
                "How to connect",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
        }

        item {
            val steps = listOf(
                Icons.Filled.Power to "Power on the ESP32 smart bin.",
                Icons.Filled.Wifi to "Open your phone's WiFi settings and connect to:\n\"ECO-BIN-SETUP\" (or \"ECO-BIN-xxxx\")\nPassword: ecoroute123",
                Icons.Filled.PhoneAndroid to "Return to this app and tap \"Connect to Device\" below.",
            )
            steps.forEachIndexed { i, (icon, text) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(32.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                "${i + 1}",
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                    Column {
                        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.height(4.dp))
                        Text(text, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (i < steps.size - 1) Spacer(Modifier.height(4.dp))
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Info,
                        null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        "You can also open http://192.168.4.1 in a browser to configure via the built-in web page.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        item {
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onConnect,
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading,
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Connecting...")
                } else {
                    Icon(Icons.Filled.Wifi, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Connect to Device")
                }
            }
        }
    }
}

// ─── Step 2: Config form ──────────────────────────────────────────────────────

@Composable
private fun ConfigureStep(
    state: WifiApUiState,
    onWifiSsidChange: (String) -> Unit,
    onWifiPasswordChange: (String) -> Unit,
    onDeviceCodeChange: (String) -> Unit,
    onApiUrlChange: (String) -> Unit,
    onIntervalChange: (Int) -> Unit,
    onBinHeightChange: (Float) -> Unit,
    onProvision: () -> Unit,
) {
    var passwordVisible by remember { mutableStateOf(false) }

    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        // Device status card
        state.deviceStatus?.let { status ->
            item {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("Device Info", style = MaterialTheme.typography.labelMedium)
                        Spacer(Modifier.height(4.dp))
                        Text("Firmware: ${status.firmwareVersion}", style = MaterialTheme.typography.bodySmall)
                        Text("Battery: ${status.batteryVoltage}V", style = MaterialTheme.typography.bodySmall)
                        Text(
                            "Status: ${if (status.configured) "Already configured" else "Not yet configured"}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }

        item {
            OutlinedTextField(
                value = state.wifiSsid,
                onValueChange = onWifiSsidChange,
                label = { Text("WiFi Network (SSID) *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.Wifi, null) },
            )
        }

        item {
            OutlinedTextField(
                value = state.wifiPassword,
                onValueChange = onWifiPasswordChange,
                label = { Text("WiFi Password") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.Lock, null) },
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

        item {
            OutlinedTextField(
                value = state.deviceCode,
                onValueChange = onDeviceCodeChange,
                label = { Text("Device Code *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.QrCode, null) },
            )
        }

        item {
            OutlinedTextField(
                value = state.apiUrl,
                onValueChange = onApiUrlChange,
                label = { Text("API Endpoint URL *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.Cloud, null) },
            )
        }

        // Report Interval dropdown
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
                    value = intervals.find { it.first == state.reportIntervalSec }?.second
                        ?: "${state.reportIntervalSec}s",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Report Interval") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    leadingIcon = { Icon(Icons.Filled.Schedule, null) },
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    intervals.forEach { (seconds, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = { onIntervalChange(seconds); expanded = false },
                        )
                    }
                }
            }
        }

        item {
            OutlinedTextField(
                value = state.binHeightCm.toInt().toString(),
                onValueChange = { it.toFloatOrNull()?.let(onBinHeightChange) },
                label = { Text("Bin Height (cm)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.Straighten, null) },
            )
        }

        item {
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = onProvision,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading &&
                    state.wifiSsid.isNotBlank() &&
                    state.deviceCode.isNotBlank() &&
                    state.apiUrl.isNotBlank(),
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Saving...")
                } else {
                    Icon(Icons.Filled.Save, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Save & Provision")
                }
            }
        }
    }
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

@Composable
private fun DoneStep(onReset: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.height(32.dp))
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.tertiary,
            modifier = Modifier.size(72.dp),
        )
        Text(
            "Device provisioned!",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Text(
            "The bin will restart and connect to your WiFi network. " +
                "You can reconnect your phone to your normal WiFi now.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onReset, modifier = Modifier.fillMaxWidth()) {
            Text("Provision another device")
        }
    }
}
