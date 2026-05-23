# Forge Workout Planner

A React web app and native SwiftUI iPhone app for tracking gym workouts. Both
clients use the same Node API and DynamoDB table so friends-and-family testers
can sync workouts across devices.

## Stack

| Layer | Choice |
|---|---|
| Web app | React 19 + Vite |
| Native app | SwiftUI iOS 17, Google Sign-In, Sign in with Apple |
| Styling | Vanilla CSS in `src/index.css` |
| API | Node 22 ESM handler behind the EC2 Docker backend container |
| Database | DynamoDB single-table design |
| Deploy | GitHub Actions rsync to EC2, then Docker Compose rebuild/restart |
| Tests | Vitest + Testing Library, Node built-in test runner for backend |

## Architecture

```text
Browser / iOS app
      ↓
workout-planner.jim-greco.com
      ↓
Nginx frontend container → /api proxy → Node API container → DynamoDB
```

Authentication flow:

1. The user signs in with Google or Apple.
2. The client sends the provider ID token to `POST /auth/google` or
   `POST /auth/apple`.
3. The backend verifies the provider token, then returns a 30-day app session.
4. Data requests send `Authorization: Bearer <app session>`.
5. DynamoDB data is keyed by `USER#<provider-sub>`.

## Project Structure

```text
backend/
  src/handler.mjs       API routes and DynamoDB access
  src/session.mjs       app-session JWT minting/verification
  src/validation.mjs    request validation and body limits
  local-server.mjs      local/production Node HTTP wrapper
src/
  api.js                web API client and in-memory cache
  auth.js               web session storage and Google token exchange
  App.jsx               auth gate, nav, account actions, page routing
  pages/                Exercises, Workouts, Burn, History
ios/
  WorkoutPlanner/       native SwiftUI app
.github/workflows/
  deploy.yml            verify → EC2 deploy → live smoke checks
  testflight.yml        signed iOS archive upload
```

## Common Commands

```bash
npm ci
npm test
npm run lint
npm run build

cd backend
npm ci
npm test
npm audit --omit=dev
```

Local web development:

```bash
npm run dev
```

Local API development:

```bash
# requires DynamoDB Local on localhost:8000
node backend/init-table.mjs
node backend/local-server.mjs
```

Production recovery preflight:

```bash
cd backend
USE_AWS=true AWS_REGION="$AWS_REGION" TABLE_NAME="$TABLE_NAME" npm run recovery:check
```

## Required Environment

Copy `.env.example` to `.env` for local development. Production values are
provided to Docker Compose on EC2 by GitHub Actions and/or the remote deploy
environment.

Important production variables:

| Name | Purpose |
|---|---|
| `APP_SESSION_SECRET` | 32+ character secret for signing app sessions |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_IDS` | Google audiences accepted by the API |
| `APPLE_CLIENT_IDS` | Apple audiences accepted by the API |
| `TABLE_NAME` | DynamoDB table name |
| `AWS_REGION` | DynamoDB region |
| `ALLOWED_ORIGINS` | comma-separated browser origins allowed by the API |
| `APP_VERSION` / `GIT_COMMIT` / `BUILD_TIME` | release metadata returned by `/version` |
| `VITE_GOOGLE_CLIENT_ID` | web Google client ID baked into the Vite build |
| `VITE_API_URL` | API base URL for the web build, usually `/api` in Docker |

## Release Notes

The active release path is EC2 + Docker Compose. See `docs/OPERATIONS.md` for
beta release, backup, restore, and support checks.
