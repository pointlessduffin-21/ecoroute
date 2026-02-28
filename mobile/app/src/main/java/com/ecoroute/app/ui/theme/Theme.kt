package com.ecoroute.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = Green600,
    onPrimary = White,
    primaryContainer = Green100,
    onPrimaryContainer = Green700,
    secondary = Slate50,
    onSecondary = Slate900,
    secondaryContainer = Slate100,
    onSecondaryContainer = Slate700,
    tertiary = Blue500,
    onTertiary = White,
    tertiaryContainer = Blue100,
    onTertiaryContainer = Blue500,
    error = Red500,
    onError = White,
    errorContainer = Red100,
    onErrorContainer = Red500,
    background = SlateWhite,
    onBackground = Slate900,
    surface = White,
    onSurface = Slate900,
    surfaceVariant = Slate50,
    onSurfaceVariant = Slate500,
    outline = Slate100,
    outlineVariant = Slate100,
    surfaceContainerHighest = Slate50,
)

private val DarkColorScheme = darkColorScheme(
    primary = Green600,
    onPrimary = White,
    primaryContainer = Green700,
    onPrimaryContainer = Green100,
    secondary = DarkCard,
    onSecondary = White,
    secondaryContainer = Slate700,
    onSecondaryContainer = Slate100,
    tertiary = Blue500,
    onTertiary = White,
    error = Red500,
    onError = White,
    errorContainer = Red100,
    onErrorContainer = Red500,
    background = DarkBackground,
    onBackground = Slate100,
    surface = DarkSurface,
    onSurface = Slate100,
    surfaceVariant = Slate700,
    onSurfaceVariant = Slate400,
    outline = Slate700,
    outlineVariant = Slate700,
    surfaceContainerHighest = DarkCard,
)

@Composable
fun EcoRouteTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
