# Product Backlog

## Next After Progress

### Recently Added

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

### Live Workout Execution

- Add target rest timers with completion alerts.
- Add explicit set-complete controls instead of relying only on field blur.
- Track RPE/RIR per set.
- Support warmup, working, drop, and failure set labels.
- Support supersets and paired exercises.
- Add a plate calculator for weighted lifts.

### Programming And Planning

- Add a training program layer above templates.
- Let users schedule workouts by weekday.
- Show a "next workout" view based on the active program.
- Add simple progression rules for weight or reps.
- Add deload and skipped-workout handling.
- Show planned versus completed work.

### Import And Restore

- Document the backup/export compatibility contract.
- Add an import-result history or audit trail if support needs to investigate restores.

### Offline And Conflict Handling

- Add richer side-by-side conflict recovery for resources updated on another device.
- Add background retry scheduling and push-visible sync status on iOS.
- Stress test active workout recovery across app restarts and long offline periods.

### Support And Admin

- Add direct CloudWatch or EC2 log search integration for Request IDs.
- Add richer tester cohort/status tracking once tester metadata exists.
- Add pagination and CSV export to the support admin viewer.
- Add read-only account drilldown for individual exercises, templates, and recent logs.

### Beta And App Store Polish

- Rebalance iOS tab navigation if six tabs feels too crowded after adding Progress.
- Add native crash reporting.
- Add basic privacy-preserving product analytics.
- Prepare App Store screenshots and review metadata.
- Review HealthKit, widgets, Live Activities, and Apple Watch after the core workout loop feels complete.
