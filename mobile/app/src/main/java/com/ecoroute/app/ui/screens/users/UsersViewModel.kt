package com.ecoroute.app.ui.screens.users

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ecoroute.app.data.model.CreateUserRequest
import com.ecoroute.app.data.model.User
import com.ecoroute.app.data.repository.EcoRouteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class UsersUiState(
    val users: List<User> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val roleFilter: String = "all",
    val searchQuery: String = "",
    val isCreating: Boolean = false,
    val createError: String? = null,
)

@HiltViewModel
class UsersViewModel @Inject constructor(
    private val repository: EcoRouteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(UsersUiState())
    val uiState: StateFlow<UsersUiState> = _uiState.asStateFlow()

    init {
        loadUsers()
    }

    fun loadUsers() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val role = _uiState.value.roleFilter.let { if (it == "all") null else it }

            repository.getUsers(role = role)
                .onSuccess { users ->
                    _uiState.update { it.copy(users = users, isLoading = false) }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
        }
    }

    fun setRoleFilter(role: String) {
        _uiState.update { it.copy(roleFilter = role) }
        loadUsers()
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun createUser(request: CreateUserRequest) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true, createError = null) }
            repository.createUser(request)
                .onSuccess {
                    _uiState.update { it.copy(isCreating = false) }
                    loadUsers()
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isCreating = false, createError = e.message) }
                }
        }
    }
}
