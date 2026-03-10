# Frontend Web Dashboard (`frontend`)

The EcoRoute Admin Web Dashboard is a single-page application (SPA) focused on providing real-time operational visibility into the smart waste management system. 

It allows administrators and dispatchers to:
- Monitor bin fill-levels in real time
- Manage system alerts and anomalies
- Track driver performance metrics
- Generate & manage daily collection route manifests

## Architecture
- **Framework:** React 18 
- **Build Tool:** Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** shadcn/ui

## Project Structure
- `src/components/layout/`: The core application shell, Sidebar, Header.
- `src/components/ui/`: Reusable, atomic shadcn/ui components (buttons, badges, inputs).
- `src/pages/`: The core views mapped to routes (e.g., `dashboard.tsx`, `analytics.tsx`, `bins.tsx`).
- `src/lib/api.ts`: Centralized Axios HTTP client configuration and API helper functions holding bearer tokens to communicate with the `backend`.

## Environment Variables
The dashboard expects the API URL to be supplied via a `.env` file for local development:
```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

## Setup & Running

**Development Server:**
```bash
bun install
bun run dev
```
By default, this will spin up the web dashboard at `http://localhost:5173`.
