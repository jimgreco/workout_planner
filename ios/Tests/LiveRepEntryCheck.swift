import Foundation
@main struct LiveRepEntryCheck {
    static func main() throws {
        for (input, output) in [("", ""), (" 8 ", "8"), ("008", "8"), ("0", "0"), ("150", "150")] { precondition(actualRepsInput(input) == output) }
        for invalid in ["-1", "1.5", "8-12", "abc", "1e2", "9007199254740992"] { precondition(actualRepsInput(invalid) == nil) }
        let original = WorkoutSet(placeholderReps: "8-12", completion: "unrecorded", placeholderRir: "0")
        var entered = original.enteringActualReps("9", field: .common)!
        precondition(entered.reps == "9" && entered.rir == "0" && entered.completion == "recorded")
        precondition(entered.placeholderReps == "8-12" && original.rir == nil)
        entered = entered.enteringActualReps("12", field: .common)!
        precondition(entered.reps == "12")
        let cleared = entered.enteringActualReps("", field: .common)!
        precondition(cleared.reps == "" && cleared.completion == "unrecorded" && !hasRecordedWorkoutReps(cleared))
        let left = original.enteringActualReps("7", field: .left)!
        let right = left.enteringActualReps("6", field: .right)!
        precondition(right.repsLeft == "7" && right.repsRight == "6" && right.reps == "")
        let linked = right.enteringActualReps("10", field: .common, linkedSides: true)!
        precondition(linked.repsLeft == "10" && linked.repsRight == "10" && linked.reps == "")
        let item = ExerciseItem(exerciseId: "press", sets: [entered, original], targetRIR: 3)
        let skipped = skippingWorkoutSet([item], exerciseIndex: 0, setIndex: 0)!
        precondition(skipped.items[0].sets[0].reps == "12" && skipped.items[0].sets[1] == original)
        let restored = try JSONDecoder().decode(ExerciseItem.self, from: JSONEncoder().encode(skipped.items[0]))
        precondition(restored == skipped.items[0] && restored.targetRIR == 3)
        print("LiveRepEntryCheck passed: typed/empty/invalid/zero, repeated edits, sides, RIR/target separation, skip identity and persistence")
    }
}
