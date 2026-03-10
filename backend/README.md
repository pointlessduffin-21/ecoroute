# Backend Service (`backend`)

The Core API of the EcoRoute system, built using **Bun** and **HonoJS**. It manages authentication, devices, telemetry storage, alerts, and user administration. 

## Features
- **Fast HTTP Server**: leverages Bun's native HTTP speed.
- **Relational ORM**: Uses **Drizzle ORM** to manage the 12 normalized SQL entities inside PostgreSQL.
- **Authentication**: Integrates with Supabase Auth for Role-Based Access Control (Admin, Dispatcher, Driver).
- **MQTT Integration**: Uses `mqtt.js` to ingest real-time payloads from physical ESP32 smart bins and the firmware simulator via the Mosquitto broker.
- **Microservice Bridging**: Triggers the Python AI Service (`ai-service`) via REST when AI forecasts or route optimizations are needed.

## Tech Stack
- **Runtime:** Bun
- **Framework:** HonoJS
- **Database ORM:** Drizzle ORM
- **Database Engine:** PostgreSQL (Supabase/PostGIS)
- **Message Broker:** Eclipse Mosquitto (MQTT)
- **Cache:** Redis

## Setup & Environment
The backend requires environment variables defined in `.env`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ecoroute
REDIS_URL=redis://localhost:6379
MQTT_BROKER_URL=mqtt://localhost:1883
SUPABASE_URL=YOUR_URL
SUPABASE_ANON_KEY=YOUR_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_KEY
AI_SERVICE_URL=http://localhost:8000
```

## Running the Backend

**Development Mode (Hot Reloading)**
```bash
bun install
bun run dev
```

**Database Migrations & Seeding**
```bash
bun run db:push
bun run db:seed
```
