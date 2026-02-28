package com.ecoroute.app.data.repository

import com.ecoroute.app.data.local.TokenManager
import com.ecoroute.app.data.model.LoginRequest
import com.ecoroute.app.data.model.User
import com.ecoroute.app.data.remote.ApiService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val tokenManager: TokenManager,
) {
    val isLoggedIn: Flow<Boolean> = tokenManager.accessTokenFlow.map { it != null }

    suspend fun login(email: String, password: String): Result<User> {
        return try {
            val response = api.login(LoginRequest(email, password))
            if (response.isSuccessful) {
                val body = response.body()!!.data
                tokenManager.saveTokens(body.session.accessToken, body.session.refreshToken)
                Result.success(body.user)
            } else {
                val errorMsg = when (response.code()) {
                    401 -> "Invalid email or password"
                    else -> "Login failed (${response.code()})"
                }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Network error: ${e.message}"))
        }
    }

    suspend fun getProfile(): Result<User> {
        return try {
            val response = api.getProfile()
            if (response.isSuccessful) {
                Result.success(response.body()!!.data)
            } else {
                if (response.code() == 401) {
                    tokenManager.clearTokens()
                }
                Result.failure(Exception("Failed to fetch profile"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Network error: ${e.message}"))
        }
    }

    suspend fun logout() {
        try {
            api.logout()
        } catch (_: Exception) {
            // Ignore network errors on logout
        }
        tokenManager.clearTokens()
    }
}
