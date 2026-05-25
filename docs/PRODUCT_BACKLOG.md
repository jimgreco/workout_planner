# Product Backlog

## Next After Progress

### Recently Added

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

### Churn Progress

- 2026-05-25: Documented the backup/export compatibility contract.
- 2026-05-25: Completed explicit set-complete controls for live workouts on web and iOS.
- 2026-05-25: Next live-workout target is rest-timer goals with completion alerts.

### Live Workout Execution

- Add target rest timers with completion alerts.
- Track RPE/RIR per set.
- Support warmup, working, drop, and failure set labels.
- Support supersets and paired exercises.
- Add a plate calculator for weighted lifts.

### Programming And Planning

- Turn freeform progression notes into structured weight/reps rules.
- Add deload and skipped-workout handling.
- Deepen planned-versus-completed reporting beyond the current weekly program view.

### Import And Restore

- Add an import-result history or audit trail if support needs to investigate restores.

### Offline And Conflict Handling

- Add native side-by-side conflict choices on iOS if tester traffic shows multi-device edits are common.
- Consider true iOS background task registration if automatic in-app retry is not enough.
- Expand active-workout recovery tests to browser-level restart coverage once the local dev auth path has stable fixtures.

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
