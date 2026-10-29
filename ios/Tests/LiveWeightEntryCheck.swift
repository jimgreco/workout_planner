import Foundation
@main struct LiveWeightEntryCheck {
    static func main() throws {
        for (input, output) in [("", ""), (".", ""), (".5", "0.5"), ("45.125", "45.125"), ("45.", "45"), ("0", "0")] { precondition(actualWeightInput(input) == output) }
        for invalid in ["-5", "1..5", "abc", "1e2", "Infinity"] { precondition(actualWeightInput(invalid) == nil) }
        precondition(adjustedLiveWeight("45.125", by: 5) == "50.125")
        precondition(adjustedLiveWeight("50.125", by: -5) == "45.125")
        precondition(adjustedLiveWeight("2.5", by: -5) == "0")
        precondition(adjustedLiveWeight("", by: 5, fallback: 40) == "45")
        precondition(adjustedLiveWeight("0", by: 5, fallback: 40) == "5")
        var set = WorkoutSet(completion: "unrecorded", placeholderRir: "0")
        set.weight = actualWeightInput("45.125")
        set = set.enteringActualReps("9", field: .common)!
        let profile = EquipmentSetup(id: "smith", machine: "Smith", smithBarWeight: 20)
        let item = ExerciseItem(exerciseId: "press", weightType: "smith_double", sets: [set, WorkoutSet()], setupProfile: profile, targetRIR: 3)
        let skipped = skippingWorkoutSet([item], exerciseIndex: 0, setIndex: 0)!
        let restored = try JSONDecoder().decode(ExerciseItem.self, from: JSONEncoder().encode(skipped.items[0]))
        precondition(restored.sets[0].weight == "45.125" && restored.sets[0].reps == "9" && restored.sets[1].weight == "")
        precondition(restored.setupProfile == profile && restored.weightType == "smith_double" && restored.targetRIR == 3)
        print("LiveWeightEntryCheck passed: fractions, empty/invalid/zero, +/-5, clamp, seed, set identity and persistence")
    }
}
