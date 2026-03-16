# EcoRoute — Program Workflow

## System Overview

EcoRoute is an AI/IoT smart waste management system. The workflow spans three layers:
- **Field Layer** — ESP32 IoT bins publish fill-level data via MQTT
- **Cloud Layer** — Backend ingests telemetry, runs AI predictions, generates optimized routes
- **Application Layer** — Web dashboard (admin/dispatcher) and mobile app (maintenance)

---

## Admin Workflow

```mermaid
flowchart TD
    A([Start]) --> B[Sign In]
    B --> C[Dashboard]
    C --> D{Sidebar}

    D --> E[User Management]
    E --> E1[View User List]
    E1 --> E2{Click User?}
    E2 -->|Yes| E3[View Account]
    E3 --> E4{Action?}
    E4 -->|Edit| E5[Edit User Details]
    E5 --> E6[Save Changes]
    E4 -->|Deactivate| E7[Deactivate Account]
    E4 -->|Reactivate| E8[Reactivate Account]
    E2 -->|No| E9[+ Add User]
    E9 --> E10[Enter Name, Email, Role, Password]
    E10 --> E6

    D --> F[Smart Bins]
    F --> F1[View All Bins]
    F1 --> F2{Click Bin?}
    F2 -->|Yes| F3[Bin Details Page]
    F3 --> F4[View Live Telemetry & Charts]
    F3 --> F5{Action?}
    F5 -->|Edit| F6[Edit Bin: Location, MQTT, Capacity, Threshold]
    F5 -->|Upload Photo| F7[Upload Bin Photo]
    F5 -->|Delete| F8[Set Bin Inactive]
    F2 -->|No| F9[+ Add Bin]
    F9 --> F10[Enter Device Code, MQTT Config, Map Location, Capacity]
    F10 --> F11[Test MQTT Connection]
    F11 --> F12[Create Bin]

    D --> G[Routes]
    G --> G1[View Auto-Generated Routes]
    G1 --> G2{Route Status?}
    G2 -->|In Progress| G3[Monitor Live - Auto-Refresh 10s]
    G3 --> G4[View Driver Progress on Map]
    G3 --> G5[View Stop Status Updates]
    G3 --> G6[View Reported Issues]
    G2 -->|Completed| G7[View Route Report]
    G7 --> G8[Review Before/After Photos]
    G7 --> G9[Review Issues & Skipped Stops]
    G7 --> G10[Print Report]
    G2 -->|Planned| G11[View Pending Assignment]

    D --> H[Alerts]
    H --> H1[View All Alerts]
    H1 --> H2[Filter by Type: Overflow / Low Battery / Sensor Anomaly / Offline]
    H2 --> H3{Action?}
    H3 -->|Acknowledge| H4[Mark Alert Acknowledged]
    H3 -->|Delete| H5[Delete Alert]

    D --> I[Analytics]
    I --> I1[View Dashboard Metrics]
    I --> I2[AI Insights - Auto-Generated]
    I --> I3[Fill Level Predictions]
    I --> I4[Collection Performance Charts]

    D --> J[Audit Logs]
    J --> J1[View All System Activity]
    J1 --> J2[Expand Entry for JSON Diff]

    D --> K[Settings]
    K --> K1[General: Subdivision Name, Depot Address]
    K --> K2[Thresholds: Fill %, Low Battery Voltage]
    K --> K3[AI Provider: Ollama / Gemini / OpenRouter]
    K3 --> K4[Test AI Connection]

    D --> L[Feedback & FAQs]
    L --> L1[View All Feedback]
    L1 --> L2[Reply to Feedback]
    L --> L3[Manage FAQs]
    L3 --> L4[Add / Edit / Delete FAQ]

    D --> M[Subdivisions]
    M --> M1[View All Subdivisions]
    M1 --> M2[Create / Edit / Delete Subdivision]

    D --> N[Profile]
    N --> N1[View Profile]
    N1 --> N2[Edit Name / Phone]

    C --> O[Logout]
    O --> P([End])
```

---

## Dispatcher Workflow

```mermaid
flowchart TD
    A([Start]) --> B[Sign In]
    B --> C[Dashboard]
    C --> D{Sidebar}

    D --> E[Smart Bins]
    E --> E1[View All Bins]
    E1 --> E2[Click Bin → Details]
    E2 --> E3[View Telemetry, Edit Bin, Upload Photo]
    E1 --> E4[+ Add Bin with MQTT Config]

    D --> F[Routes — Monitor & Dispatch]
    F --> F1[View All Routes]
    F1 --> F2{Route Status?}
    F2 -->|Planned| F3[Review Assignment]
    F2 -->|In Progress| F4[Monitor Live]
    F4 --> F5[Track Driver Progress]
    F4 --> F6[View Issues in Real-Time]
    F2 -->|Completed| F7[View Route Report]
    F7 --> F8[Review Photos & Issues]
    F7 --> F9[Print Report]

    D --> G[Alerts]
    G --> G1[View & Acknowledge Alerts]

    D --> H[Analytics]
    H --> H1[AI Insights]
    H --> H2[Fill Predictions]
    H --> H3[Performance Charts]

    D --> I[Feedback & FAQs]
    I --> I1[Submit Feedback]
    I --> I2[View FAQs]

    D --> J[Profile]
    J --> J1[Edit Profile]

    C --> K[Logout]
    K --> L([End])
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
    E1 --> E2{Route Status?}
    E2 -->|Planned| E3[Tap Execute Route]
    E3 --> F[Route Execution Screen]
    E2 -->|In Progress| F

    F --> F1[View Stop List with Map]
    F1 --> F2[Start Route]
    F2 --> G[Stop-by-Stop Execution]

    G --> G1[Arrive at Bin Location]
    G1 --> G2[Tap 'Arrive']
    G2 --> G3[Take BEFORE Photo]
    G3 --> G4[Empty / Service Bin]
    G4 --> G5[Take AFTER Photo]
    G5 --> G6[Add Notes - Optional]
    G6 --> G7[Tap 'Service Done']
    G7 --> G8{Photos Upload}
    G8 -->|Success| G9[Stop Marked Serviced]
    G8 -->|Fail| G10[Retry Upload]

    G1 --> H{Issue Found?}
    H -->|Yes| H1[Tap 'Report Issue']
    H1 --> H2[Select Severity: Low / Medium / High / Critical]
    H2 --> H3[Describe Issue]
    H3 --> H4[Attach Photo - Optional]
    H4 --> H5[Submit Issue Report]
    H5 --> H6[Alert Created for Dispatcher]

    G1 --> I{Cannot Access Bin?}
    I -->|Yes| I1[Tap 'Skip']
    I1 --> I2[Select Reason]
    I2 --> I3[Stop Marked Skipped]

    G9 --> J{More Stops?}
    I3 --> J
    J -->|Yes| G1
    J -->|No| K[All Stops Complete]
    K --> K1[Tap 'Complete Route']
    K1 --> K2[Route Report Generated]
    K2 --> K3[AI Verifies Before/After Photos]

    D --> L[Smart Bins]
    L --> L1[View Bin List & Status]
    L1 --> L2[View Bin Details]

    D --> M[Alerts]
    M --> M1[View Alerts]

    D --> N[Feedback]
    N --> N1[Submit Feedback]
    N --> N2[View FAQs]

    D --> O[Profile]
    O --> O1[Edit Profile]

    C --> P[Logout]
    P --> Q([End])
```

---

## Automated Backend Workflow

```mermaid
flowchart TD
    A[ESP32 Bin Sensor] -->|MQTT Publish| B[MQTT Broker<br/>109.123.238.215:1883]
    B -->|Subscribe| C[Backend Telemetry Processor]
    C --> D[Store in bin_telemetry Table]
    C --> E{Fill Level >= Threshold?}
    E -->|Yes| F[Create Overflow Alert]
    C --> G{Battery < 3.3V?}
    G -->|Yes| H[Create Low Battery Alert]
    C --> I{Sensor Anomaly?}
    I -->|Yes| J[Create Sensor Alert]

    K[Route Scheduler<br/>Every 30 Minutes] --> L[Query Bins Above Threshold]
    L --> M{Bins Found?}
    M -->|Yes| N[Group by Subdivision]
    N --> O{AI Service Available?}
    O -->|Yes| P[CVRP Route Optimization<br/>Google OR-Tools]
    O -->|No| Q[Fallback: Sort by Fill Level]
    P --> R[Create Collection Route]
    Q --> R
    R --> S[Create Route Stops]
    S --> T[Assign to Maintenance User]
    T --> U[Route Ready for Execution]
    M -->|No| V[Skip — No Action Needed]

    W[Route Completed] --> X[Generate Route Report]
    X --> Y{Photos Uploaded?}
    Y -->|Yes| Z[AI Verify Before/After Photos]
    Z --> AA[Update Verification Status]
```

---

## Data Flow Summary

| Step | Source | Action | Destination |
|------|--------|--------|-------------|
| 1 | ESP32 Sensor | Publish fill level via MQTT | MQTT Broker |
| 2 | MQTT Broker | Forward to subscriber | Backend Telemetry Processor |
| 3 | Telemetry Processor | Store reading, check thresholds | PostgreSQL + Alerts |
| 4 | Route Scheduler (30min) | Find bins above threshold | AI Service (CVRP) |
| 5 | AI Service | Return optimized route | Backend creates route + stops |
| 6 | Backend | Assign route to maintenance | Mobile app notification |
| 7 | Maintenance (Mobile) | Execute stops, take photos | Backend via REST API |
| 8 | Backend | AI verifies photos | Ollama / Gemini / OpenRouter |
| 9 | Backend | Generate route report | Web dashboard |
| 10 | Dispatcher (Web) | Monitor live, review reports | Dashboard |
