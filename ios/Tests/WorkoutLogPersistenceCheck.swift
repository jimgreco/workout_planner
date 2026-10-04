import Foundation

@main
struct WorkoutLogPersistenceCheck {
    @MainActor
    static func main() async throws {
        let press = ExerciseItem(exerciseId: "press", weightType: "double", description: "Keep technique", sets: [
            WorkoutSet(reps: "8", weight: "70", rir: "2", setType: "working", completion: "recorded"),
            WorkoutSet(reps: "", weight: "", placeholderReps: "6-10", rir: nil, setType: "working")
        ], baselineId: "same-technique", techniqueNote: "Controlled reps")
        let core = ExerciseItem(exerciseId: "core", weightType: "none", sets: [WorkoutSet(placeholderReps: "8-15"), WorkoutSet(placeholderReps: "8-15")])
        let base = [press, core]
        var widget = base
        widget[1].sets[0].reps = "8"
        widget[1].sets[0].completion = "recorded"
        widget[1].sets[0].restStartTime = 100

        // A widget action based on the pre-deletion list cannot recreate core.
        let deleted = mergingWorkoutLiveActivityItems(current: [press], base: base, updated: widget)
        precondition(deleted == [press])
        precondition(mergingWorkoutLiveActivityItems(current: [], base: base, updated: widget).isEmpty)

        // Removing a set or reordering exercises invalidates positional edits.
        var fewerSets = base
        fewerSets[0].sets.removeLast()
        precondition(mergingWorkoutLiveActivityItems(current: fewerSets, base: base, updated: widget) == fewerSets)
        precondition(mergingWorkoutLiveActivityItems(current: [core, press], base: base, updated: widget) == [core, press])

        // Current app metadata and intentional edits survive valid widget input.
        var current = base
        current[0].sets[0].reps = "10"
        current[0].sets[0].rir = "0"
        current[1].sets[0].completion = "skipped"
        widget[0].sets[0].reps = "9"
        widget[0].sets[1].reps = "7"
        widget[0].sets[1].weight = "70"
        widget[0].sets[1].completion = "recorded"
        widget[0].sets[1].restStartTime = 200
        let merged = mergingWorkoutLiveActivityItems(current: current, base: base, updated: widget)
        precondition(merged[0].baselineId == press.baselineId && merged[0].techniqueNote == press.techniqueNote)
        precondition(merged[0].description == press.description)
        precondition(merged[0].sets[0].reps == "10" && merged[0].sets[0].rir == "0")
        precondition(merged[0].sets[1].reps == "7" && merged[0].sets[1].completion == "recorded")
        precondition(merged[0].sets[1].rir == nil)
        precondition(merged[1].sets[0].completion == "skipped")

        // The saved API representation also excludes the deleted exercise.
        let saved = WorkoutLog(id: "log", name: "Test", date: "2026-10-01", exerciseItems: deleted, status: "finished")
        var lateAutosave = saved
        lateAutosave.status = "active"
        lateAutosave.endTime = nil
        precondition(!shouldPersistWorkoutAutosave(lateAutosave, current: saved))
        lateAutosave.status = "planning"
        precondition(!shouldPersistWorkoutAutosave(lateAutosave, current: saved))
        precondition(shouldPersistWorkoutAutosave(saved, current: saved))
        precondition(shouldPersistWorkoutAutosave(lateAutosave, current: nil))
        var otherWorkout = saved
        otherWorkout.id = "other"
        precondition(shouldPersistWorkoutAutosave(lateAutosave, current: otherWorkout))
        let roundTrip = try JSONDecoder().decode(WorkoutLog.self, from: JSONEncoder().encode(saved))
        precondition(roundTrip.exerciseItems == [press])

        // A slow, subsequently canceled autosave cannot overtake deletion/finish.
        let queue = WorkoutLogWriteQueue()
        var release: CheckedContinuation<Void, Never>?
        var events: [String] = []
        var persisted = ""
        let old = Task {
            try await queue.perform(id: "log") {
                events.append("old-start")
                await withCheckedContinuation { release = $0 }
                precondition(!Task.isCancelled)
                persisted = "old-with-core"
                events.append("old-end")
            }
        }
        while release == nil { await Task.yield() }
        var deletionEnqueued = false
        let deletion = Task {
            deletionEnqueued = true
            try await queue.perform(id: "log") {
                persisted = "without-core"
                events.append("delete-core")
            }
        }
        while !deletionEnqueued { await Task.yield() }
        old.cancel()
        try await queue.perform(id: "different-log") { events.append("independent") }
        precondition(events == ["old-start", "independent"])
        release?.resume()
        try await old.value
        try await deletion.value
        try await queue.perform(id: "log") {
            precondition(persisted == "without-core")
            persisted = "finished-without-core"
            events.append("finish")
        }
        precondition(events == ["old-start", "independent", "old-end", "delete-core", "finish"])
        precondition(persisted == "finished-without-core")

        // A failed write releases the next queued edit.
        do {
            try await queue.perform(id: "log") { throw NSError(domain: "expected", code: 1) }
            preconditionFailure("Expected failure")
        } catch { }
        try await queue.perform(id: "log") { persisted = "recovered" }
        precondition(persisted == "recovered")
        print("Workout persistence checks passed: exercise/set deletion, stale widget edits, metadata/RIR, local conflicts, saved encoding, ordered/canceled/failed writes.")
    }
}
