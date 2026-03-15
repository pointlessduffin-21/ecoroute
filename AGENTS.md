# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

EcoRoute is an AI/IoT smart waste management system for residential subdivisions in the Philippines. It replaces fixed-schedule waste collection with AI-driven "collect-when-needed" routing using IoT smart bins (ESP32), LSTM fill-level prediction, and CVRP route optimization.

## Commands

### Backend (`/backend`)
```bash
bun run dev          # Start dev server with hot reload (port 3000)
bun run start        # Production start
bun run db:push      # Push Drizzle schema to database (no migrations)
bun run db:generate  # Generate migration files
bun run db:migrate   # Run pending migrations
bun run db:studio    # Drizzle Studio GUI at port 5555
bun run db:seed      # Seed initial data
```

### Frontend (`/frontend`)
```bash
bun run dev          # Vite dev server (port 5173, proxies /api to backend)
bun run build        # TypeScript check + Vite production build
bun run preview      # Preview production build
```

### AI Service (`/ai-service`)
```bash
# Local development
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Tests
pytest
```

### Full Stack
```bash
docker compose up -d    # Start all 6 services
docker compose down     # Stop all services
```

### Firmware Simulator (`/firmware/simulator`)
```bash
bun run simulate    # Emulate ESP32 device publishing MQTT telemetry
```

## Architecture

**Three-layer system:**
1. **Field Layer** — ESP32 firmware (`/firmware/`) reads ultrasonic/ToF sensors and publishes to MQTT topic `ecoroute/<device_code>/telemetry`
2. **Cloud Layer** — Backend (`/backend/`) ingests via MQTT + REST, stores in PostgreSQL+PostGIS, delegates ML to Python service (`/ai-service/`)
3. **Application Layer** — Web dashboard (`/frontend/`) and Kotlin Android app (`/mobile/`)

### Backend (`/backend/src/`)
- **Framework:** Bun + HonoJS, all routes under `/api/v1/`
- **ORM:** Drizzle with PostgreSQL+PostGIS (`/backend/src/db/schema.ts` — 12 entities)
- **Auth:** `middleware/auth.ts` validates Bearer tokens via Supabase OR local JWT (dev fallback). User context stored in Hono variables.
- **RBAC:** `middleware/rbac.ts` — `requireRole('admin'|'dispatcher'|'driver')` factory applied per route group
- **MQTT:** `services/mqtt.ts` subscribes to IoT telemetry; `services/telemetry-processor.ts` handles anomaly detection and alert creation
- **Route optimization:** `services/route-optimizer.ts` calls Python AI Service for CVRP, returns GeoJSON
- **Audit:** `auditMiddleware` logs all mutations to `audit_log` table automatically

### Database Schema Key Relationships
- Every resource is scoped to `subdivisionId` (multi-tenant)
- `bin_telemetry` is high-volume time-series (separate from `smart_bin` digital twin)
- `collection_route` → `route_stop` → `smart_bin` (route planning)
- `service_event` stores driver Proof of Service with photo evidence

### Frontend (`/frontend/src/`)
- **State:** TanStack React Query for server state; `hooks/use-auth.tsx` for auth context
- **API client:** `lib/api.ts` — Axios instance that auto-injects Bearer token from localStorage
- **Routing:** react-router-dom v7 with `ProtectedRoute` wrapper in `App.tsx`
- **Maps:** Leaflet + react-leaflet for bin locations and route polylines
- **UI:** Tailwind v4 + shadcn/ui components

### AI Service (`/ai-service/app/`)
- `routers/predictions.py` — REST endpoints called by backend `/api/v1/ai/*`
- `models/lstm_predictor.py` — MLPRegressor training, saves `.pkl` to `ai_models` Docker volume
- Google OR-Tools solves CVRP for route optimization; distances optionally via OpenRouteService API

## Environment Variables

Backend needs: `DATABASE_URL`, `REDIS_URL`, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_SERVICE_URL`, `DEVICE_API_KEY`

Frontend needs: `VITE_API_BASE_URL=http://localhost:3000/api/v1`

## Key Design Decisions

- **Multi-tenant by default:** Every query must filter by `subdivisionId`
- **MQTT for IoT ingestion:** Devices never call the REST API directly; HTTP fallback via `/api/v1/device/telemetry`
- **Supabase + JWT dual auth:** Supabase is the production auth; JWT fallback allows local dev without Supabase credentials
- **Python AI service is a separate microservice:** Backend calls it via HTTP at `AI_SERVICE_URL`; never import Python logic into the Node/Bun backend
- **Drizzle schema is the source of truth:** Use `db:push` for rapid dev, `db:generate`+`db:migrate` for production changes
