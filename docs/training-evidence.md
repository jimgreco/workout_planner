# Training evidence

Programs may carry an inclusive endDate, scheduledActivation and up to 24 nonoverlapping phases. A phase can cap working sets per exercise, specify targetRir and disable optional training suggestions. Warm-up sets do not consume the cap. Phase gaps use the routine's own prescription. The most recent eligible active/scheduled start date takes priority; after that program ends, an older program is not silently reactivated.

A log created from a routine stores a prescription snapshot with stable routine/program IDs, names, day, phase, optional classification and exercise/set targets. The API preserves an existing prescription when a log is edited or an older client omits it. Later edits to routines or phases do not change it. Legacy logs use name matching for adherence; new logs use routine IDs. Optional work is counted separately and is never missed required work. Starting an active program's bonus routine directly retains its optional classification.

Equipment setups are named snapshots on exercise items. They include gym, machine, seat/bench setting, grip and load convention. Saved setups can be selected from the exercise's history. Each setup's ID is its comparison baseline; selecting a new setup clears stale load suggestions. Existing workout snapshots are not rewritten when a new setup is added. All fields round-trip through the normal account export.

Analysis remains in original exports for review outside the app. These features do not add an automated nutrition/training report or shared sign-in across apps.
