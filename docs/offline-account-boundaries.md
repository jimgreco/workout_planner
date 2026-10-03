# Offline work belongs to an account

Web and native pending log, library and conflict queues are stored under the canonical account subject returned by the backend. Ordinary sign-out clears visible memory and cancels the old session's work, while preserving its durable queue. Returning to the same account makes that work available again. A different account cannot load, merge, resolve or replay it through the app.

Each asynchronous operation captures the session generation. Requests check that generation before selecting credentials, after obtaining credentials, after network completion, and before touching current state. Web session identity and credentials are persisted as one atomic record, so another tab cannot observe a new token paired with an old profile. A storage event reloads that tab to discard rendered data and editors without clearing the new shared session. Native profile changes and automatic sign-out reset the store; native app credentials are bound to the canonical subject inside one Keychain record. Delayed authentication responses cannot restore a signed-out session.

Queueable mutations are journaled before their network attempt. This preserves an initial save if the user signs out while the network is pending. Acknowledgments remove only the exact journaled change; a later edit is retained. An uncertain successful response may consequently require the existing revision-conflict review on retry. Successful account deletion clears only that account's known storage and invalidates late callbacks. It does not solve the server's broader in-flight account-deletion concurrency limitations.

## Upgrade and recovery

Both clients intentionally require sign-in again when moving from the old split/unbound credential format. Queues under `*.v1` never recorded an owner, so assigning them to the current account would risk moving somebody else's health data. These bytes remain untouched and quarantined. They are excluded from account views, pending-sync counts, conflict resolution and replay. The app shows a generic preserved-work notice. Do not clear browser data or remove the app before recovery.

There is no automatic owner inference or bulk adoption. Recovery requires the user's explicit account attribution and review of the retained local work through a separately authorized support process. No support upload, production repair or discard action is included in this patch. Existing native snapshots contain an owner and may be loaded only for that exact owner; new snapshots have separate account files. A provider link that changes the canonical subject likewise requires verified recovery of old-subject pending work rather than automatic reassignment.

Browser localStorage and native UserDefaults/snapshot files remain device storage, not independent OS-user security boundaries. Account scoping prevents app-level cross-account replay and display; it does not encrypt records against someone who can inspect that browser profile or device files. Macrovana's protected persistence is a useful follow-up baseline. Retaining unknown legacy data after account deletion is deliberate because ownership cannot be proved.

## Regression checks

- `src/test/api-account-isolation.test.js`: both queue families, normal sign-out, account switching, late success/network failure/401, A → B → A, interrupted flush, legacy quarantine, late authentication, and deletion fencing.
- `ios/Tests/AccountOfflineSyncCheck.swift`: compiles the real `WorkoutStore`, `WorkoutAPI` and models, with synthetic auth and an intercepted URLSession, an isolated UserDefaults suite and a temporary snapshot directory. Checks owned log/library queues, automatic memory reset, late results and interrupted replay. No provider, cloud, health record or physical device is used.
- Compile the native check with `swiftc` using `ios/WorkoutPlanner/Support/Models.swift`, `ios/WorkoutPlanner/Services/WorkoutAPI.swift`, `ios/WorkoutPlanner/Services/WorkoutStore.swift` and the check file. Full unsigned Xcode compilation is a separate gate; live OAuth and a physical-device UI journey remain separate validation.
