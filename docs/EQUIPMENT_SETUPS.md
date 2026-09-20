# Exercise equipment setups

Each exercise can store an optional `equipmentSetups` array. Web and iPhone
show that library beneath the exercise, alongside setups discovered in workout
history, prescription snapshots, and routines. IDs are deduplicated; saved
library values override historical copies. Labels use gym + equipment, with the
old name only as a fallback for legacy records. The editor no longer asks for a
title. A derived `name` remains in the API for older clients.

Editing a library setup retains its ID and comparison baseline. New workouts
resolve that ID to the current library details. Past workout snapshots remain
unchanged. Creating a different equipment/load setup generates a new ID.
Exercise writes from older clients that omit the library preserve it.

## Reviewed equipment-only consolidation

The default library contains 59 movements instead of 65. Reviewed families:

| Movement | Equipment variants consolidated |
| --- | --- |
| Chest Press | Barbell bench, dumbbell bench, chest press machine |
| Incline Chest Press | Barbell and dumbbell incline press |
| Overhead Press | Barbell and dumbbell shoulder press |
| Biceps Curl | Barbell, dumbbell, cable |
| Chest Fly | Dumbbell fly and cable crossover |
| Reverse Fly | Dumbbell, cable, reverse pec deck |
| Chest Supported Row | Generic and dumbbell variants |
| Hip Thrust | Generic, barbell, Smith, machine |
| Standing Calf Raise | Generic and Smith |
| Seated Calf Raise | Generic and dumbbell |
| Step-up | Generic and weighted |

Not every family occurs in the default library. For the audited production
account these families remove 18 duplicate entries from 101, leaving 83.
Keep incline/high-incline distinctions, squat positions, unilateral rows,
hammer/preacher/incline curls, and seated/lying leg curls. Ambiguous names such
as Low Pull and Lawnmower require clarification and are left alone.

## Account migration

`backend/reconcile-exercise-setups.mjs` defaults to a dry run. Run it in the
configured backend environment with `--gym-id <owned-gym-id>`. Apply only for
the intended account using `--apply --backup-dir <durable-directory>`.

Before applying, save an additional private account backup outside the
container. Each family is an atomic DynamoDB transaction, conditional on the
original records remaining unchanged. The script refuses oversized families,
validates resulting API payloads, and checks for dangling references.

The migration:
- creates setups for legacy equipment variants, retaining existing setup IDs;
- preserves sets, loads, dates, workout IDs, and explicit baselines;
- rewrites exercise references in routines, logs, prescription snapshots, and PB IDs;
- preserves unilateral tracking and source cues on the exercise items;
- stores original exercise records, including manual PBs and notes, under
  `EXERCISE_ARCHIVE#equipment-setups-v1#<id>`;
- clears the consolidated global PB because equipment loads are not comparable.

Archived source records are operational recovery data, outside the normal
exercise list/export. Keep the private backup for recovery of original manual
PBs and notes. Re-running completed families is a no-op. If a later family fails,
fix the cause and re-run; completed families are already consistent.
