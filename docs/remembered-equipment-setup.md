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

An unchanged routine remembers the equipment override from its latest eligible
finished occurrence of that exercise, including an explicit **Unspecified**.
The original saved prescription must match the current routine's setup ID,
baseline and technique note. When the routine has an `updatedAt` timestamp, it
must be valid and no later than that workout's valid start time. A later edit,
missing prescription, different routine or changed comparison context keeps the
routine's explicit constraint. Legacy routines without an edit timestamp still
require matching prescription provenance. A technique-only change on the same
equipment cannot override an explicitly prescribed technique baseline.

This uses existing finished logs and prescription snapshots; no additional
preference record, migration or historical rewrite is needed. Both routine launch
paths pass the current routine into the resolver. Only newly created exercise
items receive defaults. Resumed sessions,
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

- Web: `npm test -- --maxWorkers=1`, lint and production build.
  Tests exercise both routine launch paths, manual add/substitution, editable and
  unspecified choices, immediate saves/held responses, remounts, editor cancel,
  discard, deleted setups, unchanged history, Pause/Resume and target RIR. Routine
  regression cases cover edited prescriptions, explicit Unspecified, deleted
  overrides, same-ID account isolation and finish/relaunch on both launch paths.
- Backend contract checks: `npm --prefix backend test -- --test-concurrency=1`.
  Includes validation/import round-trip, old-client preservation and account scope.
- Native: `RememberEquipmentSetupCheck`, `AccountOfflineSyncCheck`, target/actual
  RIR, pause, Smith, contextual PB and workout-persistence checks. The real store
  uses isolated defaults, an isolated snapshot folder and synthetic URLProtocol;
  it covers full offline recreation, pending choices/deletions, discard,
  account switching and late responses. No production writes are involved.
- Unsigned Debug simulator build, generic simulator destination, isolated
  DerivedData and copied package sources, `-jobs 2`.

The October 20 correction also passed a synthetic iPhone simulator journey using
the real store, views and resolver: choose different equipment, record a set,
finish, terminate/relaunch, and start the same routine. The fixture blocks all API
requests and restores persisted account-owned data; it never seeds finished logs.
Physical-device and production-account acceptance remain separate release gates.
Web tests prove offline saves and pending-queue reload; a cold browser launch
still requires the existing API bootstrap.

This correction uses fields already supported by the API and needs no new schema
or historical data migration. No push, deployment or TestFlight upload is part of
the implementation validation. Main pushes currently trigger TestFlight, so a
local commit is not release authorization. Retain the release coordinator's
direct-user approval gate.
