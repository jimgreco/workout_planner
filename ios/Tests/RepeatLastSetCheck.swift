import Foundation

@main struct RepeatLastSetCheck {
    static func main() throws {
        let source = WorkoutSet(reps: "8", weight: "0", restStartTime: 1000, restDuration: 90, rpe: "10", rir: "0", completion: "recorded")
        let pending = WorkoutSet(reps: "", weight: "", placeholderReps: "8-12", restTargetSeconds: 120, completion: "unrecorded")
        let original = ExerciseItem(exerciseId: "bench", weightType: "smith_double", sets: [source, pending, pending], baselineId: "baseline", setupProfile: EquipmentSetup(id: "smith", smithBarWeight: 0), targetRIR: 2)
        let filled = original.repeatingLastSet()
        precondition(filled.repeatLastSetPlan == RepeatLastSetPlan(sourceIndex: 0, targetIndex: 1))
        precondition(filled.sets[0] == source && filled.sets[2] == pending)
        precondition(filled.sets[1].reps == "8" && filled.sets[1].weight == "0")
        precondition(filled.sets[1].completion == "unrecorded" && filled.sets[1].rir == nil && filled.sets[1].rpe == nil)
        precondition(filled.sets[1].restStartTime == nil && filled.sets[1].restDuration == nil)
        precondition(filled.sets[1].placeholderReps == "8-12" && filled.sets[1].restTargetSeconds == 120)
        precondition(filled.setupProfile == original.setupProfile && filled.baselineId == "baseline" && filled.targetRIR == 2)
        precondition(filled.sets.filter(hasRecordedWorkoutReps).count == 1 && original.sets[1] == pending)
        precondition(filled.repeatingLastSet() == filled)
        let relaunched = try JSONDecoder().decode(ExerciseItem.self, from: JSONEncoder().encode(filled))
        precondition(relaunched == filled && relaunched.repeatingLastSet() == filled)

        for mode in ["weight", "bar_double", "smith_double", "double"] {
            for weight in ["0", "", nil] as [String?] {
                var item = original
                item.weightType = mode
                item.sets[0].weight = weight
                precondition(item.repeatingLastSet().sets[1].weight == (weight ?? ""))
            }
        }
        var timed = original
        timed.weightType = "none"
        timed.sets[0].reps = "60"
        precondition(timed.repeatingLastSet().sets[1].reps == "60" && timed.repeatingLastSet().sets[1].weight == "")
        for mode in ["separateSides", "linkedSides"] {
            var item = original
            item.sets[0].reps = ""
            item.sets[0].repsLeft = "8"
            item.sets[0].repsRight = ""
            item.sets[0].repMode = mode
            let result = item.repeatingLastSet().sets[1]
            precondition(result.reps == "" && result.repsLeft == "8" && result.repsRight == "" && result.repMode == mode)
        }
        for completion in ["skipped", "unrecorded"] {
            var invalid = source
            invalid.completion = completion
            precondition(ExerciseItem(exerciseId: "a", sets: [invalid, pending]).repeatLastSetPlan == nil)
        }
        for invalid in [WorkoutSet(reps: "0", weight: "100"), WorkoutSet(placeholderReps: "12")] {
            precondition(ExerciseItem(exerciseId: "a", sets: [invalid, pending]).repeatLastSetPlan == nil)
        }
        for target in [source, WorkoutSet(reps: "7"), WorkoutSet(completion: "skipped"), WorkoutSet(restStartTime: 1, completion: "unrecorded"), WorkoutSet(restDuration: 0, completion: "unrecorded")] {
            precondition(ExerciseItem(exerciseId: "a", sets: [source, target]).repeatLastSetPlan == nil)
        }
        var warmup = source
        warmup.setType = "warmup"
        precondition(ExerciseItem(exerciseId: "a", sets: [warmup, pending]).repeatLastSetPlan == nil)
        var nextWarmup = pending
        nextWarmup.setType = "warmup"
        precondition(ExerciseItem(exerciseId: "a", sets: [warmup, nextWarmup]).repeatLastSetPlan != nil)
        var next = filled
        next.sets[1].reps = "6"
        next.sets[1].completion = "recorded"
        precondition(next.repeatLastSetPlan == RepeatLastSetPlan(sourceIndex: 1, targetIndex: 2))
        precondition(next.repeatingLastSet().sets[2].reps == "6")
        print("RepeatLastSetCheck passed: evidence, placeholders, sides, timed/zero loads, types, repeated taps, serialization and preserved setup/targets")
    }
}
