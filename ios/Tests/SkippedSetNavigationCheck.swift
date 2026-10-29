import Foundation
@main struct SkippedSetNavigationCheck {
    static func main() throws {
        let set = WorkoutSet(completion: "unrecorded", placeholderRir: "0")
        let items = [ExerciseItem(exerciseId: "press", sets: [set, set]), ExerciseItem(exerciseId: "empty", sets: []), ExerciseItem(exerciseId: "row", sets: [set])]
        let first = skippingWorkoutSet(items, exerciseIndex: 0, setIndex: 0)!
        precondition(first.next == WorkoutSetPosition(exerciseIndex: 0, setIndex: 1))
        precondition(first.items[0].sets[0].completion == "skipped" && first.items[0].sets[0].rir == nil)
        precondition(first.items[0].sets[0].restStartTime == nil && first.items[0].sets[0].restDuration == nil)
        precondition(skippingWorkoutSet(first.items, exerciseIndex: 0, setIndex: 0) == nil)
        let second = skippingWorkoutSet(first.items, exerciseIndex: 0, setIndex: 1)!
        precondition(second.next == WorkoutSetPosition(exerciseIndex: 2, setIndex: 0))
        let final = skippingWorkoutSet(second.items, exerciseIndex: 2, setIndex: 0)!
        precondition(final.next == nil && final.items[2].sets[0].completion == "skipped")
        var undo = final.items; undo[0].sets[0].completion = "unrecorded"
        precondition(skippingWorkoutSet(undo, exerciseIndex: 0, setIndex: 0)?.next == first.next)
        var resting = items
        resting[0].sets[0].restStartTime = 100
        let skipOther = skippingWorkoutSet(resting, exerciseIndex: 0, setIndex: 1)!
        precondition(skipOther.items[0].sets[0].restStartTime == 100)
        let skipResting = skippingWorkoutSet(resting, exerciseIndex: 0, setIndex: 0)!
        precondition(skipResting.items[0].sets[0].restStartTime == nil)
        precondition(skippingWorkoutSet(items, exerciseIndex: 9, setIndex: 0) == nil)
        precondition(skippingWorkoutSet(items, exerciseIndex: 1, setIndex: 0) == nil)
        precondition(items[0].sets[0] == set)
        let log = WorkoutLog(id: "skip", name: "Synthetic", date: "2026-10-29", exerciseItems: final.items, status: "active")
        let restored = try JSONDecoder().decode(WorkoutLog.self, from: JSONEncoder().encode(log))
        precondition(restored.status == "active" && restored.endTime == nil && restored.exerciseItems == final.items)
        print("SkippedSetNavigationCheck passed: next set/exercise/end, empty exercises, idempotence, undo, rest isolation, persistence")
    }
}
