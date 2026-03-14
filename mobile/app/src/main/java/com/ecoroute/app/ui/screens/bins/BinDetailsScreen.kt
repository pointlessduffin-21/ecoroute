package com.ecoroute.app.ui.screens.bins

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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.data.model.BinTelemetry
import com.ecoroute.app.data.model.SmartBin
import com.ecoroute.app.ui.components.*
import com.ecoroute.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BinDetailsScreen(
    onNavigateBack: () -> Unit,
    viewModel: BinDetailsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.bin?.deviceCode ?: "Bin Details") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            when {
                state.isLoading -> LoadingState()
                state.error != null -> ErrorState(state.error!!, onRetry = { viewModel.loadBinDetails() })
                state.bin != null -> BinDetailsContent(state.bin!!, state.latestTelemetry, state.telemetryHistory)
            }
        }
    }
}

@Composable
private fun BinDetailsContent(
    bin: SmartBin,
    latest: BinTelemetry?,
    history: List<BinTelemetry>,
) {
    val fill = latest?.fillLevelPercent ?: 0.0
    val (statusColor, statusBg) = statusColors(bin.status)

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Header with status
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        bin.deviceCode,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "%.4f, %.4f".format(bin.latitude, bin.longitude),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(text = bin.status, color = statusColor, backgroundColor = statusBg)
            }
        }

        // Stat cards row
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatCard(
                    modifier = Modifier.weight(1f),
                    label = "Fill Level",
                    value = "%.1f%%".format(fill),
                    icon = Icons.Filled.WaterDrop,
                    fillLevel = fill,
                )
                StatCard(
                    modifier = Modifier.weight(1f),
                    label = "Battery",
                    value = latest?.batteryVoltage?.let { "%.2fV".format(it) } ?: "N/A",
                    icon = Icons.Filled.Battery5Bar,
                    subtitle = if (latest?.batteryVoltage != null && latest.batteryVoltage >= 3.6) "Healthy" else if (latest?.batteryVoltage != null) "Low" else null,
                )
            }
        }

        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatCard(
                    modifier = Modifier.weight(1f),
                    label = "Signal",
                    value = latest?.signalStrength?.let { "$it dBm" } ?: "N/A",
                    icon = Icons.Filled.SignalCellularAlt,
                    subtitle = latest?.signalStrength?.let {
                        when {
                            it >= -70 -> "Good"
                            it >= -85 -> "Fair"
                            else -> "Weak"
                        }
                    },
                )
                StatCard(
                    modifier = Modifier.weight(1f),
                    label = "Distance",
                    value = latest?.distanceCm?.let { "%.1f cm".format(it) } ?: "N/A",
                    icon = Icons.Filled.Straighten,
                    subtitle = "${bin.capacityLiters}L capacity",
                )
            }
        }

        // Fill Level History Chart
        item {
            SectionHeader("Fill Level History")
        }

        item {
            if (history.isNotEmpty()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        val chartData = history.reversed().map { t ->
                            val time = try {
                                val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
                                val date = sdf.parse(t.recordedAt.take(19))
                                SimpleDateFormat("HH:mm", Locale.US).format(date ?: Date())
                            } catch (_: Exception) {
                                t.recordedAt.takeLast(8).take(5)
                            }
                            BarChartData(
                                label = time,
                                value = t.fillLevelPercent.toFloat(),
                                color = when {
                                    t.fillLevelPercent > 80 -> Red500
                                    t.fillLevelPercent >= 50 -> Yellow500
                                    else -> Green600
                                },
                            )
                        }.takeLast(10)

                        SimpleBarChart(data = chartData)
                    }
                }
            } else {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "No telemetry data yet",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // Device Info
        item {
            SectionHeader("Device Info")
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    InfoRow(Icons.Filled.Memory, "Firmware", bin.firmwareVersion ?: "Unknown")
                    InfoRow(Icons.Filled.Router, "MQTT Topic", "ecoroute/trash_can/${bin.deviceCode}")
                    InfoRow(Icons.Filled.LocationOn, "Coordinates", "%.6f, %.6f".format(bin.latitude, bin.longitude))
                    InfoRow(Icons.Filled.Delete, "Capacity", "${bin.capacityLiters}L (threshold: ${bin.thresholdPercent}%)")
                    if (bin.lastSeenAt != null) {
                        InfoRow(Icons.Filled.Schedule, "Last Seen", timeAgo(bin.lastSeenAt))
                    }
                }
            }
        }

        // Recent Telemetry Table
        item {
            SectionHeader("Recent Telemetry")
        }

        if (history.isEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "No telemetry data yet",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else {
            items(history.take(10)) { t ->
                TelemetryRow(t)
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun StatCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    icon: ImageVector,
    subtitle: String? = null,
    fillLevel: Double? = null,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            if (fillLevel != null) {
                Spacer(Modifier.height(6.dp))
                FillLevelBar(fillLevel)
            }
            if (subtitle != null) {
                Spacer(Modifier.height(2.dp))
                Text(
                    subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun InfoRow(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(8.dp))
        Text(
            "$label: ",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun TelemetryRow(t: BinTelemetry) {
    val time = try {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        val date = sdf.parse(t.recordedAt.take(19))
        SimpleDateFormat("MMM d, HH:mm", Locale.US).format(date ?: Date())
    } catch (_: Exception) {
        t.recordedAt
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.5.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                time,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "%.0f%%".format(t.fillLevelPercent),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                t.distanceCm?.let { "%.1fcm".format(it) } ?: "—",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                t.batteryVoltage?.let { "%.2fV".format(it) } ?: "—",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                t.signalStrength?.let { "${it}dBm" } ?: "—",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
