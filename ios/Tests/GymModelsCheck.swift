import Foundation

// Run: swiftc ios/WorkoutPlanner/Support/Models.swift ios/Tests/GymModelsCheck.swift -o /tmp/forge-gym-model-check && /tmp/forge-gym-model-check
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
        let oldBackup = try decoder.decode(ForgeExportPayload.self, from: Data(#"{"exercises":[],"templates":[]}"#.utf8))
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
        let backup = ForgeExportPayload(exercises: [exercise], templates: [routine], gyms: [gym])
        let restored = try decoder.decode(ForgeExportPayload.self, from: JSONEncoder().encode(backup))
        precondition(restored == backup)
        precondition(restored.templates?.first?.gymId == restored.gyms?.first?.id)
        precondition(gym.aiBrief(routine: routine).contains("5–50 lb"))
        precondition(gym.aiBrief(routine: routine).contains("Equipment entries are alternatives"))
        precondition(gym.isValid)
        precondition(!Gym(name: " ").isValid)
        precondition(!Gym(name: "Home", equipment: [GymEquipment()]).isValid)
        precondition(GymEquipment.preloaded.count == 112)
        precondition(Set(GymEquipment.preloaded.map(\.id)).count == 112)
        let libraryExercise = Exercise(name: "Press", equipmentAlternatives: [EquipmentAlternative(equipmentId: "eq-dumbbells")])
        let linkedGym = Gym(name: "Hotel", equipment: [GymEquipment(name: "Dumbbells", category: "Free weights", equipmentId: "eq-dumbbells")])
        precondition(libraryExercise.equipmentSummary(at: linkedGym) == "Dumbbells")
        let libraryBackup = ForgeExportPayload(exercises: [libraryExercise], gyms: [linkedGym], equipment: GymEquipment.preloaded)
        let decodedLibraryBackup = try decoder.decode(ForgeExportPayload.self, from: JSONEncoder().encode(libraryBackup))
        precondition(decodedLibraryBackup == libraryBackup)
        print("Gym model checks passed: legacy decoding, alternatives, gym matching, backup round-trip, brief, and limits.")
    }
}
