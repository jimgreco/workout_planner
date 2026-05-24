# Product Backlog

## Next After Progress

### Recently Added

- Client writes now send backend revisions to prevent silent overwrites.
- Web shows an offline save warning when the browser loses connectivity.
- iOS settings show cloud/local sync status.
- Support operators can read recent feedback through the secret-protected `/admin/feedback` route.
- Web and iOS link to hosted privacy and support pages.
- Empty template libraries can create starter Push, Pull, and Legs workouts.

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

- Add a user-facing import flow for exported Forge JSON.
- Validate import previews before writing data.
- Support restore into an empty account first.
- Add duplicate handling for exercises, templates, and logs.
- Document the backup/export compatibility contract.

### Offline And Conflict Handling

- Add an offline write queue for iOS workout logging.
- Show sync status for unsent workout changes.
- Add richer conflict recovery actions for resources updated on another device.
- Keep active workouts resilient when gym connectivity drops.

### Support And Admin

- Add a full admin feedback viewer UI.
- Add request-ID search helpers for support triage.
- Add account lookup by verified email.
- Add a read-only user summary for support cases.
- Add lightweight tester status and build metadata review.

### Beta And App Store Polish

- Rebalance iOS tab navigation if six tabs feels too crowded after adding Progress.
- Add fuller first-run onboarding beyond starter workout templates.
- Add crash reporting.
- Add basic privacy-preserving product analytics.
- Prepare App Store screenshots and review metadata.
- Review HealthKit, widgets, Live Activities, and Apple Watch after the core workout loop feels complete.
