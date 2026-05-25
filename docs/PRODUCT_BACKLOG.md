# Product Backlog

## Next After Progress

### Recently Added

- Web and iOS can store structured program progression rules for reps, weight, and double progression.
- Web and iOS can mark the next planned program workout as skipped, and skipped workouts no longer block the next scheduled routine.
- Web and iOS can store program deload cadence rules and show active or upcoming deload weeks.
- Web and iOS show a four-week program adherence summary with completed, skipped, missed, and remaining counts.
- Web and iOS show a simple 45 lb barbell plate breakdown for standard weighted sets.
- Web and iOS can assign routine/log exercises to simple superset groups A-D.
- Web and iOS can label individual sets as working, warmup, drop, or failure sets.
- Web and iOS can track optional per-set RPE and RIR while logging workouts.
- Web and iOS can set exercise-level rest targets, show countdown/overdue rest timers, and alert when a target is reached.
- The export/import compatibility contract is documented for support, testing, and future schema changes.
- Web and iOS now expose explicit set-complete controls in the workout builder, so rest tracking starts from a deliberate tap instead of hidden field-blur behavior.
- Client writes now send backend revisions to prevent silent overwrites.
- Web shows an offline save warning when the browser loses connectivity.
- iOS settings show cloud/local sync status.
- Support operators can read recent feedback through the secret-protected `/admin/feedback` route.
- Web and iOS link to hosted privacy and support pages.
- Empty template libraries can create starter Push, Pull, and Legs workouts.
- Workout log saves can queue locally when the network drops, with pending sync state in web and iOS.
- Support admins have a static secret-protected viewer for feedback, build overview, request-ID helper commands, and email-based account summaries.
- Web and iOS can import Forge JSON exports with preview counts, empty-account restore, merge mode, duplicate-name handling, and existing-ID skips.
- Offline queues now cover exercise/routine updates and deletes, plus workout log deletes, with pending sync counts across web and iOS.
- Web has a first-run start sheet and throttled client-error feedback reports for beta triage.
- Web and iOS now have a server-backed program layer with weekday routine scheduling and next-workout starts.
- Conflict responses now include the cloud copy, web can resolve side-by-side sync conflicts, iOS retries pending sync automatically while active, and active-workout offline recovery is covered by regression tests.
- Successful imports now write compact audit records with source counts, result counts, skipped/renamed samples, and Request IDs for support investigation.
- The support admin viewer now supports feedback pagination, CSV export, and read-only account drilldown for exercises, routines, recent logs, and recent imports.
- Active-workout offline recovery now has browser-restart coverage that reloads the API module from persisted pending storage.
- iOS can review side-by-side sync conflicts and choose either the cloud copy or this iPhone's pending copy.
- iOS registers a background app refresh task to retry pending offline changes after the app moves to the background.

### Churn Progress

- 2026-05-25: Added structured program progression rules while keeping legacy notes.
- 2026-05-25: Added skipped-workout handling for planned program workouts.
- 2026-05-25: Added structured program deload cadence rules and week status summaries.
- 2026-05-25: Added four-week planned-versus-completed adherence summaries for active programs.
- 2026-05-25: Added client-side plate calculator hints for standard weighted sets.
- 2026-05-25: Added optional superset grouping for paired exercises in routines and workout logs.
- 2026-05-25: Added warmup, working, drop, and failure labels for individual logged sets.
- 2026-05-25: Added optional per-set RPE/RIR effort tracking to live workout logging.
- 2026-05-25: Added exercise-level rest timer targets with web and iOS completion alerts.
- 2026-05-25: Documented the backup/export compatibility contract.
- 2026-05-25: Completed explicit set-complete controls for live workouts on web and iOS.
- 2026-05-25: Added import-result audit records and surfaced recent import history in support account drilldown.
- 2026-05-25: Added support admin feedback pagination, CSV export, and account drilldown lists.
- 2026-05-25: Added browser-restart test coverage for queued active workout recovery.
- 2026-05-25: Added native iOS sync-conflict review and resolution.
- 2026-05-25: Added iOS background app refresh registration for pending sync retries.

### Live Workout Execution

No open items in this bucket.

### Programming And Planning

No open items in this bucket.

### Import And Restore

No open items in this bucket.

### Offline And Conflict Handling

No open items in this bucket.

### Support And Admin

- Add direct CloudWatch or EC2 log search integration for Request IDs.
- Add richer tester cohort/status tracking once tester metadata exists.

### Beta And App Store Polish

- Rebalance iOS tab navigation if six tabs feels too crowded after adding Progress.
- Add native crash reporting.
- Add basic privacy-preserving product analytics.
- Prepare App Store screenshots and review metadata.
- Review HealthKit, widgets, Live Activities, and Apple Watch after the core workout loop feels complete.
