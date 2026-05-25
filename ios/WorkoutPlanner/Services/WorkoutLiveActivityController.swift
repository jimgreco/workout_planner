import ActivityKit
import Foundation

@MainActor
final class WorkoutLiveActivityController {
    static let shared = WorkoutLiveActivityController()

    private init() {}

    func update(workoutID: String?, state: WorkoutLiveActivityAttributes.ContentState?) {
        guard let workoutID, let state else {
            Task { await endAll() }
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let content = ActivityContent(state: state, staleDate: nil)
        if let activity = activity(for: workoutID) {
            Task {
                await activity.update(content)
            }
            return
        }

        do {
            _ = try Activity<WorkoutLiveActivityAttributes>.request(
                attributes: WorkoutLiveActivityAttributes(workoutID: workoutID),
                content: content,
                pushType: nil
            )
        } catch {
            #if DEBUG
            print("Could not start workout live activity: \(error.localizedDescription)")
            #endif
        }
    }

    func end(workoutID: String?, finalState: WorkoutLiveActivityAttributes.ContentState? = nil) {
        guard let workoutID else {
            Task { await endAll() }
            return
        }
        let content = finalState.map { ActivityContent(state: $0, staleDate: nil) }
        Task {
            for activity in Activity<WorkoutLiveActivityAttributes>.activities where activity.attributes.workoutID == workoutID {
                await activity.end(content, dismissalPolicy: .immediate)
            }
        }
    }

    private func activity(for workoutID: String) -> Activity<WorkoutLiveActivityAttributes>? {
        Activity<WorkoutLiveActivityAttributes>.activities.first { $0.attributes.workoutID == workoutID }
    }

    private func endAll() async {
        for activity in Activity<WorkoutLiveActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
