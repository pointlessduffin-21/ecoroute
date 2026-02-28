package com.ecoroute.app.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.ui.components.LoadingState
import com.ecoroute.app.ui.components.SectionHeader
import com.ecoroute.app.ui.theme.*

@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    // Auto-dismiss save success
    LaunchedEffect(state.saveSuccess) {
        if (state.saveSuccess) {
            kotlinx.coroutines.delay(2000)
            viewModel.clearSaveSuccess()
        }
    }

    if (state.isLoading) {
        LoadingState()
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Save success banner
        if (state.saveSuccess) {
            item {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = Green50,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Green600, modifier = Modifier.size(18.dp))
                        Text("Settings saved successfully", style = MaterialTheme.typography.bodySmall, color = Green600)
                    }
                }
            }
        }

        // ── General Settings ────────────────────────────────────────
        item { SectionHeader("General Settings") }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = state.subdivisionName,
                        onValueChange = { viewModel.updateSubdivisionName(it) },
                        label = { Text("Subdivision Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.depotAddress,
                        onValueChange = { viewModel.updateDepotAddress(it) },
                        label = { Text("Depot Address") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Button(
                            onClick = { viewModel.saveGeneralSettings() },
                            enabled = !state.isSaving,
                        ) {
                            Icon(Icons.Filled.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Save")
                        }
                    }
                }
            }
        }

        // ── Threshold Configuration ─────────────────────────────────
        item { SectionHeader("Threshold Configuration") }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    // Fill threshold slider
                    Column {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Default Fill Threshold", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "${state.fillThreshold.toInt()}%",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = when {
                                    state.fillThreshold >= 90 -> Red500
                                    state.fillThreshold >= 70 -> Orange500
                                    else -> Green600
                                },
                            )
                        }
                        Slider(
                            value = state.fillThreshold,
                            onValueChange = { viewModel.updateFillThreshold(it) },
                            valueRange = 50f..100f,
                            steps = 9,
                            colors = SliderDefaults.colors(
                                thumbColor = MaterialTheme.colorScheme.primary,
                                activeTrackColor = MaterialTheme.colorScheme.primary,
                            ),
                        )
                        Text(
                            "Bins above this fill level will be prioritized for collection",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    HorizontalDivider()

                    // Battery threshold slider
                    Column {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Low Battery Voltage", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "%.1fV".format(state.lowBatteryVoltage),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = when {
                                    state.lowBatteryVoltage < 3.0 -> Red500
                                    state.lowBatteryVoltage < 3.5 -> Orange500
                                    else -> Green600
                                },
                            )
                        }
                        Slider(
                            value = state.lowBatteryVoltage,
                            onValueChange = { viewModel.updateLowBatteryVoltage(it) },
                            valueRange = 2.0f..4.2f,
                            steps = 21,
                            colors = SliderDefaults.colors(
                                thumbColor = MaterialTheme.colorScheme.primary,
                                activeTrackColor = MaterialTheme.colorScheme.primary,
                            ),
                        )
                        Text(
                            "Alert when battery drops below this voltage",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Button(
                            onClick = { viewModel.saveThresholdSettings() },
                            enabled = !state.isSaving,
                        ) {
                            Icon(Icons.Filled.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Save")
                        }
                    }
                }
            }
        }

        // ── Notification Preferences ────────────────────────────────
        item { SectionHeader("Notification Preferences") }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    NotificationToggle(
                        title = "Email Alerts",
                        subtitle = "Receive alerts and reports via email",
                        checked = state.emailAlerts,
                        onToggle = { viewModel.toggleEmailAlerts() },
                    )
                    HorizontalDivider()
                    NotificationToggle(
                        title = "Push Notifications",
                        subtitle = "Receive push notifications for critical alerts",
                        checked = state.pushAlerts,
                        onToggle = { viewModel.togglePushAlerts() },
                    )
                    HorizontalDivider()
                    NotificationToggle(
                        title = "SMS Alerts",
                        subtitle = "Receive critical alerts via SMS",
                        checked = state.smsAlerts,
                        onToggle = { viewModel.toggleSmsAlerts() },
                    )

                    Spacer(Modifier.height(8.dp))

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Button(
                            onClick = { viewModel.saveNotificationSettings() },
                            enabled = !state.isSaving,
                        ) {
                            Icon(Icons.Filled.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Save")
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun NotificationToggle(
    title: String,
    subtitle: String,
    checked: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(
            checked = checked,
            onCheckedChange = { onToggle() },
            colors = SwitchDefaults.colors(
                checkedTrackColor = MaterialTheme.colorScheme.primary,
            ),
        )
    }
}
