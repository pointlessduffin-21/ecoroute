package com.ecoroute.app.ui.screens.bins

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.data.model.CreateBinRequest
import com.ecoroute.app.data.model.SmartBin
import com.ecoroute.app.data.model.BinTelemetry
import com.ecoroute.app.ui.components.*
import com.ecoroute.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BinsScreen(
    onBinClick: (String) -> Unit = {},
    viewModel: BinsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showAddDialog by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // Search bar
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = { viewModel.setSearchQuery(it) },
                placeholder = { Text("Search by device code...") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                shape = MaterialTheme.shapes.medium,
            )

            // Status filter chips
            FilterChipRow(
                options = listOf("all", "active", "inactive", "maintenance", "offline"),
                selected = state.statusFilter,
                onSelect = { viewModel.setStatusFilter(it) },
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 8.dp),
            )

            when {
                state.isLoading -> LoadingState()
                state.error != null -> ErrorState(state.error!!, onRetry = { viewModel.loadBins() })
                else -> {
                    val bins = state.bins.filter { bin ->
                        state.searchQuery.isBlank() ||
                            bin.deviceCode.contains(state.searchQuery, ignoreCase = true)
                    }

                    if (bins.isEmpty()) {
                        EmptyState(
                            icon = Icons.Filled.Delete,
                            title = "No bins found",
                            subtitle = "Try adjusting your search or filters",
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items(bins, key = { it.id }) { bin ->
                                BinCard(bin, state.telemetryMap[bin.id], onClick = { onBinClick(bin.id) })
                            }
                            item { Spacer(Modifier.height(72.dp)) }
                        }
                    }
                }
            }
        }

        // FAB
        FloatingActionButton(
            onClick = { showAddDialog = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            containerColor = MaterialTheme.colorScheme.primary,
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add Bin")
        }
    }

    if (showAddDialog) {
        AddBinDialog(
            isCreating = state.isCreating,
            error = state.createError,
            onDismiss = { showAddDialog = false },
            onCreate = { request ->
                viewModel.createBin(request)
                showAddDialog = false
            },
        )
    }
}

@Composable
private fun BinCard(bin: SmartBin, telemetry: BinTelemetry?, onClick: () -> Unit = {}) {
    val (statusColor, statusBg) = statusColors(bin.status)
    val fillLevel = telemetry?.fillLevelPercent ?: 0.0

    Card(
        onClick = onClick,
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
                    bin.deviceCode,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                StatusBadge(text = bin.status, color = statusColor, backgroundColor = statusBg)
            }

            Spacer(Modifier.height(12.dp))

            // Fill level
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Fill Level", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("%.0f%%".format(fillLevel), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.height(4.dp))
            FillLevelBar(fillLevel)

            Spacer(Modifier.height(12.dp))

            // Details row
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                DetailItem(Icons.Filled.Straighten, "${bin.capacityLiters}L")
                DetailItem(
                    Icons.Filled.Battery5Bar,
                    telemetry?.batteryVoltage?.let { "%.1fV".format(it) } ?: "—",
                )
                DetailItem(
                    Icons.Filled.SignalCellularAlt,
                    telemetry?.signalStrength?.let {
                        when {
                            it > -70 -> "Good"
                            it > -90 -> "Fair"
                            else -> "Weak"
                        }
                    } ?: "—",
                )
            }

            Spacer(Modifier.height(8.dp))

            // Location
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.LocationOn,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    "%.5f, %.5f".format(bin.latitude, bin.longitude),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    timeAgo(bin.lastSeenAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DetailItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(4.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AddBinDialog(
    isCreating: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onCreate: (CreateBinRequest) -> Unit,
) {
    var deviceCode by remember { mutableStateOf("") }
    var latitude by remember { mutableStateOf("") }
    var longitude by remember { mutableStateOf("") }
    var capacity by remember { mutableStateOf("120") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Smart Bin") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (error != null) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedTextField(
                    value = deviceCode,
                    onValueChange = { deviceCode = it },
                    label = { Text("Device Code") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = latitude,
                    onValueChange = { latitude = it },
                    label = { Text("Latitude") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = longitude,
                    onValueChange = { longitude = it },
                    label = { Text("Longitude") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = capacity,
                    onValueChange = { capacity = it },
                    label = { Text("Capacity (Liters)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val lat = latitude.toDoubleOrNull() ?: return@Button
                    val lng = longitude.toDoubleOrNull() ?: return@Button
                    val cap = capacity.toIntOrNull() ?: return@Button
                    onCreate(
                        CreateBinRequest(
                            deviceCode = deviceCode.trim(),
                            subdivisionId = "",
                            latitude = lat,
                            longitude = lng,
                            capacityLiters = cap,
                        )
                    )
                },
                enabled = deviceCode.isNotBlank() && latitude.isNotBlank() && longitude.isNotBlank() && !isCreating,
            ) {
                if (isCreating) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Text("Create")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
