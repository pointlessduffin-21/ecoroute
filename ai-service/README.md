# AI Service (`ai-service`)

The AI Service is a standalone Python microservice responsible for projecting future waste levels and determining optimized garbage truck routes for the EcoRoute ecosystem.

## Core Responsibilities

1. **Fill-Level Forecasting (LSTM)**  
   Reads historical time-series telemetry data (distance, fill percentage) from the PostgreSQL database and uses a Long Short-Term Memory (LSTM) neural network to predict when a bin will breach its capacity threshold (default 80%).

2. **Route Optimization (CVRP)**  
   When bins are predicted to be full, this service utilizes the Google OR-Tools library to mathematically solve the Capacitated Vehicle Routing Problem (CVRP). It calculates the most efficient driving path for the garbage truck, ensuring the truck's capacity is not exceeded.

## Tech Stack
- **Framework:** FastAPI
- **Machine Learning:** Scikit-Learn (MLPRegressor/LSTM)
- **Mathematical Optimization:** Google OR-Tools
- **Data processing:** Pandas, NumPy
- **Server:** Uvicorn

## Required Environment Variables
You must set these in your `.env` or Docker environment to run the service:
- `DATABASE_URL`: Connection string to PostgreSQL containing the `bin_telemetry` table.
- `GOOGLE_MAPS_API_KEY`: Required to generate the Distance Matrix for route optimization.

## Key Files
- `app/routers/predictions.py`: The API controllers and HTTP routes for taking in manual prediction requests and triggering model training.
- `app/models/lstm_predictor.py`: The core ML logic where the `scikit-learn` algorithms are defined, trained, and saved to disk as a `.pkl` file.

## Running the Service
**Via Docker (Recommended):**
```bash
docker compose up -d ai-service
```

**Local Bare-Metal:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
