# EcoRoute

AI Smart Waste Management & Dynamic Collection Routing for Subdivisions

## Overview

EcoRoute is an AI/IoT-based smart waste management system designed for private residential subdivisions and HOAs in the Philippines. It combines IoT smart-bin sensors, AI-powered fill-level prediction (LSTM), and dynamic route optimization (CVRP via Google OR-Tools) to replace inefficient fixed-schedule waste collection with a proactive, data-driven, collect-when-needed model.

## System Architecture

```
Smart Bin Sensors → Cellular/MQTT → Cloud Ingestion → AI Prediction
→ Route Optimization → Dispatch → Driver PWA → Proof of Service → Analytics
```

### Three-Layer Architecture

- **Field Layer** — ESP32 + Ultrasonic/ToF Sensor + GSM/LTE, solar-powered, MQTT over TLS
- **Cloud Layer** — MQTT Broker, Ingestion Service, Time-Series DB + PostGIS, AI Service, Routing Service, REST API Gateway
- **Application Layer** — Admin Web Dashboard (React), Crew Mobile PWA (React Native/Expo), Resident App

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend API | TypeScript / Bun + HonoJS | Primary REST API server |
| AI/ML Service | Python + FastAPI + Gunicorn | LSTM forecasting, AI insights |
| Route Optimization | Google OR-Tools + Celery + Redis | CVRP dynamic route solver |
| Database | Supabase (PostgreSQL + PostGIS) | Relational + geospatial + time-series |
| MQTT Broker | EMQX or Mosquitto | IoT message transport |
| Auth | Supabase Auth | Authentication + RBAC |
| Web Dashboard | ReactJS + TypeScript + Vite + Tailwind + shadcn/ui | Admin dashboard |
| Mobile | React Native + TypeScript + Expo | Crew & resident apps |
| IoT Firmware | C/C++ (Arduino IDE) + ESP32 | Sensor reading, MQTT publish |
| Infrastructure | Docker Compose + VPS | Container orchestration |

## Database Schema

12 normalized (3NF) entities:

- `subdivision` — Multi-tenant root (HOA/community)
- `user` — Auth + RBAC (admin/dispatcher/driver)
- `smart_bin` — Digital twin of IoT device
- `bin_telemetry` — High-volume time-series sensor data
- `fill_prediction` — AI forecast outputs
- `alert` — System events (overflow/low_battery/sensor_anomaly/offline)
- `collection_route` — Daily job order / dispatch manifest
- `route_stop` — Junction: Route → Bin (stop sequence)
- `service_event` — Proof of Service execution
- `audit_log` — Immutable action trail
- `notification` — Outbound messaging (push/SMS/email/in-app)
- `system_config` — Key-value settings store

## API Endpoints

All protected endpoints require Bearer token authentication via Supabase Auth.

| Module | Base Path | Description |
|---|---|---|
| Auth | `/api/v1/auth` | Login, register, profile, logout |
| Subdivisions | `/api/v1/subdivisions` | CRUD for subdivision management |
| Users | `/api/v1/users` | User account management with RBAC |
| Smart Bins | `/api/v1/bins` | Bin device management + telemetry history |
| Telemetry | `/api/v1/telemetry` | Sensor data ingestion + aggregation |
| Alerts | `/api/v1/alerts` | Alert management + acknowledgment |
| Routes | `/api/v1/routes` | Collection route planning + optimization |
| Service Events | `/api/v1/service-events` | Proof of service (PoS) records |
| Notifications | `/api/v1/notifications` | In-app + push notification management |
| Analytics | `/api/v1/analytics` | Dashboard KPIs, fill levels, driver metrics |
| System Config | `/api/v1/system-config` | Global/subdivision configuration |

## User Roles

| Role | Platform | Permissions |
|---|---|---|
| Admin | Web Dashboard | Full system access: CRUD users/bins, generate routes, view analytics, configure system |
| Dispatcher | Web Dashboard | Generate & assign routes, monitor progress, manage alerts |
| Driver | Mobile PWA | View assigned routes, navigate, submit PoS, report issues |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime
- Docker & Docker Compose
- Supabase project (or local Supabase via CLI)

### Local Development

```bash
# 1. Start infrastructure services
docker compose up -d postgres redis mosquitto

# 2. Set up backend
cd backend
cp .env.example .env
# Fill in your Supabase credentials and other env vars in .env

bun install
bun run db:push        # Push schema to database
bun run dev            # Start dev server with hot reload
```

The API server runs at `http://localhost:3000`.

```bash
# 3. Start frontend (in another terminal)
cd frontend
bun install
bun run dev            # Start Vite dev server with hot reload
```

The web dashboard runs at `http://localhost:5173` (proxies API requests to backend).

### Docker (Full Stack)

```bash
# Set environment variables
cp .env.example .env
# Fill in required values

# Start all services
docker compose up -d
```

## Project Structure

```
ecoroute/
├── backend/                    # Bun + HonoJS REST API
│   ├── src/
│   │   ├── config/             # Database, Redis, Supabase, env config
│   │   ├── db/
│   │   │   └── schema.ts       # Drizzle ORM schema (12 entities)
│   │   ├── middleware/          # Auth, RBAC, audit logging
│   │   ├── routes/             # 11 route modules
│   │   ├── services/           # MQTT ingestion, route optimizer
│   │   ├── types/              # TypeScript type definitions
│   │   ├── utils/              # Pagination, error handling
│   │   └── index.ts            # App entry point
│   ├── drizzle.config.ts      # Drizzle Kit migration config
│   ├── Dockerfile
│   └── package.json
├── frontend/                   # Vite + React + TypeScript + Tailwind v4
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/         # AppLayout, Sidebar, Header
│   │   │   └── ui/             # Button, Card, Badge, Input, Table
│   │   ├── hooks/              # useAuth context
│   │   ├── lib/                # API client, utils (cn, date formatters)
│   │   ├── pages/              # 8 page components
│   │   │   ├── dashboard.tsx   # KPI cards, fill chart, recent alerts
│   │   │   ├── analytics.tsx   # Trend charts, pie chart, driver table
│   │   │   ├── bins.tsx        # Bin cards, search/filter, add modal
│   │   │   ├── routes.tsx      # Route table, generate, expandable stops
│   │   │   ├── users.tsx       # User table, role filter, add modal
│   │   │   ├── alerts.tsx      # Alert stats, table, acknowledge
│   │   │   ├── settings.tsx    # General, threshold, notification config
│   │   │   └── login.tsx       # Auth login form
│   │   ├── types/              # TypeScript interfaces (api.ts)
│   │   ├── App.tsx             # Route definitions + protected route wrapper
│   │   ├── main.tsx            # Entry point (providers, router)
│   │   └── index.css           # Tailwind v4 theme (green primary)
│   ├── vite.config.ts          # Vite config (React, Tailwind, API proxy)
│   └── package.json
├── docker-compose.yml          # PostgreSQL + Redis + Mosquitto + Backend
├── mosquitto/config/           # MQTT broker configuration
└── ecoroute-plan.pdf           # Project analysis & build reference
```

## Build Checklist

### Infrastructure & Setup
- [x] Scaffold backend API (Bun + HonoJS)
- [x] Set up database schema with Drizzle ORM (12 entities)
- [x] Configure Docker Compose (PostgreSQL/PostGIS, Redis, Mosquitto)
- [x] Set up MQTT broker (Mosquitto)
- [ ] Initialize Supabase project (PostgreSQL + PostGIS + Auth)
- [ ] Set up Redis + Celery for async route optimization

### Backend API
- [x] Implement RBAC middleware (admin/dispatcher/driver)
- [x] Build auth routes (login/register/profile/logout)
- [x] Build subdivision management API
- [x] Build user/account management API
- [x] Build smart bin & device management API
- [x] Build telemetry ingestion API
- [x] Build alert management API
- [x] Build collection route planning API
- [x] Build service event (PoS) API
- [x] Build notification system API
- [x] Build analytics/reports API
- [x] Build system configuration API
- [x] Build MQTT telemetry ingestion service
- [x] Build route optimization service (placeholder for OR-Tools)
- [x] Set up audit logging middleware

### AI/ML Service (Python)
- [ ] Scaffold Python ML service (FastAPI + Gunicorn)
- [ ] Train LSTM model on simulated/collected fill-level data
- [ ] Build telemetry ingestion pipeline (MQTT → validate → store)
- [ ] Build route generation endpoint (OR-Tools CVRP solver)
- [ ] Build analytics dashboard with LLM/RAG insights

### Frontend (Web Dashboard)
- [x] Scaffold admin dashboard (Vite + React + TypeScript + Tailwind v4 + shadcn/ui)
- [x] Set up routing, auth context, and API client (react-router-dom, @tanstack/react-query, axios)
- [x] Build layout shell (sidebar navigation, header, responsive mobile nav)
- [x] Build Dashboard page (KPI cards, fill level distribution chart, recent alerts)
- [x] Build Analytics page (collection trends, fill level trends, route efficiency pie chart, driver performance table)
- [x] Build Smart Bins page (bin cards with fill bars, search/filter, telemetry display, add bin modal)
- [x] Build Route Planning page (route table, status badges, generate route, expandable stops)
- [x] Build User Management page (user table, role badges, search/filter, add user modal)
- [x] Build Alerts page (alert stats cards, alert table, acknowledge button)
- [x] Build Settings page (general, threshold, notification preference panels)
- [x] Build Login page (centered card with gradient, email/password form)
- [ ] Scaffold mobile app (React Native + Expo + TypeScript)

### IoT / Hardware
- [ ] Flash ESP32 firmware (Arduino IDE) with ultrasonic/ToF + MQTT
- [ ] Set up Google Maps API (Distance Matrix + Routes)
- [ ] Set up Google OR-Tools integration

### Deployment
- [ ] Build notification system (push/SMS/email/in-app)
- [ ] Deploy to VPS (DigitalOcean/Hetzner) with HTTPS
- [ ] Pilot test with 10-15 bins in target subdivision

## License

Private — University of Cebu Banilad Capstone Project (November 2025)
