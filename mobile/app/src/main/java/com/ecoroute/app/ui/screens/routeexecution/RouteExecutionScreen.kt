package com.ecoroute.app.ui.screens.routeexecution

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.data.model.CollectionRoute
import com.ecoroute.app.data.model.RouteStop
import com.ecoroute.app.ui.components.*
import com.ecoroute.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteExecutionScreen(
    onNavigateBack: () -> Unit,
    viewModel: RouteExecutionViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // Show success/error messages via snackbar
    LaunchedEffect(state.successMessage, state.error) {
        state.successMessage?.let {
            snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Short)
            viewModel.clearMessages()
        }
        state.error?.let {
            snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Long)
            viewModel.clearMessages()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (state.route != null) "Route ${state.route!!.id.take(8)}"
                        else "Route Execution",
                    )
                },
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
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            when {
                state.isLoading -> LoadingState()
                state.route == null -> ErrorState(
                    state.error ?: "Route not found",
                    onRetry = { viewModel.loadRouteDetails() },
                )
                else -> RouteExecutionContent(
                    route = state.route!!,
                    stops = state.stops,
                    currentStopIndex = state.currentStopIndex,
                    actionInProgress = state.actionInProgress,
                    onStartRoute = { viewModel.startRoute() },
                    onCompleteRoute = { viewModel.completeRoute() },
                    onArriveAtStop = { viewModel.arriveAtStop(it) },
                    onServiceStop = { stopId, notes, photoUri ->
                        viewModel.serviceStop(stopId, notes, photoUri)
                    },
                    onSkipStop = { stopId, reason -> viewModel.skipStop(stopId, reason) },
                    onReportIssue = { stopId, description, severity ->
                        viewModel.reportIssue(stopId, description, severity)
                    },
                )
            }
        }
    }
}

@Composable
private fun RouteExecutionContent(
    route: CollectionRoute,
    stops: List<RouteStop>,
    currentStopIndex: Int,
    actionInProgress: String?,
    onStartRoute: () -> Unit,
    onCompleteRoute: () -> Unit,
    onArriveAtStop: (String) -> Unit,
    onServiceStop: (String, String?, String?) -> Unit,
    onSkipStop: (String, String) -> Unit,
    onReportIssue: (String, String, String) -> Unit,
) {
    val servicedCount = stops.count { it.status == "serviced" }
    val skippedCount = stops.count { it.status == "skipped" }
    val completedCount = servicedCount + skippedCount
    val progress = if (stops.isNotEmpty()) completedCount.toFloat() / stops.size else 0f

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Route header
        item {
            RouteHeaderCard(
                route = route,
                progress = progress,
                servicedCount = servicedCount,
                skippedCount = skippedCount,
                totalStops = stops.size,
            )
        }

        // Start / Complete route action
        item {
            RouteActionButton(
                route = route,
                stops = stops,
                actionInProgress = actionInProgress,
                onStartRoute = onStartRoute,
                onCompleteRoute = onCompleteRoute,
            )
        }

        // Stops section header
        item {
            SectionHeader(
                title = "Collection Stops (${stops.size})",
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        // Stop cards
        itemsIndexed(stops, key = { _, stop -> stop.id }) { index, stop ->
            StopCard(
                stop = stop,
                isCurrentStop = index == currentStopIndex,
                isRouteActive = route.status == "in_progress",
                actionInProgress = actionInProgress,
                onArrive = { onArriveAtStop(stop.id) },
                onService = { notes, photoUri -> onServiceStop(stop.id, notes, photoUri) },
                onSkip = { reason -> onSkipStop(stop.id, reason) },
                onReportIssue = { description, severity ->
                    onReportIssue(stop.id, description, severity)
                },
            )
        }

        // Bottom padding
        item { Spacer(Modifier.height(16.dp)) }
    }
}

// ── Route Header ────────────────────────────────────────────────────

@Composable
private fun RouteHeaderCard(
    route: CollectionRoute,
    progress: Float,
    servicedCount: Int,
    skippedCount: Int,
    totalStops: Int,
) {
    val (statusColor, statusBg) = statusColors(route.status)

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Route ${route.id.take(8)}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                StatusBadge(text = route.status, color = statusColor, backgroundColor = statusBg)
            }

            Spacer(Modifier.height(12.dp))

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                HeaderMetric(
                    label = "Scheduled",
                    value = route.scheduledDate?.take(10) ?: "--",
                )
                HeaderMetric(
                    label = "Distance",
                    value = route.estimatedDistanceKm?.let { "%.1f km".format(it) } ?: "--",
                )
                HeaderMetric(
                    label = "Duration",
                    value = route.estimatedDurationMinutes?.let { "%.0f min".format(it) } ?: "--",
                )
            }

            Spacer(Modifier.height(16.dp))

            // Progress section
            Text(
                "Progress: $servicedCount serviced, $skippedCount skipped / $totalStops total",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
                color = Green600,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "${(progress * 100).toInt()}% complete",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.End,
            )
        }
    }
}

@Composable
private fun HeaderMetric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ── Route Action Button ─────────────────────────────────────────────

@Composable
private fun RouteActionButton(
    route: CollectionRoute,
    stops: List<RouteStop>,
    actionInProgress: String?,
    onStartRoute: () -> Unit,
    onCompleteRoute: () -> Unit,
) {
    val allStopsHandled = stops.isNotEmpty() && stops.all {
        it.status == "serviced" || it.status == "skipped"
    }

    when (route.status) {
        "planned", "pending" -> {
            Button(
                onClick = onStartRoute,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = actionInProgress == null,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Green600,
                ),
                shape = RoundedCornerShape(12.dp),
            ) {
                if (actionInProgress == "starting") {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(12.dp))
                }
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(
                    "Start Route",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        "in_progress" -> {
            Button(
                onClick = onCompleteRoute,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = actionInProgress == null && allStopsHandled,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Blue500,
                ),
                shape = RoundedCornerShape(12.dp),
            ) {
                if (actionInProgress == "completing") {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(12.dp))
                }
                Icon(Icons.Filled.CheckCircle, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(
                    if (allStopsHandled) "Complete Route" else "Complete All Stops First",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        "completed" -> {
            Card(
                colors = CardDefaults.cardColors(containerColor = Green50),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = Green600,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Route Completed",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = Green600,
                    )
                }
            }
        }
    }
}

// ── Stop Card ───────────────────────────────────────────────────────

@Composable
private fun StopCard(
    stop: RouteStop,
    isCurrentStop: Boolean,
    isRouteActive: Boolean,
    actionInProgress: String?,
    onArrive: () -> Unit,
    onService: (String?, String?) -> Unit,
    onSkip: (String) -> Unit,
    onReportIssue: (String, String) -> Unit,
) {
    val (statusColor, statusBg) = statusColors(stop.status)
    val backgroundColor by animateColorAsState(
        targetValue = when {
            isCurrentStop && isRouteActive -> Blue50
            stop.status == "serviced" -> Green50.copy(alpha = 0.5f)
            stop.status == "skipped" -> Slate50
            else -> MaterialTheme.colorScheme.surface
        },
        label = "stopBg",
    )

    var showSkipDialog by remember { mutableStateOf(false) }
    var showIssueDialog by remember { mutableStateOf(false) }
    var notesText by remember(stop.id) { mutableStateOf(stop.notes ?: "") }
    var isExpanded by remember(stop.id) { mutableStateOf(isCurrentStop) }

    Card(
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isCurrentStop && isRouteActive) 3.dp else 1.dp,
        ),
        border = if (isCurrentStop && isRouteActive) {
            CardDefaults.outlinedCardBorder().copy(
                brush = androidx.compose.ui.graphics.SolidColor(Blue500),
            )
        } else null,
    ) {
        Column(Modifier.padding(16.dp)) {
            // Stop header row
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Sequence number badge
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (isCurrentStop && isRouteActive)
                        Blue500 else MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(40.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            "${stop.sequenceOrder}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (isCurrentStop && isRouteActive)
                                White else MaterialTheme.colorScheme.primary,
                        )
                    }
                }

                // Device info
                Column(Modifier.weight(1f)) {
                    Text(
                        stop.deviceCode ?: "Bin ${stop.deviceId.take(8)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (stop.latitude != null && stop.longitude != null) {
                        Text(
                            "%.4f, %.4f".format(stop.latitude, stop.longitude),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // Status chip
                StatusBadge(text = stop.status, color = statusColor, backgroundColor = statusBg)
            }

            // Current stop indicator
            if (isCurrentStop && isRouteActive) {
                Spacer(Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = Blue500.copy(alpha = 0.1f),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            Icons.Filled.Navigation,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = Blue500,
                        )
                        Text(
                            "Current Stop",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = Blue500,
                        )
                    }
                }
            }

            // Action buttons -- only show when route is active and stop is actionable
            if (isRouteActive && (stop.status == "pending" || stop.status == "arrived")) {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(12.dp))

                when (stop.status) {
                    "pending" -> {
                        // Arrive button
                        Button(
                            onClick = onArrive,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            enabled = actionInProgress == null,
                            colors = ButtonDefaults.buttonColors(containerColor = Blue500),
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            if (actionInProgress == "arriving_${stop.id}") {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(Modifier.width(8.dp))
                            }
                            Icon(
                                Icons.Filled.LocationOn,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Mark Arrived",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }

                        Spacer(Modifier.height(8.dp))

                        // Skip button
                        OutlinedButton(
                            onClick = { showSkipDialog = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            enabled = actionInProgress == null,
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            Icon(
                                Icons.Filled.SkipNext,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Skip Stop",
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                    "arrived" -> {
                        // Notes field
                        OutlinedTextField(
                            value = notesText,
                            onValueChange = { notesText = it },
                            label = { Text("Service Notes (optional)") },
                            modifier = Modifier.fillMaxWidth(),
                            maxLines = 3,
                            shape = RoundedCornerShape(10.dp),
                        )

                        Spacer(Modifier.height(12.dp))

                        // Complete service button
                        Button(
                            onClick = { onService(notesText, null) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            enabled = actionInProgress == null,
                            colors = ButtonDefaults.buttonColors(containerColor = Green600),
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            if (actionInProgress == "servicing_${stop.id}") {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(Modifier.width(8.dp))
                            }
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Complete Service",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }

                        Spacer(Modifier.height(8.dp))

                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            // Skip button
                            OutlinedButton(
                                onClick = { showSkipDialog = true },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp),
                                enabled = actionInProgress == null,
                                shape = RoundedCornerShape(10.dp),
                            ) {
                                Icon(
                                    Icons.Filled.SkipNext,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text("Skip", style = MaterialTheme.typography.labelLarge)
                            }

                            // Report issue button
                            OutlinedButton(
                                onClick = { showIssueDialog = true },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp),
                                enabled = actionInProgress == null,
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Orange500,
                                ),
                                shape = RoundedCornerShape(10.dp),
                            ) {
                                Icon(
                                    Icons.Filled.Warning,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text("Issue", style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    }
                }
            }

            // Show serviced/skipped details
            if (stop.status == "serviced" || stop.status == "skipped") {
                if (!stop.notes.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Filled.Notes,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            stop.notes,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (stop.servicedAt != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Serviced: ${timeAgo(stop.servicedAt)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    // Skip dialog
    if (showSkipDialog) {
        SkipReasonDialog(
            onDismiss = { showSkipDialog = false },
            onConfirm = { reason ->
                onSkip(reason)
                showSkipDialog = false
            },
        )
    }

    // Issue dialog
    if (showIssueDialog) {
        IssueReportDialog(
            onDismiss = { showIssueDialog = false },
            onConfirm = { description, severity ->
                onReportIssue(description, severity)
                showIssueDialog = false
            },
        )
    }
}

// ── Skip Reason Dialog ──────────────────────────────────────────────

@Composable
private fun SkipReasonDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var reason by remember { mutableStateOf("") }
    val presetReasons = listOf(
        "Bin inaccessible",
        "Road blocked",
        "Bin not found",
        "Safety concern",
        "Already emptied",
    )
    var selectedPreset by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Skip Stop", fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Select or type a reason for skipping:",
                    style = MaterialTheme.typography.bodyMedium,
                )

                presetReasons.forEach { preset ->
                    FilterChip(
                        selected = selectedPreset == preset,
                        onClick = {
                            selectedPreset = preset
                            reason = preset
                        },
                        label = { Text(preset) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                OutlinedTextField(
                    value = reason,
                    onValueChange = {
                        reason = it
                        selectedPreset = null
                    },
                    label = { Text("Custom reason") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 2,
                    shape = RoundedCornerShape(10.dp),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(reason) },
                enabled = reason.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Orange500),
            ) {
                Text("Skip Stop")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

// ── Issue Report Dialog ─────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IssueReportDialog(
    onDismiss: () -> Unit,
    onConfirm: (description: String, severity: String) -> Unit,
) {
    var description by remember { mutableStateOf("") }
    var severity by remember { mutableStateOf("medium") }
    var severityExpanded by remember { mutableStateOf(false) }
    val severityOptions = listOf("low", "medium", "high", "critical")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Report Issue", fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Severity dropdown
                Text(
                    "Severity",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                )
                ExposedDropdownMenuBox(
                    expanded = severityExpanded,
                    onExpandedChange = { severityExpanded = it },
                ) {
                    OutlinedTextField(
                        value = severity.replaceFirstChar { it.uppercase() },
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = severityExpanded)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        shape = RoundedCornerShape(10.dp),
                    )
                    ExposedDropdownMenu(
                        expanded = severityExpanded,
                        onDismissRequest = { severityExpanded = false },
                    ) {
                        severityOptions.forEach { option ->
                            val (color, _) = statusColors(option)
                            DropdownMenuItem(
                                text = {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Surface(
                                            shape = RoundedCornerShape(50),
                                            color = color,
                                            modifier = Modifier.size(8.dp),
                                        ) {}
                                        Text(option.replaceFirstChar { it.uppercase() })
                                    }
                                },
                                onClick = {
                                    severity = option
                                    severityExpanded = false
                                },
                            )
                        }
                    }
                }

                // Description field
                Text(
                    "Description",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Describe the issue") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 4,
                    minLines = 2,
                    shape = RoundedCornerShape(10.dp),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(description, severity) },
                enabled = description.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Orange500),
            ) {
                Text("Submit Report")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}
