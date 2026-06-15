import ActivityKit
import Foundation

struct WorkoutLiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var workoutName: String
        var exerciseName: String
        var muscleGroup: String
        var setLabel: String
        var reps: String
        var weight: String
        var setType: String
        var personalBest: String?
        var needsWeightIncrease: Bool
        var completedSets: Int
        var totalSets: Int
        var exerciseCount: Int
        var startedAt: Date?
        var restStartedAt: Date?
        var restTargetEnd: Date?
        var restTargetSeconds: Int?
        var restExerciseName: String?
        var isComplete: Bool

        var progress: Double {
            guard totalSets > 0 else { return 0 }
            return min(1, max(0, Double(completedSets) / Double(totalSets)))
        }

        var isResting: Bool {
            restStartedAt != nil
        }
    }

    var workoutID: String
}
