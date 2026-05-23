# Workout Planner — Codex Guide

## What This Project Is

Forge is a React web app plus native SwiftUI iPhone app for tracking workouts.
Both clients sync through the same Node API and DynamoDB table.

## Current Deployment Shape

The active production path is EC2 + Docker Compose.

```text
Browser / iOS app
      ↓
Nginx frontend container
      ↓ /api
Node API container
      ↓
DynamoDB
```

## Key Tech

| Layer | Choice |
|---|---|
| Web UI | React 19 + Vite |
| Native UI | SwiftUI iOS 17 |
| Styling | Vanilla CSS in `src/index.css` |
| API | Node 22 ESM, `backend/src/handler.mjs` |
| Auth | Google/Apple provider token exchange → signed app session |
| Database | DynamoDB single-table |
| Deploy | GitHub Actions → rsync to EC2 → Docker Compose rebuild/restart |
| Tests | Vitest + Testing Library, Node built-in backend tests |

## Auth Contract

- Provider ID tokens are sent only to `POST /auth/google` or `POST /auth/apple`.
- The backend verifies provider tokens with real expiry/audience checks.
- The backend returns a 30-day app session: `{ token, expiresAt, user }`.
- Data routes require `Authorization: Bearer <app session>`.
- Web stores the app session in localStorage with expiry enforcement.
- iOS stores the app session in Keychain.
- Dev bypass is local-only: `VITE_DEV_BYPASS_AUTH=true` plus `LOCAL_AUTH_BYPASS=true`.

## Data Model

```js
// Exercise
{ id, name, muscleGroup, notes, personalBest }

// Template
{ id, name, description, exerciseItems }

// WorkoutLog
{ id, name, date, notes, exerciseItems, startTime, endTime, status, hasPB, pbExerciseIds }

// ExerciseItem
{ exerciseId, weightType, sets }
```

DynamoDB keys:

```text
PK = USER#<providerSub>
SK = EXERCISE#<id> | TEMPLATE#<id> | LOG#<id> | SETTINGS | FEEDBACK#...
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
# requires DynamoDB Local or USE_AWS=true AWS credentials
npm run recovery:check
```

Local API:

```bash
# requires DynamoDB Local on localhost:8000
node backend/init-table.mjs
node backend/local-server.mjs
```

## Development Guidelines

- All web API calls go through `src/api.js`.
- Keep web and iOS behavior in parity when touching visible product behavior.
- Backend request shape changes must update `backend/src/validation.mjs`, web,
  iOS, and tests together.
- Keep `backend/local-server.mjs` safe for both local dev and production Docker:
  local defaults only apply when not production.
- Use `docs/OPERATIONS.md` for release, backup, restore, rollback, and support
  checks.
- `GET /healthz` and `GET /version` are public production smoke endpoints.
- Server errors include `requestId` and `X-Request-Id`; preserve those in
  support-facing client messages.
