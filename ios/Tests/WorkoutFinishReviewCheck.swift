import Foundation

@main struct WorkoutFinishReviewCheck {
    static func main() throws {
        let rows = [ExerciseItem(exerciseId: "bench", sets: [
            WorkoutSet(reps: "8"), WorkoutSet(reps: "8", completion: "unrecorded"),
            WorkoutSet(completion: "skipped"), WorkoutSet(setType: "warmup"),
            WorkoutSet(placeholderReps: "8-12"), WorkoutSet(repsLeft: "3", completion: "recorded"),
            WorkoutSet(reps: "0", completion: "recorded"), WorkoutSet(reps: "NaN"),
        ]), ExerciseItem(exerciseId: "bench", sets: [WorkoutSet()])]
        precondition(unfinishedWorkoutSets(rows) == [
            WorkoutFinishReviewRow(itemIndex: 0, exerciseId: "bench", setNumbers: [2, 5, 7, 8]),
            WorkoutFinishReviewRow(itemIndex: 1, exerciseId: "bench", setNumbers: [1]),
        ])
        let repeated = ExerciseItem(exerciseId: "bench", sets: [WorkoutSet(reps: "8", weight: "0"), WorkoutSet(completion: "unrecorded")]).repeatingLastSet().repeatingLastSet()
        let restored = try JSONDecoder().decode(ExerciseItem.self, from: JSONEncoder().encode(repeated))
        precondition(unfinishedWorkoutSets([restored]).first?.setNumbers == [2])
        precondition(restored.sets[1].completion == "unrecorded" && restored.sets[1].weight == "0")
        precondition(unfinishedWorkoutSets([ExerciseItem(exerciseId: "timed", sets: [WorkoutSet(reps: "60"), WorkoutSet(repsRight: "6"), WorkoutSet(completion: "skipped")])]).isEmpty)
        precondition(unfinishedWorkoutSets([]).isEmpty)
        print("WorkoutFinishReviewCheck passed: true missing evidence, original positions, warmup/skip exclusions, repeated prefills, timed/sided evidence, serialization")
    }
}
