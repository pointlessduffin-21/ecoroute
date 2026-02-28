package com.ecoroute.app.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.ecoroute.app.data.model.User
import com.ecoroute.app.ui.screens.alerts.AlertsScreen
import com.ecoroute.app.ui.screens.analytics.AnalyticsScreen
import com.ecoroute.app.ui.screens.bins.BinsScreen
import com.ecoroute.app.ui.screens.dashboard.DashboardScreen
import com.ecoroute.app.ui.screens.login.LoginScreen
import com.ecoroute.app.ui.screens.login.LoginViewModel
import com.ecoroute.app.ui.screens.routes.RoutesScreen
import com.ecoroute.app.ui.screens.provisioning.ProvisioningScreen
import com.ecoroute.app.ui.screens.settings.SettingsScreen
import com.ecoroute.app.ui.screens.users.UsersScreen
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EcoRouteNavHost() {
    val navController = rememberNavController()
    val loginViewModel: LoginViewModel = hiltViewModel()
    val authState by loginViewModel.authState.collectAsStateWithLifecycle()

    LaunchedEffect(authState.isLoggedIn) {
        if (authState.isLoggedIn) {
            navController.navigate(Screen.Dashboard.route) {
                popUpTo(Screen.Login.route) { inclusive = true }
            }
        }
    }

    val startDestination = if (authState.isLoggedIn) Screen.Dashboard.route else Screen.Login.route

    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable(Screen.Login.route) {
            LoginScreen(
                viewModel = loginViewModel,
                onLoginSuccess = {
                    navController.navigate(Screen.Dashboard.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                },
            )
        }

        composable(Screen.Dashboard.route) {
            AppScaffold(navController, authState.user, Screen.Dashboard, loginViewModel) {
                DashboardScreen()
            }
        }
        composable(Screen.Bins.route) {
            AppScaffold(navController, authState.user, Screen.Bins, loginViewModel) {
                BinsScreen()
            }
        }
        composable(Screen.Routes.route) {
            AppScaffold(navController, authState.user, Screen.Routes, loginViewModel) {
                RoutesScreen()
            }
        }
        composable(Screen.Alerts.route) {
            AppScaffold(navController, authState.user, Screen.Alerts, loginViewModel) {
                AlertsScreen()
            }
        }
        composable(Screen.Users.route) {
            AppScaffold(navController, authState.user, Screen.Users, loginViewModel) {
                UsersScreen()
            }
        }
        composable(Screen.Analytics.route) {
            AppScaffold(navController, authState.user, Screen.Analytics, loginViewModel) {
                AnalyticsScreen()
            }
        }
        composable(Screen.Provisioning.route) {
            AppScaffold(navController, authState.user, Screen.Provisioning, loginViewModel) {
                ProvisioningScreen()
            }
        }
        composable(Screen.Settings.route) {
            AppScaffold(navController, authState.user, Screen.Settings, loginViewModel) {
                SettingsScreen()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppScaffold(
    navController: NavHostController,
    user: User?,
    currentScreen: Screen,
    loginViewModel: LoginViewModel,
    content: @Composable () -> Unit,
) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.width(280.dp),
            ) {
                // Logo header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 24.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                "E",
                                color = MaterialTheme.colorScheme.onPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Text(
                        "EcoRoute",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                }

                HorizontalDivider()

                Spacer(Modifier.height(8.dp))

                // Nav items
                Screen.drawerItems.forEach { screen ->
                    if (screen.adminOnly && user?.role != "admin") return@forEach

                    NavigationDrawerItem(
                        icon = {
                            screen.icon?.let { Icon(it, contentDescription = screen.title) }
                        },
                        label = { Text(screen.title) },
                        selected = currentRoute == screen.route,
                        onClick = {
                            scope.launch { drawerState.close() }
                            if (currentRoute != screen.route) {
                                navController.navigate(screen.route) {
                                    popUpTo(Screen.Dashboard.route) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        },
                        modifier = Modifier.padding(horizontal = 12.dp),
                    )
                }

                Spacer(Modifier.weight(1f))

                HorizontalDivider()

                // User profile + logout
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = MaterialTheme.shapes.large,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                user?.fullName?.firstOrNull()?.uppercase() ?: "?",
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            user?.fullName ?: "",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            user?.role?.replaceFirstChar { it.uppercase() } ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = {
                        scope.launch {
                            drawerState.close()
                            loginViewModel.logout()
                            navController.navigate(Screen.Login.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    }) {
                        Icon(
                            Icons.Filled.Logout,
                            contentDescription = "Logout",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(currentScreen.title) },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Filled.Menu, contentDescription = "Menu")
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
                content()
            }
        }
    }
}
