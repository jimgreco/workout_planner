import Foundation

@main
struct PersonalBestEquipmentCheck {
    static func main() throws {
        let old = ExerciseItem(exerciseId: "press", weightType: "weight", sets: [WorkoutSet(reps: "8", weight: "140", completion: "recorded")], setupProfile: EquipmentSetup(id: "machine", gym: "Home", machine: "Original press"))
        var current = old
        current.setupProfile = EquipmentSetup(id: "machine", gym: "Gym", machine: "Renamed press")
        current.sets[0].weight = "130"
        func log(_ day: String, _ item: ExerciseItem) -> WorkoutLog {
            WorkoutLog(id: day, name: "Train", date: "2026-10-\(day)", exerciseItems: [item], status: "finished")
        }
        var tie = current; tie.sets = old.sets
        let history = [log("18", old), log("19", current), log("20", tie)]
        let before = try JSONEncoder().encode(history)
        let record = personalBestRecordForItem(current, logs: history, legacyBest: nil)
        precondition(record.best?.weight == "140" && record.best?.date == "2026-10-18")
        precondition(record.equipment == "Home · Original press")
        precondition(latestPersonalBest(Exercise(id: "press", name: "Press"), logs: history).equipment == record.equipment)
        precondition(personalBestRecordForItem(current, logs: Array(history.dropFirst()), legacyBest: nil).equipment == "Gym · Renamed press")
        var other = current; other.setupProfile?.id = "other"
        precondition(personalBestRecordForItem(other, logs: history, legacyBest: nil).best == nil)
        var missing = old; missing.setupProfile = EquipmentSetup(id: "machine", gym: "Home")
        precondition(personalBestRecordForItem(current, logs: [log("18", missing)], legacyBest: nil).equipment == "Equipment not recorded")
        var legacy = old; legacy.setupProfile = nil
        precondition(personalBestRecordForItem(legacy, logs: history, legacyBest: record.best).equipment == "Equipment not recorded")
        missing.setupProfile?.name = " Legacy machine "
        precondition(personalBestEquipmentLabel(missing) == "Legacy machine")
        precondition(personalBestNotice("Press", best: record.best!, item: old) == "Press - 140 lbs x 8 reps\nHome · Original press")
        let restored = try JSONDecoder().decode([WorkoutLog].self, from: before)
        precondition(restored == history)
        print("PB equipment checks passed: original snapshot, ties, rename, deletion, equipment isolation, legacy fallback and completion label.")
    }
}
