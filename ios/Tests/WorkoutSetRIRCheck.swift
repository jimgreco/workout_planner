import Foundation

// Run with Models.swift to verify draft/export/API encoding without a simulator.
@main
struct WorkoutSetRIRCheck {
    static func main() throws {
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        for json in [#"{}"#, #"{"rir":null}"#, #"{"rir":""}"#, #"{"rir":"  "}"#] {
            let set = try decoder.decode(WorkoutSet.self, from: Data(json.utf8))
            precondition(WorkoutSet.normalizedRir(set.rir) == nil)
            let encoded = try encoder.encode(set)
            let object = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
            precondition(object["rir"] is NSNull)
            let decoded = try decoder.decode(WorkoutSet.self, from: encoded)
            precondition(decoded.rir == nil)
        }
        var set = WorkoutSet(reps: "8", repsLeft: "8", repsRight: "8", repMode: "linkedSides", weight: "60", placeholderReps: "6-10", placeholderRepsLeft: "6-10", placeholderRepsRight: "6-10", placeholderWeight: "55", placeholderWeightType: "bar_double", restStartTime: 10, restDuration: 120, restTargetSeconds: 180, rpe: "10", rir: "0", setType: "working", completion: "recorded")
        let restored = try decoder.decode(WorkoutSet.self, from: encoder.encode(set))
        precondition(restored == set)
        precondition(restored.rir == "0")
        set.rir = WorkoutSet.normalizedRir("")
        let cleared = try decoder.decode(WorkoutSet.self, from: encoder.encode(set))
        precondition(cleared.rir == nil)
        precondition(WorkoutSet().rir == nil)
        print("RIR checks passed: unanswered/null/blank, explicit zero, clearing, and complete set round-trip.")
    }
}
