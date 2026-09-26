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
        print("Workout history checks passed: recorded working sets and matching technique, setup, mode and Smith resistance.")
    }
}
