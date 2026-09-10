# Gyms and routine assignments

Gyms belong to the signed-in account. A gym holds an equipment inventory; a
routine optionally references one gym by `gymId`. Multiple routines can use the
same gym. Routines without a gym work as before. Gym inventories are independent
of exercise setup profiles (machine seat, grip, and load baselines).

On web, open **Build → Gyms** (or **More → Gyms** on mobile). On iPhone, use the
building icon in **Program**, or **Settings → Gyms & equipment**. Add a gym,
record equipment, then choose **Gym** while editing a routine. Common equipment
shortcuts only add entries when tapped; no inventory is assumed automatically.

**Build with AI** previews a text brief that can be copied on either client and
shared on iPhone. From a routine editor it includes that routine's prescription
and its assigned gym's equipment. The user supplies the brief to their chosen AI
conversation; Forge does not send it automatically. Weight ranges and units,
models, and attachments are free text in equipment details. Nothing is inferred
about equipment that has not been recorded.

## API

Use the existing API base URL and `Authorization: Bearer <app session>` for every
request. Paths below are relative to `/api`.

- `GET /gyms`: list your gyms.
- `GET /gyms/:id`: retrieve one gym; 404 if not in your account.
- `PUT /gyms/:id`: create or replace an inventory. Use a stable client-generated ID.
- `DELETE /gyms/:id`: remove a gym. Returns 409 while any routine references it.
- `PUT /templates/:id`: save a routine with optional `gymId`. It must identify a
  gym in the same account. Send `null` to unassign the routine. Omitting the
  field preserves an existing association for compatibility with older clients.

Example `PUT /gyms/home`:

```json
{
  "id": "home",
  "name": "Home gym",
  "notes": "Garage; limited ceiling height",
  "equipment": [
    {
      "id": "dumbbells",
      "name": "Adjustable dumbbells",
      "category": "Free weights",
      "details": "5–50 lb per hand, 5 lb increments"
    },
    {
      "id": "bench",
      "name": "Adjustable bench",
      "category": "Benches & racks",
      "details": "Flat and incline; no decline"
    }
  ]
}
```

Example `PUT /templates/home-push`:

```json
{
  "id": "home-push",
  "name": "Home push day",
  "gymId": "home",
  "exerciseItems": []
}
```

For an existing routine, retain its full `exerciseItems` and other fields when
setting `gymId`; PUT replaces the routine. Gym responses include `revision` and
`updatedAt`; send the last received revision as `expectedRevision` when editing.
A stale revision returns 409. Gym writes use the existing resource revision
mechanism; its concurrency limitations are the same as other Forge resources.

Categories: `Free weights`, `Machines`, `Cables`, `Benches & racks`, `Cardio`,
`Accessories`, `Other`. Names are required and limited to 120 characters. Gym
notes allow 2,000 characters. Each of up to 200 equipment entries has a unique
ID, required name, optional category (defaults to `Other`), and up to 500
characters of details. An empty inventory is allowed while recording a gym.

Gyms use `PK = USER#<accountSub>`, `SK = GYM#<id>`. Export includes `gyms` and
routine `gymId` values. Import accepts up to 100 gyms, preserves associations,
skips existing gym IDs in merge mode, and renames colliding gym names. A routine
whose gym is absent from both the import and the account rejects the import
before writes. Old backups without gyms remain supported. Account deletion
removes gym records too.

Gym saves require a successful online request before either client updates its
inventory. Errors retain the editor for retry. iPhone caches inventories in its
account-owned offline snapshot for reading; gym edits are not queued offline.
Local demo data follows the app's existing demo lifecycle.

## Exercise equipment alternatives

Exercises optionally carry `equipmentAlternatives`, an array of zero to 100
unique `{ "gymId": "home", "equipmentId": "dumbbells" }` references. The gym
and equipment IDs together identify a specific inventory entry, so different
gyms may safely use the same equipment ID. Each reference must exist in the
same account. Multiple entries mean **OR**: any one is an acceptable alternative.
Empty or omitted means no requirement has been recorded, and does not assert
that the exercise is bodyweight-only.

Select these in the exercise editor on web or iPhone. A routine's assigned gym
shows the alternatives available there; the AI brief includes those matches.
If none match, the brief explicitly says no alternative is recorded at that gym.
Alternatives from other gyms do not imply availability at the selected gym.

Example fields to include in an existing exercise's full PUT payload:

```json
{
  "equipmentAlternatives": [
    { "gymId": "home", "equipmentId": "dumbbells" },
    { "gymId": "downtown", "equipmentId": "chest-press" }
  ]
}
```

Send `[]` to remove all associations. Omitting the field preserves existing
associations when older clients save an exercise. Gym deletion and inventory entry removal
are blocked while exercises reference the equipment; remove those associations
first. Export/import preserves the references and requires the referenced gym
inventories to be included or already present in the target account.
