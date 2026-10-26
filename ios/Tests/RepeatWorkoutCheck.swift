import Foundation
@main struct RepeatWorkoutCheck {
    static func main() throws {
        let exercise = Exercise(id: "bench", name: "Bench", muscleGroup: "Chest")
        let source = WorkoutLog(id: "old", name: "Push", date: "2026-10-25", notes: "Historical note", readiness: 3,
            exerciseItems: [ExerciseItem(exerciseId: "bench", restTargetSeconds: 90, supersetGroup: "A", sets: [
                WorkoutSet(reps: "12", repMode: "same", weight: "45", placeholderReps: "8-12", restStartTime: 100,
                           restDuration: 20, rpe: "10", rir: "0", setType: "warmup", completion: "recorded")
            ], baselineId: "baseline", techniqueNote: "Pause", targetRIR: 2), ExerciseItem(exerciseId: "missing", sets: [])],
            startTime: "start", endTime: "end", status: "finished", hasPB: true, pbExerciseIds: ["bench"], revision: 9, pausedAt: 99, pausedDurationMs: 100)
        let plan = try source.repeatedPlan(exercises: [exercise], today: "2026-10-26", id: "new")
        precondition(plan.id == "new" && plan.date == "2026-10-26" && plan.status == "planning")
        precondition(plan.exerciseItems.count == 1 && plan.exerciseItems[0].targetRIR == 2)
        let set = plan.exerciseItems[0].sets[0]
        precondition(set.reps == "" && set.weight == "" && set.placeholderReps == "8-12" && set.placeholderWeight == "45")
        precondition(set.completion == "unrecorded" && set.rir == nil && set.rpe == nil && set.restStartTime == nil && set.restDuration == nil)
        precondition(plan.startTime == nil && plan.endTime == nil && plan.hasPB == nil && plan.pbExerciseIds == nil && plan.prescription == nil && plan.readiness == nil && plan.revision == nil && plan.pausedAt == nil && plan.pausedDurationMs == nil)
        precondition(source.exerciseItems[0].sets[0].completion == "recorded")
        do { _ = try source.repeatedPlan(exercises: [], today: "2026-10-26"); fatalError("Expected missing exercises") } catch RepeatWorkoutError.noExercises {}
        print("PASS repeat workout: fresh plan, targets/order, no training evidence, missing exercises")
    }
}
