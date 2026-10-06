# Planned reps in reserve

`ExerciseItem.targetRIR` is an optional integer from 0 through 10. `null` means
unspecified. It describes the planned reps left after each rep-based working set.
Actual effort remains `WorkoutSet.rir`; there is no inference or copying between
these fields. Warmups and timed movements do not display an RIR target.

Routine and workout editors expose Target RIR. Session creation copies the
routine value into its exercise item and immutable starting prescription. Existing
program-phase `targetRir` remains separately labeled phase guidance; it does not
overwrite, default, or compete with the explicit movement goal.

The native Live panel, lock screen, and expanded Dynamic Island use compact text
such as `Goal 6–10+2`. VoiceOver expands the notation. Compact Dynamic Island uses
the goal when it fits and retains `+2 RIR` when it does not. Pause retains the goal
and freezes existing timing and action behavior.

## Compatibility and release order

No database migration or backfill is needed. Existing records and old payloads
without `targetRIR` remain valid. On an update, omission preserves a target for a
matching exercise already in that account's resource; explicit null clears it.
Removed exercises stay removed. Revision checks and immutable prescriptions remain
in force. Import/export and account-owned offline queues carry the field.

1. Obtain authorization for this feature's publication, then commit/push and verify
   the exact SHA using the normal checks.
2. Follow `OPERATIONS.md` for recovery/preflight and explicitly dispatch the
   server/web release. Deploy the API first: the old API rejects the new key.
3. Verify health/version and planned-target API round trips on an authorized test
   account, then explicitly dispatch TestFlight for the same SHA. Report Apple's
   upload result and tester availability separately.
4. Verify the in-app native Live card, lock-screen and expanded/compact Dynamic
   Island on device, including long/asymmetric ranges, larger text, pause/resume,
   clearing, zero, unilateral reps, warmups and timed exercises.

Do not downgrade the API schema after clients start sending `targetRIR`. A client
rollback can coexist with the new API, which preserves values omitted by older
clients.

## Applying Jim's reviewed routine targets

Read a fresh account-owned routine/export through authorized app access. Record
routine IDs/revisions, exercise IDs/names, set types/counts and rep ranges. Retain a
recoverable before-image and verify recovery evidence before writing. Review the
exercise-specific map; generic compound/isolation guidance is not an inventory.

Write only the reviewed current routine/planned-workout exercise `targetRIR`
values with optimistic revision checks. Preserve every set, rep range, load,
actual RIR, setup, and phase. Never update completed sessions. Stop on any changed
revision or account mismatch. Re-read and compare the exact changed fields after
saving, and retain the before/after diff for recovery.

## Local validation checkpoint — 2026-10-06

- Web: 264 tests passed; backend: 79 tests passed. Focused follow-up suites,
  lint, production web build, and simulator app/extension build passed.
- Swift checks passed for target and actual RIR, persistence, account-owned
  offline sync, pause timing, and Live Activity state serialization and updates.
- Web synthetic editor QA covered setting, zero, clearing, and working-set-only
  display without changing rep prescriptions or actual effort.
- iOS 26.2 local demo QA visually confirmed `Goal 6–10+2` in the in-app Live
  card and lock screen, plus `6–10+2` in compact Dynamic Island. The paused
  lock screen retained the goal and frozen elapsed time; resuming restored
  controls and the same goal. Actual Reps left remained Not sure.
- Accessibility inspection confirmed the rep control exposes the expanded hint
  `Goal 8 to 12 reps, 2 reps in reserve` after combining its child elements.

Expanded Dynamic Island, larger text, and long-range fallback still require
on-device visual acceptance. Their formatting and state logic are covered by
the implementation and automated checks, but simulator screenshots do not
establish physical-device acceptance. No release or production routine write
was performed at this checkpoint.
