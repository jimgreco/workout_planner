# Export And Import Compatibility Contract

Forge exports are portable, user-scoped JSON backups. Web and iOS both use the
same API contract, and the backend remains the source of truth for validation.

## Endpoints

- `GET /export`
  - Requires an app session bearer token.
  - Returns only the authenticated user's data.
  - Strips DynamoDB keys and returns JSON collections.
- `POST /import`
  - Requires an app session bearer token.
  - Accepts `{ "mode": "merge" | "emptyOnly", "data": <export payload> }`.
  - Defaults to `merge` in clients when no mode is supplied.

## Export Payload

The exported JSON object may contain:

```json
{
  "exportedAt": "2026-05-25T00:00:00.000Z",
  "exercises": [],
  "templates": [],
  "logs": [],
  "programs": [],
  "settings": { "defaultSets": 4, "defaultReps": 8 },
  "feedback": []
}
```

Collection names intentionally match the API data model. The product UI calls
`templates` routines, but exports keep the API field name for compatibility.

## Import Validation

Imports are validated with the same resource validators used by normal writes:

- Exercises: `id`, `name`, `muscleGroup`, optional `notes`, optional
  `personalBest`.
- Templates/routines: `id`, `name`, optional `description`, and
  `exerciseItems`.
- Workout logs: `id`, `name`, `date`, `exerciseItems`, `status`, and optional
  notes/timing/PB fields.
- Programs: `id`, `name`, `schedule`, optional `description`, `active`, and
  `progressionRule`.
- Settings: `defaultSets` and `defaultReps`.

Unknown top-level import keys and unknown resource fields are rejected. The
`exportedAt` field is accepted for provenance but is not written as account
data. The `feedback` collection is exported for support context, but is not
imported into the destination account.

Import limits are intentionally larger than normal app use:

- Up to 1,000 exercises.
- Up to 1,000 templates/routines.
- Up to 2,000 workout logs.
- Up to 100 programs.
- Up to 80 exercises per template/log.
- Up to 50 sets per exercise item.
- Rest targets are stored as optional `restTargetSeconds` values on exercise
  items and must be between 0 and 3,600 seconds.
- Supersets are stored as optional `supersetGroup` values on exercise items and
  must be `A`, `B`, `C`, or `D`.
- Set labels and effort are stored as optional `setType`, `rpe`, and `rir`
  strings on individual sets. `setType` must be `warmup`, `working`, `drop`, or
  `failure`.
- Up to 70 schedule entries per program.

## Import Modes

### Merge

`merge` is the default and is safe for non-empty accounts.

- Existing IDs are skipped and never overwritten.
- New exercises, templates/routines, logs, and programs are inserted.
- Exercise, template/routine, and program name collisions are renamed with
  `(imported)`, then `(imported 2)`, and so on.
- Workout log name collisions are checked per date and renamed the same way.
- Imported settings replace current settings when the export includes settings.

### Empty Account

`emptyOnly` is for full-account restores.

- The backend refuses the import with `409` if the destination already has any
  exercise, template/routine, workout log, or program records.
- Settings alone do not make the account non-empty.
- When allowed, imported records are written directly after validation.

## Versioning Notes

Exported `revision` and `updatedAt` fields are accepted by import files for
backward compatibility, but imported resources are written with fresh backend
revision metadata in the destination account. Do not depend on exported revision
numbers surviving a restore.

When adding a new persisted field, update this contract, backend validation,
web models, iOS models, and import tests together.
