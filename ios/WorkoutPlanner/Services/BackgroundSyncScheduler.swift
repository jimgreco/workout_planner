import BackgroundTasks
import Foundation

enum BackgroundSyncScheduler {
    static let identifier = "com.workoutplanner.ios.pending-sync"
    private static var isRegistered = false

    static func register(store: WorkoutStore) {
        guard !isRegistered else { return }
        isRegistered = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(refreshTask, store: store)
        }
    }

    static func scheduleIfNeeded(pendingSyncCount: Int, pendingConflictCount: Int) {
        guard pendingSyncCount > 0, pendingConflictCount == 0 else { return }
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            #if DEBUG
            print("Could not schedule pending sync refresh: \(error.localizedDescription)")
            #endif
        }
    }

    private static func handle(_ task: BGAppRefreshTask, store: WorkoutStore) {
        var syncTask: Task<Void, Never>?
        task.expirationHandler = {
            syncTask?.cancel()
        }
        syncTask = Task { @MainActor in
            let success = await store.performBackgroundSync()
            task.setTaskCompleted(success: success)
        }
    }
}
