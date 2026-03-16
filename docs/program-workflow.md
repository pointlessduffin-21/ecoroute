# EcoRoute — Program Workflow

## System Overview

EcoRoute is an AI/IoT smart waste management system for residential subdivisions. It replaces fixed-schedule waste collection with AI-driven "collect-when-needed" routing.

**Three layers:**
- **Field Layer** — ESP32 IoT bins publish fill-level data via MQTT
- **Cloud Layer** — Backend ingests telemetry, runs AI predictions, generates optimized routes
- **Application Layer** — Web dashboard (admin/dispatcher) and mobile app (maintenance)

**Three roles:**
- **Admin** — Full system control (users, settings, subdivisions, schedules, audit logs)
- **Dispatcher** — Operations (bins, routes, alerts, analytics, AI, schedule overrides)
- **Maintenance** — Field execution (assigned routes, before/after photos, issue reporting)

---

## Admin Workflow

```mermaid
flowchart TD
    A([Start]) --> B[Sign In]
    B --> C[Dashboard]
    C --> D{Sidebar Navigation}

    D --> E[User Management]
    E --> E1[View All Users]
    E1 --> E2{Action?}
    E2 -->|Add| E3[Create User: Name, Email, Role, Password]
    E2 -->|Edit| E4[Edit User: Role, Status, Info]
    E2 -->|Deactivate| E5[Deactivate User Account]
    E2 -->|Reactivate| E6[Reactivate User Account]

    D --> F[Smart Bins]
    F --> F1[View All Bins with Live Fill Levels]
    F1 --> F2{Action?}
    F2 -->|Click Bin| F3[Bin Details: Telemetry Charts, Map, Device Info]
    F3 --> F4{Action?}
    F4 -->|Edit| F5[Edit: Location, MQTT Config, Capacity, Threshold]
    F4 -->|Upload Photo| F6[Upload Bin Photo]
    F4 -->|Deactivate| F7[Set Bin Inactive]
    F2 -->|Add Bin| F8[New Bin: Device Code, MQTT Config, Map Pin, Capacity]
    F8 --> F9[Test MQTT Connection]
    F9 --> F10[Create Bin]

    D --> G[Schedules]
    G --> G1[Weekly Calendar Grid]
    G1 --> G2{Action?}
    G2 -->|Add Shift| G3[Select Worker + Subdivision + Days + Time]
    G2 -->|Delete Shift| G4[Remove Shift from Calendar]
    G2 -->|Override| G5[Generate Route Now: Pick Subdivision + Worker]
    G1 --> G6[View Today's Shifts]

    D --> H[Routes]
    H --> H1[View All Routes on Map]
    H1 --> H2{Route Status?}
    H2 -->|Planned| H3[View Pending Assignment + Stops on Map]
    H2 -->|In Progress| H4[Monitor Live: Auto-Refresh 10s]
    H4 --> H5[Track Stop Progress + Issues in Real-Time]
    H2 -->|Completed| H6[View Route Report]
    H6 --> H7[Route Map with Stop Markers]
    H6 --> H8[Before/After Collection Photos]
    H6 --> H9[Issue Summary + Timeline]
    H6 --> H10[Print Report]
    H1 --> H11[Simulate Workflow: Pick Subdivision → Run]

    D --> I[Alerts]
    I --> I1[View All Alerts: Overflow, Low Battery, Sensor, Offline]
    I1 --> I2{Action?}
    I2 -->|Acknowledge| I3[Mark Alert Acknowledged]
    I2 -->|Delete| I4[Delete Alert]

    D --> J[Analytics]
    J --> J1[AI Insights: Auto-Generated via Ollama/Gemini]
    J --> J2[Fill Level Predictions: LSTM Forecasts]
    J --> J3[Collection Performance Charts]
    J --> J4[Bins Serviced Trend]
    J --> J5[Route Efficiency + Driver Performance]

    D --> K[Subdivisions]
    K --> K1[Map with Geofence Polygons + Bin Markers]
    K1 --> K2{Action?}
    K2 -->|Add| K3[Create: Name, Code, Address, Draw Geofence on Map]
    K2 -->|Click| K4[View Detail: Users, Bins, Contact Info]
    K4 --> K5{Action?}
    K5 -->|Assign User| K6[Pick User → Assign to Subdivision]
    K5 -->|Assign Bin| K7[Pick Bin → Assign to Subdivision]
    K5 -->|Edit| K8[Edit Subdivision Details + Geofence]
    K5 -->|Deactivate| K9[Deactivate Subdivision]

    D --> L[Audit Logs]
    L --> L1[View All System Activity]
    L1 --> L2[Expand Entry: JSON Diff of Old/New Values]

    D --> M[Feedback & FAQs]
    M --> M1[View All Feedback + Reply]
    M --> M2[Manage FAQs: Add, Edit, Delete]

    D --> N[Settings]
    N --> N1[General: Subdivision Name, Depot Address]
    N --> N2[Thresholds: Fill %, Low Battery Voltage]
    N --> N3[AI Provider: Ollama / Gemini / OpenRouter]
    N3 --> N4[Test AI Connection]
    N --> N5[Notification Preferences]

    D --> O[Profile]
    O --> O1[View/Edit Name, Phone]

    C --> P[Logout]
    P --> Q([End])
```

---

## Dispatcher Workflow

```mermaid
flowchart TD
    A([Start]) --> B[Sign In]
    B --> C[Dashboard]
    C --> D{Sidebar Navigation}

    D --> E[Smart Bins]
    E --> E1[View Bins with Live Fill Levels]
    E1 --> E2[Click Bin → Details + Telemetry Charts]
    E2 --> E3[Edit Bin / Upload Photo / Test MQTT]
    E1 --> E4[Add New Bin with MQTT Config + Map Pin]

    D --> F[Schedules]
    F --> F1[View Weekly Calendar]
    F1 --> F2[Add/Remove Maintenance Shifts]
    F1 --> F3[Override: Generate Route Now]

    D --> G[Routes — Monitor & Dispatch]
    G --> G1[View All Routes on Map with Stops]
    G1 --> G2{Route Status?}
    G2 -->|Planned| G3[Review Assignment + Stops]
    G2 -->|In Progress| G4[Monitor Live: 10s Auto-Refresh]
    G4 --> G5[See Driver Progress + Issues]
    G2 -->|Completed| G6[View Route Report]
    G6 --> G7[Map + Before/After Photos + Timeline]
    G6 --> G8[Print Report]
    G1 --> G9[Simulate Workflow: Pick Subdivision → Run]

    D --> H[Alerts]
    H --> H1[View + Acknowledge Alerts]

    D --> I[Analytics]
    I --> I1[AI Insights + Predictions + Charts]

    D --> J[Feedback & FAQs]
    J --> J1[Submit Feedback / View FAQs]

    D --> K[Profile]
    K --> K1[Edit Profile]

    C --> L[Logout]
    L --> M([End])
```

---

## Maintenance Workflow (Mobile App)

```mermaid
flowchart TD
    A([Start]) --> B[Sign In on Mobile App]
    B --> C[Dashboard]
    C --> D{Navigation Drawer}

    D --> E[My Routes]
    E --> E1[View Assigned Routes]
    E1 --> E2{Route Available?}
    E2 -->|No| E3[Wait for Shift Schedule to Trigger Route]
    E2 -->|Yes| E4[Tap Execute Route]
    E4 --> F[Route Execution Screen]

    F --> F1[View Stop List + Map]
    F1 --> F2[Tap Start Route]
    F2 --> G[Stop-by-Stop Execution]

    G --> G1[Navigate to Bin Location]
    G1 --> G2[Tap Arrive]
    G2 --> G3[Take BEFORE Photo — Camera Opens]
    G3 --> G4[View Before Photo Thumbnail]
    G4 --> G5[Empty / Service the Bin]
    G5 --> G6[Take AFTER Photo — Camera Opens]
    G6 --> G7[View After Photo Thumbnail]
    G7 --> G8[Add Notes — Optional]
    G8 --> G9[Tap Service Done]
    G9 --> G10{Photos Upload OK?}
    G10 -->|Yes| G11[Stop Marked Serviced ✅]
    G10 -->|Fail| G12[Retry Upload]

    G2 --> H{Issue Found?}
    H -->|Yes| H1[Tap Report Issue]
    H1 --> H2[Select Severity: Low / Medium / High / Critical]
    H2 --> H3[Describe Issue + Optional Photo]
    H3 --> H4[Submit → Alert Created for Dispatcher]

    G2 --> I{Cannot Access Bin?}
    I -->|Yes| I1[Tap Skip]
    I1 --> I2[Select Reason: Road Blocked / Inaccessible / Not Found / Safety / Already Emptied]
    I2 --> I3[Stop Marked Skipped ⏭️]

    G11 --> J{More Stops?}
    I3 --> J
    J -->|Yes| G1
    J -->|No| K[All Stops Handled]
    K --> K1[Tap Complete Route]
    K1 --> K2[Route Report Generated]
    K2 --> K3[AI Verifies Before/After Photos]

    D --> L[Smart Bins]
    L --> L1[View Bin List + Details]

    D --> M[Alerts]
    M --> M1[View Alerts]

    D --> N[Feedback]
    N --> N1[Submit Feedback / View FAQs]

    D --> O[Settings / Profile]

    C --> P[Logout]
    P --> Q([End])
```

---

## Automated Backend Workflow

```mermaid
flowchart TD
    subgraph IoT["Field Layer — IoT Sensors"]
        A[ESP32 Bin Sensor] -->|MQTT Publish| B[MQTT Broker<br/>109.123.238.215:1883]
    end

    subgraph Ingestion["Telemetry Ingestion"]
        B -->|Subscribe: ecoroute/trash_can/+| C[Backend MQTT Service]
        C --> D[Validate Payload]
        D --> E[Store in bin_telemetry Table]
        E --> F[Update smart_bin.lastSeenAt]
    end

    subgraph Alerts["Alert Detection"]
        F --> G{Fill >= Threshold?}
        G -->|Yes| H[Create Overflow Alert<br/>Critical if ≥95%, High if ≥80%]
        F --> I{Battery < 3.3V?}
        I -->|Yes| J[Create Low Battery Alert<br/>Critical if <3.0V]
        F --> K{Sensor Anomaly?}
        K -->|Yes| L[Create Sensor Alert]
    end

    subgraph Scheduling["Shift-Driven Route Generation"]
        M[Route Scheduler<br/>Checks Every 5 Minutes] --> N[Query Today's Shift Schedules]
        N --> O{Shift Started?}
        O -->|No| M
        O -->|Yes| P{Route Already Exists Today?}
        P -->|Yes| M
        P -->|No| Q[Find Bins Above Threshold<br/>in Shift's Subdivision]
        Q --> R{Bins Found?}
        R -->|No| M
        R -->|Yes| S{AI Service Available?}
        S -->|Yes| T[CVRP Route Optimization<br/>Google OR-Tools]
        S -->|No| U[Fallback: Sort by Fill Level]
        T --> V[Create Collection Route + Stops]
        U --> V
        V --> W[Assign to Shift's Maintenance Worker]
        W --> X[Route Ready for Mobile Execution]
    end

    subgraph Verification["Post-Collection"]
        Y[Route Completed by Worker] --> Z{Before/After Photos?}
        Z -->|Yes| AA[AI Verify Photos<br/>Ollama / Gemini / OpenRouter]
        AA --> AB[Update Verification Status]
        Z -->|No| AC[Mark as Unverified]
        Y --> AD[Generate Route Report]
        AD --> AE[Available on Web Dashboard]
    end

    subgraph Override["Manual Override"]
        AF[Dispatcher Clicks Override] --> AG[Select Subdivision + Worker]
        AG --> AH[Generate Route Immediately]
        AH --> X
    end
```

---

## Data Flow Summary

| Step | Source | Action | Destination |
|------|--------|--------|-------------|
| 1 | ESP32 Sensor | Publish fill level via MQTT | MQTT Broker (109.123.238.215:1883) |
| 2 | MQTT Broker | Forward to subscriber | Backend Telemetry Processor |
| 3 | Telemetry Processor | Store reading, create alerts if thresholds breached | PostgreSQL (bin_telemetry + alert tables) |
| 4 | Admin/Dispatcher | Enroll maintenance shift schedules | shift_schedule table |
| 5 | Route Scheduler (5min) | Detect shift start + bins above threshold | AI Service (CVRP) or fallback sort |
| 6 | AI Service | Return optimized stop sequence | Backend creates route + stops |
| 7 | Backend | Assign route to shift's maintenance worker | collection_route + route_stop tables |
| 8 | Maintenance (Mobile) | Execute stops: arrive → before photo → service → after photo | Backend via REST API |
| 9 | Backend | AI verifies before/after photos | Ollama / Gemini / OpenRouter |
| 10 | Backend | Generate route completion report | Web dashboard for dispatcher review |

---

## Page Map by Role

### Admin sees:
Dashboard · Smart Bins · Routes · Alerts · Users · **Schedules** · Analytics · **Subdivisions** · **Audit Logs** · Feedback & FAQs · Settings · Profile

### Dispatcher sees:
Dashboard · Smart Bins · Routes · Alerts · Analytics · Feedback & FAQs · Settings · Profile

### Maintenance sees:
Dashboard · Smart Bins · Routes · **My Routes** · Alerts · Feedback & FAQs · Settings · Profile

---

## Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ecoroute.io | password123 |
| Dispatcher | dispatcher@ecoroute.io | password123 |
| Maintenance | maintenance@ecoroute.io | password123 |
