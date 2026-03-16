# EcoRoute - Roles and Capabilities

This document outlines the three user roles in the EcoRoute system and their capabilities across all modules.

## Roles Overview

| Role | Description | Primary Users |
|------|-------------|---------------|
| **Admin** | Full system control — manages users, settings, subdivisions, and all operational features | System administrators, IT staff |
| **Dispatcher** | Operations management — plans routes, manages bins, monitors analytics and AI insights | Waste collection coordinators, operations managers |
| **Maintenance** | Field operations — views assigned routes, logs service events, reports issues | Collection crew, field technicians |

---

## Capability Matrix

### User Management

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View all users | Y | - | - |
| Create user accounts | Y | - | - |
| Edit user (role, status, info) | Y | - | - |
| Deactivate/reactivate users | Y | - | - |

### Smart Bins

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View all bins | Y | Y | Y |
| View bin details & telemetry | Y | Y | Y |
| Add new bin | Y | Y | - |
| Edit bin (device code, capacity, threshold, status) | Y | Y | - |
| Upload bin photo | Y | Y | - |
| Delete bin | Y | Y | - |
| Test MQTT connection | Y | Y | - |

### Collection Routes

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View all routes | Y | Y | Y |
| View own assigned routes (My Routes) | - | - | Y |
| Create route manually | Y | Y | - |
| Generate AI-optimized route | Y | Y | - |
| Edit route | Y | Y | - |

### Alerts

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View all alerts | Y | Y | Y |
| Create alert | Y | Y | - |
| Acknowledge alert | Y | Y | - |
| Delete alert | Y | - | - |

### Analytics & AI

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View dashboard analytics | Y | Y | - |
| View fill level analytics | Y | Y | - |
| Generate AI insights | Y | Y | - |
| Run fill level predictions (LSTM) | Y | Y | - |
| Run route optimization (CVRP) | Y | Y | - |
| Test AI provider connection | Y | Y | - |

### System Settings

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View system configuration | Y | - | - |
| Edit general settings (subdivision name, depot) | Y | - | - |
| Edit threshold configuration | Y | - | - |
| Edit notification preferences | Y | - | - |
| Configure AI provider (Ollama, Gemini, OpenRouter) | Y | - | - |

### Subdivisions

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View all subdivisions | Y | - | - |
| Create subdivision | Y | - | - |
| Edit subdivision | Y | - | - |
| Delete subdivision | Y | - | - |

### Service Events

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View service events | Y | Y | Y |
| Create service event (proof of service) | Y | Y | Y |
| Update service event status | Y | Y | Y |

### Notifications

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View own notifications | Y | Y | Y |
| Mark notification as read | Y | Y | Y |
| Create notification | Y | Y | Y |

### Dashboard

| Capability | Admin | Dispatcher | Maintenance |
|------------|:-----:|:----------:|:-----------:|
| View dashboard overview | Y | Y | Y |
| View bin status summary | Y | Y | Y |
| View recent alerts | Y | Y | Y |

---

## Sidebar Navigation by Role

### Admin
- Dashboard
- Smart Bins
- Routes
- Alerts
- Users
- Analytics
- Subdivisions
- Settings

### Dispatcher
- Dashboard
- Smart Bins
- Routes
- Alerts
- Analytics
- Settings

### Maintenance
- Dashboard
- Smart Bins
- Routes
- My Routes
- Alerts
- Settings

---

## Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ecoroute.io | password123 |
| Dispatcher | dispatcher@ecoroute.io | password123 |
| Maintenance | maintenance@ecoroute.io | password123 |
