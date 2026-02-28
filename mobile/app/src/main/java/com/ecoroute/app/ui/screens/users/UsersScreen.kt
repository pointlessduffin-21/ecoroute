package com.ecoroute.app.ui.screens.users

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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ecoroute.app.data.model.CreateUserRequest
import com.ecoroute.app.data.model.User
import com.ecoroute.app.ui.components.*
import com.ecoroute.app.ui.theme.*

@Composable
fun UsersScreen(viewModel: UsersViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showAddDialog by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // Stat cards
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                KpiCard(
                    title = "Total",
                    value = state.users.size.toString(),
                    icon = Icons.Filled.People,
                    iconTint = Blue500,
                    iconBackground = Blue50,
                    modifier = Modifier.weight(1f),
                )
                KpiCard(
                    title = "Admins",
                    value = state.users.count { it.role == "admin" }.toString(),
                    icon = Icons.Filled.Shield,
                    iconTint = Blue500,
                    iconBackground = Blue50,
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                KpiCard(
                    title = "Dispatchers",
                    value = state.users.count { it.role == "dispatcher" }.toString(),
                    icon = Icons.Filled.Headset,
                    iconTint = Orange500,
                    iconBackground = Orange50,
                    modifier = Modifier.weight(1f),
                )
                KpiCard(
                    title = "Drivers",
                    value = state.users.count { it.role == "driver" }.toString(),
                    icon = Icons.Filled.LocalShipping,
                    iconTint = Green600,
                    iconBackground = Green50,
                    modifier = Modifier.weight(1f),
                )
            }

            // Search
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = { viewModel.setSearchQuery(it) },
                placeholder = { Text("Search users...") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                shape = MaterialTheme.shapes.medium,
            )

            // Role filter
            FilterChipRow(
                options = listOf("all", "admin", "dispatcher", "driver"),
                selected = state.roleFilter,
                onSelect = { viewModel.setRoleFilter(it) },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )

            when {
                state.isLoading -> LoadingState()
                state.error != null -> ErrorState(state.error!!, onRetry = { viewModel.loadUsers() })
                else -> {
                    val filtered = state.users.filter { user ->
                        state.searchQuery.isBlank() ||
                            user.fullName.contains(state.searchQuery, ignoreCase = true) ||
                            user.email.contains(state.searchQuery, ignoreCase = true)
                    }

                    if (filtered.isEmpty()) {
                        EmptyState(
                            icon = Icons.Filled.People,
                            title = "No users found",
                            subtitle = "Try adjusting your search or filters",
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(filtered, key = { it.id }) { user ->
                                UserCard(user)
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
            Icon(Icons.Filled.PersonAdd, contentDescription = "Add User")
        }
    }

    if (showAddDialog) {
        AddUserDialog(
            isCreating = state.isCreating,
            error = state.createError,
            onDismiss = { showAddDialog = false },
            onCreate = { request ->
                viewModel.createUser(request)
                showAddDialog = false
            },
        )
    }
}

@Composable
private fun UserCard(user: User) {
    val (roleColor, roleBg) = statusColors(user.role)
    val roleIcon = when (user.role) {
        "admin" -> Icons.Filled.Shield
        "dispatcher" -> Icons.Filled.Headset
        "driver" -> Icons.Filled.LocalShipping
        else -> Icons.Filled.Person
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Avatar
            Surface(
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(44.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        user.fullName.firstOrNull()?.uppercase() ?: "?",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            Column(Modifier.weight(1f)) {
                Text(
                    user.fullName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    user.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                StatusBadge(text = user.role, color = roleColor, backgroundColor = roleBg)
                Spacer(Modifier.height(4.dp))
                StatusBadge(
                    text = if (user.isActive) "Active" else "Inactive",
                    color = if (user.isActive) Green600 else Slate500,
                    backgroundColor = if (user.isActive) Green50 else Slate50,
                )
            }
        }
    }
}

@Composable
private fun AddUserDialog(
    isCreating: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onCreate: (CreateUserRequest) -> Unit,
) {
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var selectedRole by remember { mutableStateOf("driver") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add User") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (error != null) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedTextField(
                    value = fullName,
                    onValueChange = { fullName = it },
                    label = { Text("Full Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )

                // Role selector
                Text("Role", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("admin", "dispatcher", "driver").forEach { role ->
                        FilterChip(
                            selected = selectedRole == role,
                            onClick = { selectedRole = role },
                            label = { Text(role.replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onCreate(
                        CreateUserRequest(
                            email = email.trim(),
                            fullName = fullName.trim(),
                            role = selectedRole,
                            password = password,
                        )
                    )
                },
                enabled = fullName.isNotBlank() && email.isNotBlank() && password.length >= 6 && !isCreating,
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
