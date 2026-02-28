package com.ecoroute.app.ui.screens.alerts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.data.model.Alert
import com.ecoroute.app.ui.components.*
import com.ecoroute.app.ui.theme.*

@Composable
fun AlertsScreen(viewModel: AlertsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize()) {
        // Alert type stat cards
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AlertStatChip(
                label = "Overflow",
                count = state.alerts.count { it.alertType == "overflow" && !it.isAcknowledged },
                color = Red500,
                bg = Red50,
                modifier = Modifier.weight(1f),
            )
            AlertStatChip(
                label = "Battery",
                count = state.alerts.count { it.alertType == "low_battery" && !it.isAcknowledged },
                color = Orange500,
                bg = Orange50,
                modifier = Modifier.weight(1f),
            )
            AlertStatChip(
                label = "Sensor",
                count = state.alerts.count { it.alertType == "sensor_anomaly" && !it.isAcknowledged },
                color = Yellow500,
                bg = Yellow50,
                modifier = Modifier.weight(1f),
            )
            AlertStatChip(
                label = "Offline",
                count = state.alerts.count { it.alertType == "offline" && !it.isAcknowledged },
                color = Slate500,
                bg = Slate50,
                modifier = Modifier.weight(1f),
            )
        }

        // Filters
        FilterChipRow(
            options = listOf("all", "overflow", "low_battery", "sensor_anomaly", "offline"),
            selected = state.typeFilter,
            onSelect = { viewModel.setTypeFilter(it) },
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )

        when {
            state.isLoading -> LoadingState()
            state.error != null -> ErrorState(state.error!!, onRetry = { viewModel.loadAlerts() })
            state.alerts.isEmpty() -> EmptyState(
                icon = Icons.Filled.CheckCircle,
                title = "No alerts",
                subtitle = "All systems are operating normally",
            )
            else -> {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.alerts, key = { it.id }) { alert ->
                        AlertCard(alert, onAcknowledge = { viewModel.acknowledgeAlert(alert.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun AlertStatChip(
    label: String,
    count: Int,
    color: androidx.compose.ui.graphics.Color,
    bg: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = bg,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                count.toString(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color,
            )
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = color.copy(alpha = 0.8f),
            )
        }
    }
}

@Composable
private fun AlertCard(alert: Alert, onAcknowledge: () -> Unit) {
    val alertIcon = when (alert.alertType) {
        "overflow" -> Icons.Filled.Warning
        "low_battery" -> Icons.Filled.BatteryAlert
        "sensor_anomaly" -> Icons.Filled.Sensors
        "offline" -> Icons.Filled.WifiOff
        else -> Icons.Filled.Info
    }
    val (severityColor, severityBg) = statusColors(alert.severity)
    val (typeColor, typeBg) = statusColors(alert.alertType)

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                shape = MaterialTheme.shapes.small,
                color = typeBg,
                modifier = Modifier.size(40.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(alertIcon, contentDescription = null, tint = typeColor, modifier = Modifier.size(20.dp))
                }
            }

            Column(Modifier.weight(1f)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        alert.alertType.replace("_", " ").replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    StatusBadge(text = alert.severity, color = severityColor, backgroundColor = severityBg)
                }

                Spacer(Modifier.height(4.dp))

                Text(
                    alert.message ?: "Alert triggered",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(Modifier.height(8.dp))

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        timeAgo(alert.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    if (!alert.isAcknowledged) {
                        OutlinedButton(
                            onClick = onAcknowledge,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                        ) {
                            Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Acknowledge", style = MaterialTheme.typography.labelSmall)
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = Green600,
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                "Acknowledged",
                                style = MaterialTheme.typography.labelSmall,
                                color = Green600,
                            )
                        }
                    }
                }
            }
        }
    }
}
