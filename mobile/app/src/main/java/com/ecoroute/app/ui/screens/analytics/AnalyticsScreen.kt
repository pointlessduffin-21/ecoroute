package com.ecoroute.app.ui.screens.analytics

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
fun AnalyticsScreen(viewModel: AnalyticsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    when {
        state.isLoading -> LoadingState()
        state.error != null -> ErrorState(state.error!!, onRetry = { viewModel.loadAnalytics() })
        else -> AnalyticsContent(state)
    }
}

@Composable
private fun AnalyticsContent(state: AnalyticsUiState) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Collection History Chart
        item {
            SectionHeader("Collection Performance (7 Days)")
        }

        item {
            if (state.collectionHistory.isNotEmpty()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        SimpleBarChart(
                            data = state.collectionHistory.takeLast(7).map { entry ->
                                BarChartData(
                                    label = entry.collectionDate.takeLast(5),
                                    value = entry.routesCompleted.toFloat(),
                                    color = Green600,
                                )
                            },
                        )
                    }
                }
            } else {
                EmptyState(
                    icon = Icons.Filled.BarChart,
                    title = "No collection data",
                    subtitle = "Data will appear once routes are completed",
                )
            }
        }

        // Bins Serviced Chart
        item {
            SectionHeader("Bins Serviced (7 Days)")
        }

        item {
            if (state.collectionHistory.isNotEmpty()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        SimpleBarChart(
                            data = state.collectionHistory.takeLast(7).map { entry ->
                                BarChartData(
                                    label = entry.collectionDate.takeLast(5),
                                    value = entry.binsServiced.toFloat(),
                                    color = Blue500,
                                )
                            },
                        )
                    }
                }
            }
        }

        // Fill Level Distribution Donut
        item {
            SectionHeader("Fill Level Distribution")
        }

        item {
            val dist = state.fillDistribution?.distribution
            if (dist != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Row(
                        Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val chartData = listOf(
                            DonutChartData("Empty", dist.empty.toFloat(), Green600),
                            DonutChartData("Low", dist.low.toFloat(), Green600.copy(alpha = 0.6f)),
                            DonutChartData("Medium", dist.medium.toFloat(), Yellow500),
                            DonutChartData("High", dist.high.toFloat(), Orange500),
                            DonutChartData("Critical", dist.critical.toFloat(), Red500),
                        )

                        SimpleDonutChart(
                            data = chartData,
                            modifier = Modifier
                                .weight(1f)
                                .height(160.dp),
                        )

                        ChartLegend(
                            items = chartData,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }

        // Driver Performance Table
        item {
            SectionHeader("Driver Performance")
        }

        if (state.driverPerformance.isEmpty()) {
            item {
                EmptyState(
                    icon = Icons.Filled.People,
                    title = "No driver data",
                    subtitle = "Performance data will appear once routes are assigned",
                )
            }
        } else {
            itemsIndexed(state.driverPerformance) { index, driver ->
                DriverPerformanceCard(rank = index + 1, driver = driver)
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun DriverPerformanceCard(rank: Int, driver: com.ecoroute.app.data.model.DriverPerformanceEntry) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Rank badge
            Surface(
                shape = MaterialTheme.shapes.small,
                color = when (rank) {
                    1 -> Yellow50
                    2 -> Slate50
                    3 -> Orange50
                    else -> MaterialTheme.colorScheme.surfaceVariant
                },
                modifier = Modifier.size(36.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        "#$rank",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = when (rank) {
                            1 -> Yellow500
                            2 -> Slate500
                            3 -> Orange500
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }

            Column(Modifier.weight(1f)) {
                Text(
                    driver.driverName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    driver.driverEmail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${driver.completedRoutes}/${driver.totalRoutes} routes",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    "%.1f km avg".format(driver.avgDistanceKm),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (driver.avgOptimizationScore > 0) {
                    Text(
                        "Score: %.0f%%".format(driver.avgOptimizationScore),
                        style = MaterialTheme.typography.labelSmall,
                        color = Green600,
                    )
                }
            }
        }
    }
}
