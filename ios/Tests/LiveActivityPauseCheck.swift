import Foundation

@main struct LiveActivityPauseCheck {
    static func main() throws {
        let legacyJSON = #"{"workoutName":"Pause check","exerciseName":"Bench","muscleGroup":"Chest","setLabel":"1/2","reps":"8","weight":"100","loadLabel":"1x","allowsWeightEntry":true,"interactionRevision":0,"setType":"","needsWeightIncrease":false,"completedSets":0,"totalSets":2,"exerciseCount":1,"isComplete":false}"#
        let content = try JSONDecoder().decode(WorkoutLiveActivityAttributes.ContentState.self, from: Data(legacyJSON.utf8))
        precondition(!content.isPaused)
        var state = WorkoutLiveActivitySharedState(workoutID: "synthetic", workoutName: "Pause check", items: [WorkoutLiveActivitySharedItem(exerciseId: "bench", exerciseName: "Bench", muscleGroup: "Chest", weightType: "weight", restTargetSeconds: 90, sets: [WorkoutLiveActivitySharedSet(reps: "8", weight: "100"), WorkoutLiveActivitySharedSet(reps: "8", weight: "100")])], activeExerciseIndex: 0, activeSetIndex: 0, revision: 0, contentState: content)
        state.logCurrentSet()
        precondition(state.revision == 1 && state.contentState.isResting)
        let pause = Date()
        state.contentState.pausedAt = pause
        let frozen = state
        state.adjustReps(delta: 1)
        state.adjustWeight(delta: 5, resetToBaseline: false)
        state.logCurrentSet()
        precondition(state == frozen)
        let restored = try JSONDecoder().decode(WorkoutLiveActivitySharedState.self, from: JSONEncoder().encode(state))
        precondition(restored == state && restored.contentState.isPaused)
        state.refreshContentState()
        precondition(state.contentState.pausedAt == pause)
        state.contentState.pausedAt = nil
        state.adjustReps(delta: 1)
        precondition(state.revision == 2 && state.items[0].sets[1].reps == "9")
        print("PASS Live Activity pause: legacy decoding, frozen intents/rest state, shared-store serialization, resumed interactions")
    }
}
