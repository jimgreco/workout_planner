# Workout Planner — Codex Guide

## Efficient Start

- Use this guide and supplied session context before exploring. Check
  `git status --short --branch`, `git diff --stat`, and `git diff --cached --stat`,
  then inspect relevant hunks. Keep unrelated edits and artifacts out of scope.
- Start with the paths below and narrow `rg` searches; expand only when the
  current evidence leaves a concrete question unanswered.

| Work | Start here |
|---|---|
| Web behavior and API calls | `src/`, `src/api.js`, `src/index.css` |
| iPhone UI and shared models | `ios/WorkoutPlanner/Views/`, `ios/WorkoutPlanner/Support/Models.swift` |
| API and request validation | `backend/src/handler.mjs`, `backend/src/validation.mjs` |
| Training evidence | `src/setEvidence.js`, native `isRecordedWorkingSet`, Training evidence below |
| Release or operations | `docs/OPERATIONS.md`, `.github/workflows/deploy.yml`, `.github/workflows/testflight.yml` |

- Pick validation for the affected surface: web tests/lint/build for web work,
  backend tests for API work, and a relevant native build plus screen inspection
  for iOS UI changes. Contract changes require coverage across clients and API.
  Documentation-only edits need diff, path/link, and whitespace review.
- Run checks once after related edits settle. Do not reinstall dependencies,
  repeat passing builds, or run release/backup workflows without a concrete need.
- For requested releases, follow `docs/OPERATIONS.md` and inspect CI for the
  final pushed SHA. Verify live `/api/healthz`, `/api/version`, and applicable
  TestFlight results separately; distinguish upload from tester availability.

## What This Project Is

Rep, Mix, Burn is a React web app plus native SwiftUI iPhone app for tracking workouts.
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
{ id, name, muscleGroup, notes, equipmentAlternatives?: [{ equipmentId }], personalBest: { weight, reps?, date? } }

// Equipment library entry (preloaded and user-created share one collection)
{ id, name, category, details }

// Gym
{ id, name, notes, equipment: [{ id, equipmentId, name, category, details }] }

// Template
{ id, name, description, gymId?, exerciseItems }

// WorkoutLog
{ id, name, date, notes, exerciseItems, startTime, endTime, status, hasPB, pbExerciseIds }

// ExerciseItem
{ exerciseId, weightType, sets }
```

DynamoDB keys:

```text
PK = USER#<providerSub>
SK = EQUIPMENT#<id> | GYM#<id> | EXERCISE#<id> | TEMPLATE#<id> | LOG#<id> | SETTINGS | FEEDBACK#...
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

## Training evidence

Workout sets support optional `completion` (`recorded`, `skipped`, `unrecorded`). Legacy sets count only when actual positive reps are present; placeholders, skipped sets and warm-ups do not count as working-set progress. Keep web `src/setEvidence.js` and native `isRecordedWorkingSet` aligned. RIR is available in normal logging; unknown stays blank in the UI and serializes as `rir: null`; an explicit `"0"` must remain zero. Accept missing/blank RIR from older clients as unknown and never infer that historical zeros were entered deliberately. Native model regression check: `swiftc ios/WorkoutPlanner/Support/Models.swift ios/Tests/WorkoutSetRIRCheck.swift -o /tmp/repmixburn-rir-check && /tmp/repmixburn-rir-check`. Exercise items carry optional `baselineId` and `techniqueNote`; carry these into subsequent workouts and compare only within the current baseline. Preserve prior workouts and avoid comparing new-baseline sets against old global personal bests. Export these fields unchanged.


## Smith load recording

`smith_double` means plates on one side x 2 plus `setupProfile.smithBarWeight` (machine-specific unloaded resistance in pounds, optional 0–500). Missing/null means unknown; explicit zero is valid. Preserve setup snapshots in logs/prescriptions. Unknown Smith totals must not generate volume/estimated-max/PR values; working sets still count and raw plates remain visible. Use `src/weight.js` and native `effectiveRecordedWeight` consistently. Different Smith resistance snapshots are separate comparison contexts. Never default Smith resistance to the standard barbell 45 lb. Native regression check: `swiftc ios/WorkoutPlanner/Support/Models.swift ios/Tests/SmithWeightCheck.swift -o /tmp/repmixburn-smith-check && /tmp/repmixburn-smith-check`.


## Personal bests by setup

Contextual PBs come from finished workout history, keyed by exercise, technique baseline, equipment setup ID, weight mode and Smith resistance snapshot. Web helpers live in `src/progress.js`; matching native helpers live in `Models.swift`. The first eligible working set establishes the setup PB; higher total weight wins, with reps (including side-specific reps) as the tiebreaker. Unknown Smith totals and unweighted sets are ineligible. Keep numeric PB payload strings free of display formatting.

`logsWithPersonalBests` reconstructs contextual badges from full history before date filtering, recovering previously skipped PBs and reflecting corrected/deleted workouts without changing recorded sets. Finish/Save persists the current workout's derived flags; on edit, compare with earlier workouts, never the PB cache produced by that same or a later workout. The existing exercise-level, manually editable PB remains separate for unscoped workouts. Contextual PBs are displayed as Setup PB in workout and exercise views; starting a new technique baseline starts a new record context. Native regression: `swiftc ios/WorkoutPlanner/Support/Models.swift ios/Tests/PersonalBestContextCheck.swift -o /tmp/repmixburn-pb-check && /tmp/repmixburn-pb-check`.
