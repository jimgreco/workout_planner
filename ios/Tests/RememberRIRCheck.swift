import Foundation

@main struct RememberRIRCheck {
    static func main() throws {
        func log(_ date: String, _ sets: [WorkoutSet], status: String = "finished") -> WorkoutLog {
            WorkoutLog(id: date, name: "Synthetic", date: date, exerciseItems: [ExerciseItem(exerciseId: "press", sets: sets, targetRIR: 3)], status: status)
        }
        let zero = WorkoutSet(reps: "8", rir: "0", completion: "recorded")
        let old = log("2026-10-01", [WorkoutSet(reps: "8", rir: "4", completion: "recorded")])
        let latest = log("2026-10-02", [zero, WorkoutSet(reps: "8", rir: "9", setType: "warmup"), WorkoutSet(reps: "8", rir: "9", completion: "skipped"), WorkoutSet(reps: "8", rir: "9", completion: "unrecorded")])
        let logs = [old, latest, log("2026-10-03", [WorkoutSet(reps: "8", rir: "6")], status: "active"), log("2026-10-04", [zero], status: "planning")]
        precondition(lastExerciseRir("press", logs: logs) == "0")
        precondition(lastExerciseRir("press", logs: logs.reversed()) == "0")
        precondition(lastExerciseRir("row", logs: logs) == nil)
        precondition(lastExerciseRir("press", logs: []) == nil)
        for value in [nil, "", " ", "11", "-1", "2.5", "oops"] as [String?] {
            precondition(lastExerciseRir("press", logs: [old, log("2026-10-05", [WorkoutSet(reps: "8", rir: value, completion: "recorded")])]) == nil)
        }
        precondition(lastExerciseRir("press", logs: [log("2026-10-05", [WorkoutSet(reps: "8", rir: "0")])]) == nil)
        var exercise = Exercise(id: "press", name: "Press")
        let item = ExerciseItem(exerciseId: "press", sets: [WorkoutSet(), WorkoutSet(setType: "warmup")], targetRIR: 3)
        let draft = item.prefillingRir(exercise: exercise, logs: logs)
        let restored = try JSONDecoder().decode(ExerciseItem.self, from: JSONEncoder().encode(draft))
        precondition(restored.targetRIR == 3 && restored.sets[0].rir == nil && restored.sets[0].rirEntryValue == "0")
        precondition(!hasRecordedWorkoutReps(restored.sets[0]) && restored.sets[1].placeholderRir == nil)
        precondition(item.sets[0].placeholderRir == nil && latest.exerciseItems[0].sets[0] == zero)
        exercise.usesTime = true
        precondition(item.prefillingRir(exercise: exercise, logs: logs).sets[0].placeholderRir == nil)
        var entered = restored.sets[0]
        entered.reps = "8"; entered.completion = "recorded"; entered.recordRirPrefill()
        precondition(entered.rir == "0" && entered.placeholderRir == nil)
        var added = entered.additionalSet(planningMode: false, defaultReps: 8)
        added.placeholderRir = ExerciseItem(exerciseId: "press", sets: [entered]).additionalSetRir
        precondition(added.rir == nil && added.rirEntryValue == "0" && !hasRecordedWorkoutReps(added))
        var cleared = restored.sets[0]; cleared.setRirEntry(nil)
        cleared = try JSONDecoder().decode(WorkoutSet.self, from: JSONEncoder().encode(cleared))
        cleared.recordRirPrefill(); precondition(cleared.rir == nil)
        var changed = restored.sets[0]; changed.setRirEntry("4"); changed.recordRirPrefill()
        precondition(changed.rir == "4")
        var skipped = restored.sets[0]; skipped.completion = "skipped"
        precondition(skipped.rirEntryValue == nil)
        // Widget imports do not confirm effort they cannot display or edit.
        let base = [restored]; var updated = base; updated[0].sets[0].completion = "recorded"
        let merged = mergingWorkoutLiveActivityItems(current: base, base: base, updated: updated)
        precondition(merged[0].sets[0].rir == nil && merged[0].sets[0].placeholderRir == nil)
        print("RememberRIRCheck passed: history, zero/unknown, isolation, targets, serialization, edits, added sets, Live Activity")
    }
}
