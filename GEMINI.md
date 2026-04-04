# Workout Planner — Gemini Guide

## Deployment (EC2 + Docker)
Migrated from a serverless SAM-based deployment to a consolidated EC2 instance (`18.219.163.101`).

### Infrastructure Details
- **Frontend**: React (Vite) served via Nginx in a Docker container.
- **Backend**: Node.js container running the Lambda handler via a local server wrapper.
- **Database**: DynamoDB Local running as a Docker container (shared across projects if needed).
- **CI/CD**: GitHub Actions auto-deploy on push to `main`.

### Auto-Deployment Workflow
1. GitHub Action checks out code.
2. `rsync` transfers the project files to the server.
3. Server runs `docker-compose build workout_frontend workout_api && docker-compose up -d workout_frontend workout_api`.

## Key Files
- **`Dockerfile`**: Multi-stage build for frontend (Nginx) and backend (Node.js).
- **`backend/init-table.mjs`**: Initializes the `workout-planner` table in DynamoDB Local on startup.
- **`backend/local-server.mjs`**: Wraps the Lambda handler to run as a persistent Express-like server.

## Environment Variables (Production)
Managed in `~/deploy/.env` on the EC2 instance:
- `WORKOUT_GOOGLE_CLIENT_ID`: Google OAuth Client ID for both frontend build and backend verification.
- `AWS_ENDPOINT_URL_DYNAMODB`: Points to `http://dynamodb:8000`.

## Routing
- **Frontend**: `workout.jim-greco.com` (Example domain)
- **Backend API**: `workout-api.jim-greco.com` (Example domain)
- Configured via Nginx Proxy Manager on the EC2 instance.
