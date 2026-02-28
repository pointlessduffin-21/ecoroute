package com.ecoroute.app.ui.screens.routes

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.data.model.CollectionRoute
import com.ecoroute.app.data.model.RouteStop
import com.ecoroute.app.ui.components.*
import com.ecoroute.app.ui.theme.*

@Composable
fun RoutesScreen(
    viewModel: RoutesViewModel = hiltViewModel(),
    onNavigateToRouteExecution: (String) -> Unit = {},
    currentUserRole: String? = null,
    currentUserId: String? = null,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    // If user is a driver, filter to their own routes
    LaunchedEffect(currentUserRole, currentUserId) {
        if (currentUserRole == "driver" && currentUserId != null) {
            viewModel.setDriverFilter(currentUserId)
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // Status filter chips
            FilterChipRow(
                options = listOf("all", "planned", "in_progress", "completed", "cancelled"),
                selected = state.statusFilter,
                onSelect = { viewModel.setStatusFilter(it) },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )

            when {
                state.isLoading -> LoadingState()
                state.error != null -> ErrorState(state.error!!, onRetry = { viewModel.loadRoutes() })
                state.routes.isEmpty() -> EmptyState(
                    icon = Icons.Filled.Route,
                    title = "No routes found",
                    subtitle = "Generate a new route to get started",
                )
                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(state.routes, key = { it.id }) { route ->
                            RouteCard(
                                route = route,
                                driverName = route.assignedDriverId?.let { state.driversMap[it] },
                                isExpanded = state.expandedRouteId == route.id,
                                stops = state.stopsMap[route.id],
                                onToggleExpand = { viewModel.toggleExpanded(route.id) },
                                onExecuteRoute = { onNavigateToRouteExecution(route.id) },
                                showExecuteButton = route.status != "completed" && route.status != "cancelled",
                            )
                        }
                        item { Spacer(Modifier.height(72.dp)) }
                    }
                }
            }
        }

        // Generate Route FAB — hide for drivers
        if (currentUserRole != "driver") {
            FloatingActionButton(
                onClick = { viewModel.generateRoute() },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp),
                containerColor = MaterialTheme.colorScheme.primary,
            ) {
                if (state.isGenerating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Filled.AutoFixHigh, contentDescription = "Generate Route")
                }
            }
        }
    }
}

@Composable
private fun RouteCard(
    route: CollectionRoute,
    driverName: String?,
    isExpanded: Boolean,
    stops: List<RouteStop>?,
    onToggleExpand: () -> Unit,
    onExecuteRoute: () -> Unit,
    showExecuteButton: Boolean,
) {
    val (statusColor, statusBg) = statusColors(route.status)

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column {
            // Header — clickable to expand
            Column(
                Modifier
                    .clickable { onToggleExpand() }
                    .padding(16.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Route ${route.id.take(8)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    StatusBadge(text = route.status, color = statusColor, backgroundColor = statusBg)
                }

                Spacer(Modifier.height(8.dp))

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            "Driver",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            driverName ?: "Unassigned",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            "Scheduled",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            route.scheduledDate?.take(10) ?: "--",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                Spacer(Modifier.height(8.dp))

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    MetricChip(
                        label = "Distance",
                        value = route.estimatedDistanceKm?.let { "%.1f km".format(it) } ?: "--",
                    )
                    MetricChip(
                        label = "Duration",
                        value = route.estimatedDurationMinutes?.let { "%.0f min".format(it) } ?: "--",
                    )
                    MetricChip(
                        label = "Score",
                        value = route.optimizationScore?.let { "%.0f%%".format(it) } ?: "--",
                    )
                }

                // Execute route button
                if (showExecuteButton) {
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = onExecuteRoute,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = when (route.status) {
                                "in_progress" -> Blue500
                                else -> Green600
                            },
                        ),
                        shape = RoundedCornerShape(10.dp),
                    ) {
                        Icon(
                            when (route.status) {
                                "in_progress" -> Icons.Filled.PlayArrow
                                else -> Icons.Filled.PlayArrow
                            },
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            when (route.status) {
                                "in_progress" -> "Continue Route"
                                else -> "Execute Route"
                            },
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                // Expand indicator
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        if (isExpanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = "Toggle stops",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            // Expanded stops
            AnimatedVisibility(visible = isExpanded) {
                if (stops == null) {
                    Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                    }
                } else if (stops.isEmpty()) {
                    Text(
                        "No stops for this route",
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                        HorizontalDivider()
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Route Stops",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(8.dp))
                        stops.sortedBy { it.sequenceOrder }.forEach { stop ->
                            StopRow(stop)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MetricChip(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun StopRow(stop: RouteStop) {
    val (color, bg) = statusColors(stop.status)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Surface(
            shape = MaterialTheme.shapes.small,
            color = MaterialTheme.colorScheme.primaryContainer,
            modifier = Modifier.size(28.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    "${stop.sequenceOrder}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
        Text(
            stop.deviceCode ?: stop.deviceId.take(8),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        StatusBadge(text = stop.status, color = color, backgroundColor = bg)
    }
}
