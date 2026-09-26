import Foundation

@main
struct PersonalBestContextCheck {
    static func main() throws {
        let exercise = Exercise(id: "press", name: "Press", personalBest: PersonalBest(weight: "300", date: "2026-01-01", reps: "5"))
        func item(_ weight: String = "100", _ reps: String = "8", baseline: String? = "a", machine: String = "machine") -> ExerciseItem {
            ExerciseItem(exerciseId: "press", weightType: "weight", sets: [WorkoutSet(reps: reps, weight: weight)], baselineId: baseline, setupProfile: baseline == nil ? nil : EquipmentSetup(id: machine, machine: "Press"))
        }
        func log(_ day: String, _ entry: ExerciseItem) -> WorkoutLog {
            WorkoutLog(id: day, name: "Train", date: "2026-09-\(day)", exerciseItems: [entry], status: "finished")
        }
        let history = [log("18", item("90")), log("19", item()), log("20", item("120")), log("21", item("120")), log("22", item("120", "9"))]
        let badges = logsWithPersonalBests(history.reversed())
        precondition(badges.first { $0.id == "19" }?.pbExerciseIds == ["press"])
        precondition(badges.first { $0.id == "21" }?.hasPB == false)
        precondition(badges.first { $0.id == "22" }?.hasPB == true)
        precondition(personalBestIdsForWorkout(history[1], logs: history, exercises: [exercise]) == ["press"])
        precondition(personalBestIdsForWorkout(log("19", item("80")), logs: history, exercises: [exercise]).isEmpty)
        precondition(personalBestIdsForWorkout(log("23", item("20", baseline: "new")), logs: history, exercises: [exercise]) == ["press"])
        precondition(personalBestIdsForWorkout(log("23", item("20", machine: "other")), logs: history, exercises: [exercise]) == ["press"])
        precondition(personalBestForItem(item(), logs: [], legacyBest: exercise.personalBest) == nil)
        precondition(latestPersonalBest(exercise, logs: history).best?.reps == "9")
        var corrected = history
        corrected[2].exerciseItems = [item("80")]
        precondition(logsWithPersonalBests(corrected).first { $0.id == "20" }?.hasPB == false)
        precondition(logsWithPersonalBests(corrected).first { $0.id == "21" }?.hasPB == true)
        var sides = item()
        sides.sets = [WorkoutSet(reps: "", repsLeft: "10", repsRight: "10", weight: "100")]
        precondition(personalBestIdsForWorkout(log("20", sides), logs: Array(history.prefix(2)), exercises: [exercise]) == ["press"])
        for excluded in [WorkoutSet(reps: "8", weight: "100", setType: "warmup"), WorkoutSet(reps: "8", weight: "100", completion: "skipped"), WorkoutSet(weight: "100", placeholderReps: "8")] {
            var entry = item(); entry.sets = [excluded]
            precondition(personalBestIdsForWorkout(log("18", entry), logs: [], exercises: [exercise]).isEmpty)
        }
        var smith = item("45")
        smith.weightType = "smith_double"
        precondition(personalBestIdsForWorkout(log("18", smith), logs: [], exercises: [exercise]).isEmpty)
        smith.setupProfile?.smithBarWeight = 20
        var otherSmith = smith; otherSmith.setupProfile?.smithBarWeight = 35
        precondition(personalBestIdsForWorkout(log("19", smith), logs: [log("18", otherSmith)], exercises: [exercise]) == ["press"])
        let legacyHistory = [log("18", item("90", baseline: nil)), log("19", item("100", baseline: nil)), log("20", item("120", baseline: nil))]
        let legacyExercise = Exercise(id: "press", name: "Press", personalBest: PersonalBest(weight: "120", date: "2026-09-20", reps: "8"))
        precondition(personalBestIdsForWorkout(legacyHistory[1], logs: legacyHistory, exercises: [legacyExercise]) == ["press"])
        precondition(personalBestIdsForWorkout(log("21", item("80", baseline: nil)), logs: legacyHistory, exercises: [Exercise(id: "press", name: "Press")]) == ["press"])
        precondition(history.allSatisfy { $0.pbExerciseIds == nil })
        let data = try JSONEncoder().encode(logsWithPersonalBests(history))
        let decoded = try JSONDecoder().decode([WorkoutLog].self, from: data)
        precondition(decoded == logsWithPersonalBests(history))
        print("Context PB checks passed: first records, separate setups, edits, corrections, Smith resistance, side reps and round-trip.")
    }
}
