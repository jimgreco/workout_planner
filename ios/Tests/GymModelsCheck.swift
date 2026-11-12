import Foundation

// Run: swiftc ios/WorkoutPlanner/Support/Models.swift ios/Tests/GymModelsCheck.swift -o /tmp/repmixburn-gym-model-check && /tmp/repmixburn-gym-model-check
@main
struct GymModelsCheck {
    static func main() throws {
        let decoder = JSONDecoder()
        let legacy = try decoder.decode(Exercise.self, from: Data(#"{"id":"old","name":"Push-up","muscleGroup":"Chest"}"#.utf8))
        precondition(legacy.equipmentAlternatives == nil)
        let legacyRoutine = try decoder.decode(WorkoutTemplate.self, from: Data(#"{"id":"old","name":"Push","exerciseItems":[]}"#.utf8))
        precondition(legacyRoutine.gymId == nil)
        let unassignedJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(legacyRoutine)) as! [String: Any]
        precondition(unassignedJSON["gymId"] is NSNull)
        let oldBackup = try decoder.decode(RepMixBurnExportPayload.self, from: Data(#"{"exercises":[],"templates":[]}"#.utf8))
        precondition(oldBackup.gyms == nil)

        let gym = Gym(id: "home", name: "Home", equipment: [
            GymEquipment(id: "db", name: "Dumbbells", category: "Free weights", details: "5–50 lb"),
            GymEquipment(id: "press", name: "Chest press", category: "Machines")
        ])
        let hotel = Gym(id: "hotel", name: "Hotel", equipment: [GymEquipment(id: "db", name: "Dumbbells", category: "Free weights")])
        let exercise = Exercise(id: "press", name: "Press", equipmentAlternatives: [
            EquipmentAlternative(gymId: "home", equipmentId: "db"),
            EquipmentAlternative(gymId: "home", equipmentId: "press")
        ])
        precondition(exercise.equipmentSummary(at: gym) == "Dumbbells OR Chest press")
        precondition(exercise.equipmentSummary(at: hotel) == "No recorded alternative at this gym")
        precondition(legacy.equipmentSummary(at: gym) == "No equipment requirement recorded")
        let routine = WorkoutTemplate(name: "Push", gymId: gym.id)
        let backup = RepMixBurnExportPayload(exercises: [exercise], templates: [routine], gyms: [gym])
        let restored = try decoder.decode(RepMixBurnExportPayload.self, from: JSONEncoder().encode(backup))
        precondition(restored == backup)
        precondition(restored.templates?.first?.gymId == restored.gyms?.first?.id)
        precondition(gym.aiBrief(routine: routine).contains("5–50 lb"))
        precondition(gym.aiBrief(routine: routine).contains("Equipment entries are alternatives"))
        precondition(!gym.aiBrief(routine: routine).contains("{"))
        let briefItem = ExerciseItem(exerciseId: "bench", weightType: "double", restTargetSeconds: 90, sets: [
            WorkoutSet(placeholderReps: "12", placeholderWeight: "20", setType: "warmup"),
            WorkoutSet(placeholderReps: "8-10", placeholderWeight: "40"), WorkoutSet(placeholderReps: "8-10", placeholderWeight: "40"),
            WorkoutSet(repsLeft: "10", repsRight: "9", weight: "35", rir: "1"),
        ], techniqueNote: "Pause", setupProfile: EquipmentSetup(machine: "Flat bench", grip: "neutral"), targetRIR: 2)
        precondition(briefItem.briefDetails == [
            "Sets: 1 × warm-up: 12 reps @ 20 lb each side; 2 × 8-10 reps @ 40 lb each side; 1 × 10 left / 9 right reps @ 35 lb each side (RIR 1)",
            "Plan: target 2 reps in reserve on working sets, rest 90s",
            "Setup: Flat bench, grip neutral",
            "Technique: Pause",
        ])
        precondition(ExerciseItem(exerciseId: "pushup", weightType: "none", sets: [WorkoutSet(reps: "15")]).briefDetails == ["Sets: 1 × 15 reps @ bodyweight"])
        precondition(gym.isValid)
        precondition(!Gym(name: " ").isValid)
        precondition(!Gym(name: "Home", equipment: [GymEquipment()]).isValid)
        precondition(GymEquipment.preloaded.count == 112)
        precondition(Set(GymEquipment.preloaded.map(\.id)).count == 112)
        let libraryExercise = Exercise(name: "Press", equipmentAlternatives: [EquipmentAlternative(equipmentId: "eq-dumbbells")])
        let linkedGym = Gym(name: "Hotel", equipment: [GymEquipment(name: "Dumbbells", category: "Free weights", equipmentId: "eq-dumbbells")])
        precondition(libraryExercise.equipmentSummary(at: linkedGym) == "Dumbbells")
        let libraryBackup = RepMixBurnExportPayload(exercises: [libraryExercise], gyms: [linkedGym], equipment: GymEquipment.preloaded)
        let decodedLibraryBackup = try decoder.decode(RepMixBurnExportPayload.self, from: JSONEncoder().encode(libraryBackup))
        precondition(decodedLibraryBackup == libraryBackup)
        var originalSetup = EquipmentSetup()
        originalSetup.id = "setup-home"
        originalSetup.name = "Old custom title"
        originalSetup.gym = "Home"
        originalSetup.machine = "Dumbbells"
        originalSetup.seat = "1"
        var editedSetup = originalSetup
        editedSetup.seat = "4"
        let setupExercise = Exercise(id: "press", name: "Press", equipmentSetups: [editedSetup])
        let setupRoutine = WorkoutTemplate(name: "Push", exerciseItems: [ExerciseItem(exerciseId: "press", sets: [], setupProfile: originalSetup)])
        precondition(setupExercise.setups(logs: [], templates: [setupRoutine]) == [editedSetup])
        precondition(editedSetup.displayName == "Home · Dumbbells")
        precondition(editedSetup.cleaned.name == "Home · Dumbbells")
        precondition(editedSetup.isValid)
        precondition(!EquipmentSetup().isValid)
        let restoredSetupExercise = try decoder.decode(Exercise.self, from: JSONEncoder().encode(setupExercise))
        precondition(restoredSetupExercise == setupExercise)
        precondition(setupRoutine.exerciseItems[0].setupProfile?.seat == "1")
        var deletedSetupExercise = setupExercise
        deletedSetupExercise.removeSetup(editedSetup.id)
        precondition(deletedSetupExercise.setups(logs: [], templates: [setupRoutine], current: originalSetup).isEmpty)
        precondition(deletedSetupExercise.currentSetup(originalSetup) == nil)
        let roundTripDeletion = try decoder.decode(Exercise.self, from: JSONEncoder().encode(deletedSetupExercise))
        precondition(roundTripDeletion.deletedEquipmentSetupIds == [editedSetup.id])
        precondition(setupRoutine.exerciseItems[0].setupProfile == originalSetup)
        print("Gym model checks passed: legacy decoding, alternatives, gym matching, backup round-trip, brief, and limits.")
    }
}
