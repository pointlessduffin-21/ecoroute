package com.ecoroute.app.ui.screens.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.User
import com.ecoroute.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthState(
    val user: User? = null,
    val isLoggedIn: Boolean = false,
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _authState = MutableStateFlow(AuthState())
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.isLoggedIn.collect { loggedIn ->
                if (loggedIn && _authState.value.user == null) {
                    fetchProfile()
                } else if (!loggedIn) {
                    _authState.update { it.copy(user = null, isLoggedIn = false, isLoading = false) }
                }
            }
        }
    }

    private suspend fun fetchProfile() {
        authRepository.getProfile()
            .onSuccess { user ->
                _authState.update {
                    it.copy(user = user, isLoggedIn = true, isLoading = false, error = null)
                }
            }
            .onFailure {
                _authState.update { it.copy(isLoading = false, isLoggedIn = false) }
            }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _authState.update { it.copy(isLoading = true, error = null) }
            authRepository.login(email, password)
                .onSuccess { user ->
                    _authState.update {
                        it.copy(user = user, isLoggedIn = true, isLoading = false, error = null)
                    }
                }
                .onFailure { e ->
                    _authState.update {
                        it.copy(isLoading = false, error = e.message)
                    }
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            _authState.update { AuthState(isLoading = false) }
        }
    }

    fun clearError() {
        _authState.update { it.copy(error = null) }
    }
}
