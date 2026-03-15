# EcoRoute Project Makefile
# -----------------------------------------------------------------------------
# Helping you manage the AI/IoT Smart Waste Management System.

.PHONY: help up down build rebuild logs logs-backend logs-frontend logs-ai db-push db-seed db-studio backend-shell simulate

# Default target
help:
	@echo "EcoRoute Management Commands:"
	@echo "  make up               - Start all services in detached mode"
	@echo "  make down             - Stop all services and remove containers"
	@echo "  make build            - Build all Docker images"
	@echo "  make rebuild          - Stop, build, and start all services"
	@echo "  make logs             - Follow logs for all services"
	@echo "  make logs-backend     - Follow backend logs"
	@echo "  make logs-frontend    - Follow frontend logs"
	@echo "  make logs-ai          - Follow AI service logs"
	@echo "  make db-push          - Push Drizzle schema to PostgreSQL (local)"
	@echo "  make db-seed          - Seed the database (runs inside backend container)"
	@echo "  make db-studio        - Open Drizzle Studio UI (port 5555)"
	@echo "  make backend-shell    - Open a shell in the backend container"
	@echo "  make simulate         - Run the firmware simulator (local)"

# Docker Lifecycle
up:
	docker compose up -d

down:
	docker compose down --remove-orphans

build:
	docker compose build

rebuild:
	docker compose down --remove-orphans
	docker compose up -d --build

# Logs
logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

logs-ai:
	docker compose logs -f ai-service

# Database & Development
db-push:
	cd backend && bun run db:push

db-seed:
	docker exec -it ecoroute-backend bun run src/db/seed.ts

db-studio:
	cd backend && bun run db:studio

backend-shell:
	docker exec -it ecoroute-backend /bin/sh

simulate:
	cd firmware/simulator && bun run simulate
