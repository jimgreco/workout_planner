import Foundation

@main
struct SmithWeightCheck {
    static func main() throws {
        precondition(effectiveRecordedWeight("45", weightType: "smith_double", smithBarWeight: 20) == 110)
        precondition(effectiveRecordedWeight("45", weightType: "smith_double", smithBarWeight: 35) == 125)
        precondition(effectiveRecordedWeight("45", weightType: "smith_double", smithBarWeight: 0) == 90)
        precondition(effectiveRecordedWeight("0", weightType: "smith_double", smithBarWeight: 20) == 20)
        precondition(effectiveRecordedWeight("45", weightType: "bar_double") == 135)
        precondition(effectiveRecordedWeight("45", weightType: "smith_double") == nil)
        precondition(validSmithBarWeight(-1) == nil && validSmithBarWeight(.infinity) == nil)
        precondition(calculatedWeightCaption(weight: "45", weightType: "smith_double") == "90 lb plates + unknown bar")
        precondition(calculatedWeightCaption(weight: "45", weightType: "smith_double", smithBarWeight: 20) == "Total 110 lbs")
        precondition(contextualWeightPlaceholder(weight: "45", sourceWeightType: "smith_double", targetWeightType: "weight") == nil)
        precondition(contextualWeightPlaceholder(weight: "45", sourceWeightType: "smith_double", targetWeightType: "smith_double") == "45")
        let sets = [WorkoutSet(reps: "10", weight: "45")]
        precondition(bestPersonalBestCandidate(from: sets, weightType: "smith_double") == nil)
        precondition(bestPersonalBestCandidate(from: sets, weightType: "smith_double", smithBarWeight: 20)?.weightValue == 110)
        let decoder = JSONDecoder(), encoder = JSONEncoder()
        let oldJSON = #"{"id":"old","name":"Smith","gym":"Gym","machine":"Smith","seat":"","grip":"","loadConvention":""}"#
        let legacy = try decoder.decode(EquipmentSetup.self, from: Data(oldJSON.utf8))
        precondition(legacy.smithBarWeight == nil)
        var profile = legacy
        profile.smithBarWeight = 20
        let item = ExerciseItem(exerciseId: "smith", weightType: "smith_double", sets: sets, setupProfile: profile)
        let restored = try decoder.decode(ExerciseItem.self, from: encoder.encode(item))
        precondition(restored == item)
        profile.smithBarWeight = 35
        precondition(item.setupProfile?.smithBarWeight == 20)
        precondition(smithLoadContext(item) != smithLoadContext(ExerciseItem(exerciseId: "smith", weightType: "smith_double", sets: sets, setupProfile: profile)))
        print("Smith checks passed: totals, unknown vs zero, captions, placeholders, PRs, snapshots and legacy decoding.")
    }
}
