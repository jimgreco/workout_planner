import Foundation
@main struct TargetRIRCheck {
    static func main() throws {
        let legacy = #"{"exerciseId":"bench","sets":[{"reps":"6-10","rir":"0"}]}"#
        var item = try JSONDecoder().decode(ExerciseItem.self, from: Data(legacy.utf8))
        precondition(item.targetRIR == nil && item.sets[0].rir == "0")
        item.targetRIR = 2
        let template = WorkoutTemplate(name: "Synthetic", exerciseItems: [item])
        let copy = try JSONDecoder().decode(WorkoutTemplate.self, from: JSONEncoder().encode(template))
        precondition(copy.exerciseItems[0].targetRIR == 2)
        let prescription = WorkoutPrescription.make(template: copy, program: nil, day: "2026-10-06")
        precondition(prescription.exerciseItems[0].targetRIR == 2)
        var local = item
        local.targetRIR = 3
        var widget = item
        widget.sets[0].reps = "8"
        let merged = mergingWorkoutLiveActivityItems(current: [local], base: [item], updated: [widget])
        precondition(merged[0].targetRIR == 3 && merged[0].sets[0].rir == "0" && merged[0].sets[0].reps == "8")
        item.targetRIR = nil
        let cleared = try JSONSerialization.jsonObject(with: JSONEncoder().encode(item)) as! [String: Any]
        precondition(cleared["targetRIR"] is NSNull)
        item.targetRIR = 0
        let zero = try JSONDecoder().decode(ExerciseItem.self, from: JSONEncoder().encode(item))
        precondition(zero.targetRIR == 0)
        item.targetRIR = 11
        do { _ = try JSONEncoder().encode(item); preconditionFailure("Accepted invalid RIR") } catch is EncodingError {}
        print("PASS target RIR: legacy, null, zero, template/prescription, widget merge, validation")
    }
}
