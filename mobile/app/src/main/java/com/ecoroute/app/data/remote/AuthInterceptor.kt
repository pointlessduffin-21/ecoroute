package com.ecoroute.app.data.remote

import com.ecoroute.app.data.local.TokenManager
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()

        // Skip auth header for login/register endpoints
        if (original.url.encodedPath.contains("/auth/login") ||
            original.url.encodedPath.contains("/auth/register")
        ) {
            return chain.proceed(original)
        }

        val token = runBlocking { tokenManager.getAccessToken() }

        val request = if (token != null) {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            original
        }

        return chain.proceed(request)
    }
}
