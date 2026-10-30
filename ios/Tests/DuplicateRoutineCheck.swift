import Foundation
@main struct DuplicateRoutineCheck {
    static func main() throws {
        let fixture = URL(fileURLWithPath: CommandLine.arguments[1])
        let source = try JSONDecoder().decode(WorkoutTemplate.self, from: Data(contentsOf: fixture))
        var copy = source.duplicated(in: [source], id: "draft")
        precondition(copy.id == "draft" && copy.name == "Push Day copy")
        precondition(copy.exerciseItems == source.exerciseItems && copy.gymId == source.gymId && copy.description == source.description)
        precondition(copy.revision == nil && copy.updatedAt == nil)
        copy.exerciseItems[0].sets[0].reps = "5"
        copy.exerciseItems[0].setupProfile?.name = "Different machine"
        precondition(source.exerciseItems[0].sets[0].reps == "8-12" && source.exerciseItems[0].setupProfile?.name == "Smith")
        let collision = source.duplicated(in: [.init(name: " PUSH DAY COPY "), .init(name: "Push Day copy 2")])
        precondition(collision.name == "Push Day copy 3")
        precondition(source.duplicated(in: []).id != source.duplicated(in: []).id)
        let long = WorkoutTemplate(name: String(repeating: "🏋", count: 60))
        let first = long.duplicated(in: [])
        let second = long.duplicated(in: [first])
        precondition(first.name.utf16.count <= 120 && second.name.utf16.count <= 120 && second.name.hasSuffix(" copy 2"))
        let empty = WorkoutTemplate(name: "  ").duplicated(in: [])
        precondition(empty.name == "Routine copy" && empty.exerciseItems.isEmpty && empty.gymId == nil)
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(copy)) as! [String: Any]
        precondition(encoded["revision"] == nil && encoded["updatedAt"] == nil)
        print("PASS duplicate routine: independent identity and prescription, gym/setup/effort/order/missing references, collision naming, Unicode length and no resource revision")
    }
}
