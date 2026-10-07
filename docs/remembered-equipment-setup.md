# Remembered equipment setups

New workout items preselect the last equipment setup selected or used for that
exercise. The choice stays editable in the existing **Equipment setup** picker
(including the native live workout card). An exercise ID identifies the movement;
equipment categories and exercise names are not preference keys.

The account's finished workout logs are the durable source. An exercise occurrence
qualifies when it has recorded positive reps/time, including warmup sets, or when
the user explicitly selected a setup. The optional `setupSelectionMade` Boolean
records that explicit action, including **Unspecified**. Simply loading a routine,
accepting a suggested default without using it, skipping the exercise, cancelling
a setup editor, or discarding a plan/workout does not teach a new preference.
Finishing commits the choice. Existing eligible history works without a migration.

An explicit routine setup or technique baseline takes priority over remembered
history. Only newly created exercise items receive defaults. Resumed sessions,
current choices, saved prescriptions and historical snapshots are not redefaulted.
Substitution clears the replaced movement's setup and resolves the new exercise ID.
Session end/start time (then date and ID) determines most recent use; an old
workout's `updatedAt` cannot promote it above a later session.

Deleted setup IDs are rejected. A deleted latest setup results in **Unspecified**,
not a fallback to a different older machine. Current library settings supersede
old setup details when starting a new item, while old logs keep their snapshots.
A changed Smith resistance cannot reuse incompatible historical loads. A choice
without recorded sets can establish the setup, but cannot invent weight/rep history.

Setup choices save immediately through the existing account-owned workout queue.
Resume reads pending intent while responses are outstanding, so rapid navigation,
late acknowledgements and queued deletions cannot restore an older selection.
Backend preservation keeps this optional field when an older client omits it,
but only for the same exercise/setup/baseline in the same existing resource.

## Validation and release

- Web: `npm test -- --maxWorkers=2` (290 tests), lint and production build.
  Tests exercise both routine launch paths, manual add/substitution, editable and
  unspecified choices, immediate saves/held responses, remounts, editor cancel,
  discard, deleted setups, unchanged history, Pause/Resume and target RIR.
- Backend: `npm --prefix backend test -- --test-concurrency=2` (83 tests).
  Includes validation/import round-trip, old-client preservation and account scope.
- Native: `RememberEquipmentSetupCheck`, `AccountOfflineSyncCheck`, target/actual
  RIR, pause, Smith, contextual PB and workout-persistence checks. The real store
  uses isolated defaults, an isolated snapshot folder and synthetic URLProtocol;
  it covers full offline recreation, pending choices/deletions, discard,
  account switching and late responses. No production writes are involved.
- Unsigned Debug simulator build, generic simulator destination, isolated
  DerivedData and copied package sources, `-jobs 2`.

The Mac is locked; computer-use inspection reported that it could not unlock it.
Native visual/physical acceptance is therefore unverified. Web tests prove
persistence through offline saves and pending-queue reload, not a fully offline
cold browser launch: the existing web bootstrap still requires API access.

No push, deployment or TestFlight upload is part of this work. Release the API
validator before or with the updated clients; the older API rejects the new field.
The feature is based on unpublished recovery candidate
`d08afd9845894290907c6b6b2e732a0adabea31d` and must retain its Pause/Resume, RIR and
account-recovery changes. The release coordinator's direct-user approval gate
remains in effect.
