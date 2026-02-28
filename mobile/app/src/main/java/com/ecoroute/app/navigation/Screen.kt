package com.ecoroute.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(
    val route: String,
    val title: String,
    val icon: ImageVector? = null,
    val adminOnly: Boolean = false,
) {
    data object Login : Screen("login", "Login")
    data object Dashboard : Screen("dashboard", "Dashboard", Icons.Filled.Dashboard)
    data object Bins : Screen("bins", "Smart Bins", Icons.Filled.Delete)
    data object Routes : Screen("routes", "Route Planning", Icons.Filled.Route)
    data object Alerts : Screen("alerts", "Alerts", Icons.Filled.Notifications)
    data object Users : Screen("users", "Users", Icons.Filled.People, adminOnly = true)
    data object Analytics : Screen("analytics", "Analytics", Icons.Filled.BarChart)
    data object Provisioning : Screen("provisioning", "Device Setup", Icons.Filled.BluetoothSearching)
    data object Settings : Screen("settings", "Settings", Icons.Filled.Settings)

    data class RouteExecution(val routeId: String) : Screen(
        route = "route_execution/$routeId",
        title = "Route Execution",
        icon = Icons.Filled.PlayArrow,
    ) {
        companion object {
            const val ROUTE_PATTERN = "route_execution/{routeId}"
        }
    }

    companion object {
        val drawerItems = listOf(Dashboard, Bins, Routes, Alerts, Users, Analytics, Provisioning, Settings)
    }
}
