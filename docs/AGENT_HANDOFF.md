# Rep, Mix, Burn — coding handoff

Snapshot: **2026-11-02 UTC**. This is a takeover map, not release authorization. Recheck Git status, the requested scope and current runtime before acting. Existing AGENTS.md and linked contract/runbooks remain applicable. Older dated status notes are evidence from their stated date, not current permissions.

## Purpose and architecture

Rep, Mix, Burn plans and records workouts, routines, equipment and progression on web and iPhone.

React19/Vite client plus SwiftUI/Live Activities; Node22 ESM API; account-partitioned DynamoDB single-table storage. Production uses EC2 Compose, with frontend proxying /api to the API.

## Locations and current work

- Usual local workspace: `/Users/jgreco/code/workouts`.
- Source inspected for this handoff: `/Users/jgreco/Documents/Codex/2026-10-25/task/integration-2026-10-30/workouts-release`.
- Existing repository: [jimgreco/workout_planner](https://github.com/jimgreco/workout_planner); default branch `main`, verified source head `f29e7179f56cba4ebddb4fa5e586d2f33e1837c0`.
- Documentation branch: `docs/agent-handoff-2026-11-02`, based on that head; application code was not changed.
- Primary checkout is at `e288b229dac6515d0ffb9ae8f2de1822b7986049` on `main` and differs from remote main. Do not reset it or assume it contains released features; use the inspected source or a new isolated checkout.

## Code and guide map

- [src/api.js](../src/api.js)
- [src/setEvidence.js](../src/setEvidence.js)
- [src/workoutHistory.js](../src/workoutHistory.js)
- [src/equipmentSetups.js](../src/equipmentSetups.js)
- [backend/src/handler.mjs](../backend/src/handler.mjs)
- [backend/src/validation.mjs](../backend/src/validation.mjs)
- [ios/WorkoutPlanner/Support/Models.swift](../ios/WorkoutPlanner/Support/Models.swift)
- [ios/Tests](../ios/Tests)

Read the relevant existing guide before changing its contract:

- [docs/OPERATIONS.md](OPERATIONS.md)
- [docs/EXPORT_IMPORT_CONTRACT.md](EXPORT_IMPORT_CONTRACT.md)
- [docs/training-evidence.md](training-evidence.md)
- [docs/offline-account-boundaries.md](offline-account-boundaries.md)
- [docs/remembered-equipment-setup.md](remembered-equipment-setup.md)

## Local setup and dependencies

Commands below are source-verified entry points, **not commands executed during this documentation pass**. Use disposable local data. Read the command comments and linked setup guide before running migrations, creating fixtures or starting listeners. Reuse prepared environments where suitable.

- `npm ci`
- `npm --prefix backend ci`
- `Start a disposable DynamoDB Local instance on loopback:8000; never substitute the live table.`
- `node backend/init-table.mjs`
- `node backend/local-server.mjs`
- `npm run dev`

Configuration names/locations only; never copy secret values into source, terminal output or handoff documents:

- `APP_SESSION_SECRET`
- `GOOGLE_CLIENT_IDS`
- `APPLE_CLIENT_IDS`
- `VITE_API_URL`
- `VITE_DEV_BYPASS_AUTH`
- `LOCAL_AUTH_BYPASS`
- `USE_AWS`
- `GIT_COMMIT`

Use existing lockfiles/manifests; do not upgrade dependencies to perform a handoff. For native work, select an actually installed Xcode SDK/simulator from the checked-in project configuration.

## Tests and verification

- `npm test`
- `npm run lint`
- `npm run build`
- `npm --prefix backend test`
- `Run relevant Models.swift + ios/Tests/*Check.swift regressions, AccountOfflineSyncCheck and native build/UI checks for changed contracts.`

Documentation-only changes require path/link, accuracy, diff and secret-exclusion review; do not run heavyweight builds or production smoke mutations for prose changes. Application tests were not rerun in this pass. Past test/release evidence below retains its original date. UI changes still require actual rendered inspection, and synthetic tests do not prove real provider/device acceptance.

## Decisions and constraints

- Recorded work is separate from skipped/unrecorded placeholders. Blank RIR stays unknown; explicit zero stays zero. Equipment, Smith resistance and technique baseline define comparison context.
- Deploy backward-compatible API fields before clients send them. placeholderRir compatibility was deployed before build 290; do not reverse that release ordering.
- History date filtering, repeat finished workout, duplicate routine, remembered RIR, skipped-set advancement, direct reps, editable weight and equipment-context PB display are already integrated.
- Preserve pending-entry identity, account/session fences and write serialization. Copies never inherit completion, timers, PB flags, IDs or program advancement.

## Release state and workflow effects

- Web/API: source `f29e7179f56cba4ebddb4fa5e586d2f33e1837c0` deployed and verified October 30 after the backward-compatible API rollout. November 2 native work left the server unchanged.
- Native: version **1.3**, build **290**, source `f29e7179f56cba4ebddb4fa5e586d2f33e1837c0`. **Available in TestFlight**, processing/audience verified November 2 for exactly **1 existing internal tester**; external/public distribution excluded. [Verification evidence](https://github.com/jimgreco/workout_planner/actions/runs/41080363366). No public App Store release was performed.
- Main push automatically runs the native upload workflow; web/API deployment requires its separate explicit dispatch. Use backend-first compatibility sequencing and exact-SHA checks.

Recent exact-source GitHub results observed November 2 (workflow purpose matters):

- [Verify existing TestFlight build run 41463865193](https://github.com/jimgreco/workout_planner/actions/runs/41463865193): `completed` / `success`.
- [Deploy to EC2 run 41080633986](https://github.com/jimgreco/workout_planner/actions/runs/41080633986): `completed` / `success`.
- [TestFlight run 41080363366](https://github.com/jimgreco/workout_planner/actions/runs/41080363366): `completed` / `success`.

The handoff is published on a documentation feature branch, not main. Current checked-in GitHub push triggers are main-only (or absent). Blog hosting branch settings were separately checked. No native release, image publication or server deployment is intended from this documentation push.

## Known gaps and next safe work

- Hands-on Simulator walkthrough for the October 29 controls remains unverified: native CUA reported locked/noWindowsAvailable. Automated checks and actual TestFlight availability passed.
- October 23 regression-test extra2736110 remains paused. Recovery/backup commands can touch databases; inspect Operations before use.

Before the next task, verify source HEAD, dirty/staged work and the selected subsystem; read only the relevant guide. Check whether a listed idea is already implemented in another branch before rebuilding it. Preserve unrelated work and paused experiments. Release/permission/data changes require the applicable current authorization.
