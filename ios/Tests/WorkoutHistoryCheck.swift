import Foundation

@main
struct WorkoutHistoryCheck {
    static func main() {
        let routine = ExerciseItem(exerciseId: "press", weightType: "weight", sets: [WorkoutSet(placeholderReps: "8-12")])
        let recorded = ExerciseItem(exerciseId: "press", weightType: "weight", sets: [WorkoutSet(reps: "12", weight: "100")])
        func needsIncrease(_ item: ExerciseItem, routine target: ExerciseItem = routine) -> Bool {
            routineExerciseNeedsWeightIncrease(target, logs: [
                WorkoutLog(id: "log", name: "Train", date: "2026-09-26", exerciseItems: [item], status: "finished")
            ])
        }
        precondition(needsIncrease(recorded))
        for completion in ["skipped", "unrecorded"] {
            var item = recorded
            item.sets[0].completion = completion
            precondition(!needsIncrease(item))
        }
        var warmup = recorded
        warmup.sets[0].setType = "warmup"
        precondition(!needsIncrease(warmup))
        var previousTechnique = recorded
        previousTechnique.baselineId = "old"
        precondition(!needsIncrease(previousTechnique))
        var newTechnique = routine
        newTechnique.baselineId = "new"
        precondition(!needsIncrease(recorded, routine: newTechnique))
        var otherMachine = recorded
        otherMachine.setupProfile = EquipmentSetup(id: "other", machine: "Press")
        precondition(!needsIncrease(otherMachine))
        var otherMode = recorded
        otherMode.weightType = "double"
        precondition(!needsIncrease(otherMode))
        var smith = recorded
        smith.weightType = "smith_double"
        smith.setupProfile = EquipmentSetup(id: "smith", machine: "Smith", smithBarWeight: 20)
        var smithRoutine = routine
        smithRoutine.weightType = "smith_double"
        smithRoutine.setupProfile = smith.setupProfile
        precondition(needsIncrease(smith, routine: smithRoutine))
        smithRoutine.setupProfile?.smithBarWeight = 35
        precondition(!needsIncrease(smith, routine: smithRoutine))
        var missed = recorded
        missed.sets[0].reps = "7"
        func advice(_ item: ExerciseItem, target: ExerciseItem = routine, usesTime: Bool = false) -> WorkoutWeightAdvice? {
            routineExerciseWeightAdvice(target, logs: [WorkoutLog(id: "log", name: "Train", date: "2026-10-02", exerciseItems: [item], status: "finished")], usesTime: usesTime)
        }
        precondition(advice(missed)?.direction == .decrease)
        precondition(advice(missed)?.message == "Last time, set 1: 7 reps; target 8–12. Try the next lighter weight than you used for that set, keeping your reps controlled.")
        precondition(advice(recorded)?.direction == .increase)
        precondition(advice(missed, usesTime: true) == nil)
        for completion in ["skipped", "unrecorded"] {
            var item = missed; item.sets[0].completion = completion
            precondition(advice(item) == nil)
        }
        for weight in ["", "0", "invalid", "inf"] {
            var item = missed; item.sets[0].weight = weight
            precondition(advice(item) == nil)
        }
        for reps in ["", "0", "8-12"] {
            var item = missed; item.sets[0].reps = reps
            precondition(advice(item) == nil)
        }
        for rir: String? in [nil, "", "0", "2"] {
            var item = missed; item.sets[0].rir = rir
            precondition(advice(item)?.direction == .decrease)
        }
        var expanded = routine
        expanded.sets += [WorkoutSet(placeholderReps: "8-12"), WorkoutSet(placeholderReps: "8-12")]
        var withWarmup = missed
        withWarmup.sets.insert(WorkoutSet(reps: "3", weight: "50", setType: "warmup"), at: 0)
        precondition(advice(withWarmup, target: expanded)?.message.contains("set 1: 7 reps") == true)
        var mixed = missed
        mixed.sets.append(WorkoutSet(reps: "12", weight: "90"))
        var twoSets = routine; twoSets.sets.append(WorkoutSet(placeholderReps: "8-12"))
        precondition(advice(mixed, target: twoSets)?.direction == .decrease)
        var sides = missed
        sides.sets = [WorkoutSet(reps: "", repsLeft: "7", repsRight: "12", repMode: "separateSides", weight: "25")]
        precondition(advice(sides)?.message.contains("set 1 (left): 7 reps") == true)
        sides.sets[0].repsLeft = ""; sides.sets[0].repsRight = "10"
        precondition(advice(sides) == nil)
        var sideTarget = routine
        sideTarget.sets = [WorkoutSet(placeholderReps: "12 (8–12)", placeholderRepsLeft: "9 (10–15)", placeholderRepsRight: "12 (8–12)")]
        sides.sets[0].repsLeft = "9"
        precondition(advice(sides, target: sideTarget)?.message.contains("target 10–15") == true)
        for reps in ["12", "12-8", "0-12", "bad-12"] {
            var target = routine; target.sets[0].placeholderReps = reps
            precondition(advice(missed, target: target) == nil)
        }
        var changed = missed; changed.baselineId = "other"
        precondition(advice(changed) == nil)
        changed = missed; changed.setupProfile = EquipmentSetup(id: "other", machine: "Press")
        precondition(advice(changed) == nil)
        changed = missed; changed.weightType = "double"
        precondition(advice(changed) == nil)
        changed = missed; changed.weightType = "none"
        var bodyweight = routine; bodyweight.weightType = "none"
        precondition(advice(changed, target: bodyweight) == nil)
        smith.sets[0].reps = "7"; smith.setupProfile?.smithBarWeight = nil; smithRoutine.setupProfile?.smithBarWeight = nil
        precondition(advice(smith, target: smithRoutine)?.direction == .decrease)
        smithRoutine.setupProfile?.smithBarWeight = 35
        precondition(advice(smith, target: smithRoutine) == nil)
        var recovered = recorded; recovered.sets[0].reps = "10"
        let past = WorkoutLog(id: "past", name: "Train", date: "2026-10-01", exerciseItems: [missed], status: "finished")
        var latest = WorkoutLog(id: "latest", name: "Train", date: "2026-10-02", exerciseItems: [recovered], status: "finished")
        precondition(routineExerciseWeightAdvice(routine, logs: [past, latest]) == nil)
        latest.status = "active"
        precondition(routineExerciseWeightAdvice(routine, logs: [past, latest])?.direction == .decrease)
        print("Workout history checks passed: increase/decrease advice, working-set alignment, side reps, evidence exclusions and setup context.")
    }
}
