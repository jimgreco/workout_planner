import Foundation

@main struct RememberEquipmentSetupCheck {
    static func main() throws {
        let home = EquipmentSetup(id: "home", gym: "Home", machine: "Dumbbells", seat: "1")
        let gym = EquipmentSetup(id: "gym", gym: "Gym", machine: "Smith", smithBarWeight: 0)
        var exercise = Exercise(id: "press", name: "Press", equipmentSetups: [home, gym])
        let item = ExerciseItem(exerciseId: "press", sets: [WorkoutSet(reps: "6-10")], targetRIR: 2)
        func log(_ time: String, _ profile: EquipmentSetup?, _ status: String = "finished") -> WorkoutLog {
            WorkoutLog(id: time, name: "Synthetic", date: "2026-10-06", exerciseItems: [ExerciseItem(exerciseId: "press", sets: [WorkoutSet(reps: "8", weight: "50", rir: "0")], baselineId: profile?.id, setupProfile: profile, targetRIR: 2)], endTime: "2026-10-06T\(time):00:00Z", status: status)
        }
        let old = log("09", home)
        let latest = log("14", gym)
        let logs = [old, latest, log("18", home, "planning"), log("19", home, "active")]
        func resolve(_ candidate: ExerciseItem = item, _ history: [WorkoutLog] = logs) -> NewWorkoutEquipment {
            newWorkoutEquipment(candidate, exercise: exercise, logs: history)
        }
        precondition(resolve().setupProfile == gym)
        precondition(resolve(item, Array(logs.reversed())).setupProfile == gym)
        var prescribed = item
        prescribed.setupProfile = home
        precondition(resolve(prescribed).setupProfile == home && resolve(prescribed).lastItem == old.exerciseItems[0])
        prescribed.setupProfile = nil; prescribed.baselineId = "new-technique"
        precondition(resolve(prescribed).setupProfile == nil && resolve(prescribed).baselineId == "new-technique")
        precondition(resolve(item, [old, log("14", nil)]).setupProfile == nil)
        var editedSmith = gym; editedSmith.seat = "3"; editedSmith.smithBarWeight = 25
        exercise.equipmentSetups = [home, editedSmith]
        var smithLog = latest; smithLog.exerciseItems[0].weightType = "smith_double"
        let current = resolve(item, [smithLog])
        precondition(current.setupProfile == editedSmith && current.lastItem == nil)
        precondition(smithLog.exerciseItems[0].setupProfile == gym)
        exercise.removeSetup(gym.id)
        precondition(resolve().setupProfile == nil && resolve().lastItem == nil)
        prescribed.setupProfile = gym; prescribed.baselineId = gym.id
        precondition(resolve(prescribed).setupProfile == nil && resolve(prescribed).baselineId == nil)
        precondition(newWorkoutEquipment(item, exercise: nil, logs: logs).setupProfile == nil)
        let other = ExerciseItem(exerciseId: "other-press", sets: [])
        precondition(newWorkoutEquipment(other, exercise: Exercise(id: "other-press", name: "Press"), logs: logs).setupProfile == nil)
        precondition(resolve(item, [old, log("14", gym, "active")]).setupProfile == home)
        var unused = log("14", home)
        unused.exerciseItems[0].setupProfile = gym
        for sets in [[], [WorkoutSet(placeholderReps: "8")], [WorkoutSet(reps: "8", completion: "skipped")], [WorkoutSet(reps: "8", completion: "unrecorded")]] {
            unused.exerciseItems[0].sets = sets
            precondition(resolve(item, [old, unused]).setupProfile == home)
        }
        exercise.equipmentSetups = [home, gym]; exercise.deletedEquipmentSetupIds = nil
        unused.exerciseItems[0].setupSelectionMade = true
        precondition(resolve(item, [old, unused]).setupProfile == gym)
        unused.exerciseItems[0].setupProfile = nil
        precondition(resolve(item, [old, unused]).setupProfile == nil)
        let selectedCopy = try JSONDecoder().decode(WorkoutLog.self, from: JSONEncoder().encode(unused))
        precondition(selectedCopy.exerciseItems[0].setupSelectionMade == true)
        var local = old.exerciseItems[0]
        local.setupSelectionMade = true
        var widget = old.exerciseItems[0]
        widget.sets[0].reps = "12"
        let merged = mergingWorkoutLiveActivityItems(current: [local], base: old.exerciseItems, updated: [widget])
        precondition(merged[0].setupSelectionMade == true && merged[0].setupProfile == home && merged[0].targetRIR == 2)
        let encoded = try JSONEncoder().encode(old)
        let restored = try JSONDecoder().decode(WorkoutLog.self, from: encoded)
        precondition(resolve(item, [restored]).setupProfile == home)
        precondition(restored.exerciseItems[0].targetRIR == 2 && restored.exerciseItems[0].sets[0].rir == "0")
        precondition(item.setupProfile == nil && item.targetRIR == 2 && latest.exerciseItems[0].setupProfile == gym)
        print("PASS remembered setup: chronology, prescriptions/baselines, unspecified/deleted, latest library/Smith, stable identity, drafts, serialization and unchanged history/RIR")
    }
}
