# Gyms, equipment, and routine assignments

Each account has one equipment library. It starts with 112 editable entries for
free weights, machines, cables and attachments, benches and racks, cardio, and
accessories. Equipment you add uses the same list and editor as preloaded entries.
A gym records which library entries it has, along with local details such as
machine models, weight ranges, and access restrictions. A routine optionally
references one gym. No equipment is automatically assumed to exist at a gym.

On web, open **Build → Gyms** (or **More → Gyms** on mobile), then **Equipment
library**. On iPhone, use **Settings → Equipment library**, or open it from Gyms
or an exercise editor. When editing a gym, use **Choose equipment** and record
local details below each selection. Add new entries in the library and reuse them
across gyms and exercises. Changes to a library name or category appear wherever
that entry is used; gym-specific details remain unchanged.

## API

All paths are relative to `/api` and require `Authorization: Bearer <app session>`.

- `GET /equipment`: load the account’s equipment library, preloading missing entries.
- `PUT /equipment/:id`: create or edit `{ id, name, category, details }`.
- `DELETE /equipment/:id`: remove an unused library entry; returns 409 if a gym or
  exercise uses it. Removed preloaded entries do not reappear on the next load.
- `GET /gyms` and `GET /gyms/:id`: list gyms or retrieve one owned gym.
- `PUT /gyms/:id`: create or replace a gym inventory.
- `DELETE /gyms/:id`: remove a gym; returns 409 while a routine references it.
- `PUT /templates/:id`: save a routine with optional `gymId`. Send `null` to
  unassign. Omitting the field preserves the existing association for older clients.

Equipment and gym names are required, up to 120 characters. Equipment descriptions
and gym inventory details allow 500 characters; gym notes allow 2,000. Categories
are `Free weights`, `Machines`, `Cables`, `Benches & racks`, `Cardio`, `Accessories`,
and `Other`. A gym supports up to 200 inventory entries. Responses include
`revision` and `updatedAt`; send `expectedRevision` when editing. PUT replaces
other resource fields, so retain the full resource payload when changing a link.

Example `PUT /gyms/home`:

```json
{
  "id": "home",
  "name": "Home gym",
  "notes": "Garage; limited ceiling height",
  "equipment": [
    {
      "id": "home-dumbbells",
      "equipmentId": "eq-adjustable-dumbbells",
      "name": "Adjustable dumbbells",
      "category": "Free weights",
      "details": "5–50 lb per hand, 5 lb increments"
    },
    {
      "id": "home-bench",
      "equipmentId": "eq-adjustable-bench",
      "name": "Adjustable bench",
      "category": "Benches & racks",
      "details": "Flat and incline"
    }
  ]
}
```

The inventory `id` identifies that gym’s entry; `equipmentId` identifies the
library entry. The API resolves library names and categories from that ID.
Gym inventory is independent of exercise setup profiles and load baselines.

## Exercise equipment alternatives

Exercises have zero to 100 `equipmentAlternatives` referencing the equipment
library, independently of any gym. Multiple selections mean **OR**, identifying
alternative main implements or stations. A bench, rack, plates, or attachment
needed to perform the movement must still be confirmed in the inventory.

```json
{
  "equipmentAlternatives": [
    { "equipmentId": "eq-dumbbells" },
    { "equipmentId": "eq-adjustable-dumbbells" }
  ]
}
```

All 65 preloaded exercises have mappings, with empty selections for bodyweight
movements such as Plank. Existing exercises with a preloaded name and muscle group receive the same
mappings when loaded; their notes and other fields remain intact. Explicit user selections, including `[]`, take precedence.
An empty selection by itself does not prove a movement is bodyweight-only.
Send `[]` to clear associations. Omitting the field preserves stored associations.

Older `{ gymId, equipmentId }` references remain accepted. On library load,
legacy inventories receive stable library links and old exercise references are
converted with conditional updates. Matching equipment names reuse the preloaded
entry; other equipment becomes a library entry. Gym details, exercise history,
personal bests, and other user fields are preserved. A concurrent edit wins over
a migration update, which can retry on the next load.

## AI briefs and backups

**Build with AI** previews a brief to copy or share into the user’s chosen AI
conversation. Forge does not send it automatically. A routine brief includes its
prescription and equipment alternatives available at the selected gym. Unmatched
alternatives are reported explicitly, and supporting equipment must be checked.

Export includes `equipment`, `gyms`, exercise equipment references, and routine
`gymId`. Import accepts up to 1,000 library entries and 100 gyms. It validates
references before writing and skips existing IDs in merge mode. Old backups
without an equipment library remain supported. Account deletion removes library
records and deletion markers along with the rest of the account.

Equipment and gym writes require a successful online response; editors retain
changes when a request fails. iPhone caches both in the account-owned offline
snapshot. These edits are not queued offline. Local demo data follows the existing
demo lifecycle.
