package com.ecoroute.app.ui.screens.dashboard

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
import com.ecoroute.app.ui.components.*
import com.ecoroute.app.ui.theme.*

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    when {
        state.isLoading -> LoadingState()
        state.error != null && state.stats == null -> ErrorState(state.error!!, onRetry = { viewModel.loadDashboard() })
        else -> DashboardContent(state)
    }
}

@Composable
private fun DashboardContent(state: DashboardUiState) {
    val stats = state.stats

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // KPI Cards — 2-column grid
        item {
            SectionHeader("Overview")
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                KpiCard(
                    title = "Total Bins",
                    value = stats?.totalBins?.toString() ?: "—",
                    icon = Icons.Filled.Delete,
                    iconTint = Blue500,
                    iconBackground = Blue50,
                    modifier = Modifier.weight(1f),
                )
                KpiCard(
                    title = "Active Bins",
                    value = stats?.activeBins?.toString() ?: "—",
                    icon = Icons.Filled.CheckCircle,
                    iconTint = Green600,
                    iconBackground = Green50,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                KpiCard(
                    title = "Overflow Alerts",
                    value = stats?.overflowAlerts24h?.toString() ?: "—",
                    icon = Icons.Filled.Warning,
                    iconTint = Red500,
                    iconBackground = Red50,
                    modifier = Modifier.weight(1f),
                )
                KpiCard(
                    title = "Total Routes",
                    value = stats?.totalRoutes?.toString() ?: "—",
                    icon = Icons.Filled.Route,
                    iconTint = Orange500,
                    iconBackground = Orange50,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                KpiCard(
                    title = "Completed Today",
                    value = stats?.completedRoutesToday?.toString() ?: "—",
                    icon = Icons.Filled.TaskAlt,
                    iconTint = Green600,
                    iconBackground = Green50,
                    modifier = Modifier.weight(1f),
                )
                KpiCard(
                    title = "Avg Fill Level",
                    value = stats?.avgFillLevel?.let { "%.0f%%".format(it) } ?: "—",
                    icon = Icons.Filled.BarChart,
                    iconTint = Yellow500,
                    iconBackground = Yellow50,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // Fill Level Distribution Chart
        item {
            Spacer(Modifier.height(8.dp))
            SectionHeader("Fill Level Distribution")
        }

        item {
            val dist = state.fillDistribution?.distribution
            if (dist != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    SimpleBarChart(
                        data = listOf(
                            BarChartData("Empty", dist.empty.toFloat(), Green600),
                            BarChartData("Low", dist.low.toFloat(), Green600),
                            BarChartData("Medium", dist.medium.toFloat(), Yellow500),
                            BarChartData("High", dist.high.toFloat(), Orange500),
                            BarChartData("Critical", dist.critical.toFloat(), Red500),
                        ),
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }

        // Recent Alerts
        item {
            Spacer(Modifier.height(8.dp))
            SectionHeader("Recent Alerts")
        }

        if (state.recentAlerts.isEmpty()) {
            item {
                EmptyState(
                    icon = Icons.Filled.CheckCircle,
                    title = "No recent alerts",
                    subtitle = "All systems operating normally",
                )
            }
        } else {
            items(state.recentAlerts, key = { it.id }) { alert ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val alertIcon = when (alert.alertType) {
                            "overflow" -> Icons.Filled.Warning
                            "low_battery" -> Icons.Filled.BatteryAlert
                            "sensor_anomaly" -> Icons.Filled.Sensors
                            "offline" -> Icons.Filled.WifiOff
                            else -> Icons.Filled.Info
                        }
                        val (color, bg) = statusColors(alert.severity)

                        Surface(
                            shape = MaterialTheme.shapes.small,
                            color = bg,
                            modifier = Modifier.size(36.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(alertIcon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
                            }
                        }

                        Column(Modifier.weight(1f)) {
                            Text(
                                alert.alertType.replace("_", " ").replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                            )
                            Text(
                                alert.message ?: "Alert triggered",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            StatusBadge(
                                text = alert.severity,
                                color = color,
                                backgroundColor = bg,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                timeAgo(alert.createdAt),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}
