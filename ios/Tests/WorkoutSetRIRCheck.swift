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
        precondition(restored.historyStatusPrefix.isEmpty)
        precondition(WorkoutSet(reps: "8", weight: "60").historyStatusPrefix.isEmpty)
        precondition(WorkoutSet(reps: "8", weight: "60", completion: "skipped").historyStatusPrefix == "Skipped · ")
        let added = restored.additionalSet(planningMode: false, defaultReps: 8)
        precondition(added.reps == "8" && added.weight == "60" && added.repMode == "linkedSides")
        precondition(!isRecordedWorkingSet(added), "Copied inputs must not count as a performed set")
        precondition(added.rir == nil && added.rpe == nil && added.restStartTime == nil && added.restDuration == nil)
        let addedRoundTrip = try decoder.decode(WorkoutSet.self, from: encoder.encode(added))
        precondition(!isRecordedWorkingSet(addedRoundTrip))
        precondition(addedRoundTrip.historyStatusPrefix == "Not recorded · ")
        precondition(bestPersonalBestCandidate(from: [addedRoundTrip], weightType: "weight") == nil)
        precondition(restored.additionalSet(planningMode: true, defaultReps: 8).completion == nil)
        for unilateral in [false, true] {
            let newSet = WorkoutSet.newExerciseSet(planningMode: false, defaultReps: 10, isUnilateral: unilateral)
            let newRoundTrip = try decoder.decode(WorkoutSet.self, from: encoder.encode(newSet))
            precondition(newRoundTrip.reps == "10")
            precondition(newRoundTrip.repsLeft == (unilateral ? "10" : nil))
            precondition(newRoundTrip.repsRight == (unilateral ? "10" : nil))
            precondition(!isRecordedWorkingSet(newRoundTrip), "Adding an exercise to history must not invent performed sets")
            var entered = newRoundTrip
            entered.completion = "recorded"
            precondition(isRecordedWorkingSet(entered))
            let planned = WorkoutSet.newExerciseSet(planningMode: true, defaultReps: 10, isUnilateral: unilateral)
            precondition(planned.reps == "" && planned.placeholderReps == "10" && planned.completion == nil)
        }
        set.rir = WorkoutSet.normalizedRir("")
        let cleared = try decoder.decode(WorkoutSet.self, from: encoder.encode(set))
        precondition(cleared.rir == nil)
        precondition(WorkoutSet().rir == nil)
        print("RIR checks passed: unanswered/null/blank, explicit zero, clearing, and complete set round-trip.")
    }
}
