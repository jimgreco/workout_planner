// Runs the real store + API against a synthetic URLProtocol and isolated defaults.
// swiftc Models.swift WorkoutAPI.swift WorkoutStore.swift this-file -o check
import Foundation
import Combine

@MainActor final class AuthManager {
    var user: UserProfile? { didSet { if oldValue?.sub != user?.sub { invalidateSessionWork() } } }
    var sessionGeneration = UUID()
    var accountDidChange: (() -> Void)?
    var isDemoMode = false
    func invalidateSessionWork() { sessionGeneration = UUID(); accountDidChange?() }
    func checkSession(_ value: UUID) throws { if sessionGeneration != value { throw CancellationError() } }
    func freshIDToken() async throws -> String { guard let user else { throw WorkoutAPIError.unauthorized }; return "synthetic-\(user.sub)" }
    func signOut() { invalidateSessionWork(); user = nil }
    func login(_ id: String) { user = .init(sub: id, name: "Synthetic", email: "", picture: nil) }
}
enum BackgroundSyncScheduler { static func scheduleIfNeeded(pendingSyncCount: Int, pendingConflictCount: Int) {} }
enum AppConfiguration {
    static let apiBaseURL = URL(string: "https://synthetic.invalid")
    static let allowsLocalFallback = false
    static let buildLabel = "test"
}

final class SyntheticProtocol: URLProtocol, @unchecked Sendable {
    static let lock = NSLock()
    nonisolated(unsafe) static var pending: [SyntheticProtocol] = []
    nonisolated(unsafe) static var requests: [URLRequest] = []
    nonisolated(unsafe) static var hold = false
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        Self.requests.append(request)
        let shouldHold = Self.hold
        if shouldHold { Self.pending.append(self) }
        Self.lock.unlock()
        if !shouldHold { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
    }
    override func stopLoading() {}
    static func count() -> Int { lock.lock(); defer { lock.unlock() }; return requests.count }
    static func finish(status: Int = 200, body: String = "{}", fail: Bool = false) {
        lock.lock(); let item = pending.removeFirst(); lock.unlock()
        if fail { item.client?.urlProtocol(item, didFailWithError: URLError(.notConnectedToInternet)); return }
        item.client?.urlProtocol(item, didReceive: HTTPURLResponse(url: item.request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        item.client?.urlProtocol(item, didLoad: Data(body.utf8))
        item.client?.urlProtocolDidFinishLoading(item)
    }
}

@main struct AccountOfflineSyncCheck {
    @MainActor static func main() async throws {
        let suite = "forge-account-sync-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(suite)
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: directory) }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SyntheticProtocol.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        let auth = AuthManager()
        let store = WorkoutStore(auth: auth, offlineDefaults: defaults, urlSession: session, snapshotFolder: directory)
        let legacy = Data("[{\"id\":\"unknown-owner\"}]".utf8)
        for key in ["forge.pendingResourceChanges.v1", "forge.pendingWorkoutLogSaves.v1", "forge.pendingConflicts.v1"] { defaults.set(legacy, forKey: key) }
        auth.login("B")
        let log = WorkoutLog(id: "b-workout", name: "Synthetic B", date: "2026-10-03", exerciseItems: [ExerciseItem(exerciseId: "bench", sets: [WorkoutSet(reps: "", placeholderReps: "6-10")], targetRIR: 2)])
        _ = try await store.saveLog(log)
        precondition(store.pendingSyncCount == 1)
        precondition(store.logs.first?.exerciseItems.first?.targetRIR == 2)
        let queuedData = defaults.dictionaryRepresentation().first { $0.key.hasPrefix("forge.pendingWorkoutLogSaves.v2") }!.value as! Data
        let queued = try JSONSerialization.jsonObject(with: queuedData) as! [[String: Any]]
        let queuedPayload = queued[0]["log"] as! [String: Any]
        let queuedItems = queuedPayload["exerciseItems"] as! [[String: Any]]
        precondition(queuedItems[0]["targetRIR"] as? Int == 2)
        auth.signOut()
        auth.login("A")
        precondition(store.pendingSyncCount == 0 && store.logs.isEmpty)
        let exercise = Exercise(id: "a-only", name: "Synthetic A")
        try await store.saveExercise(exercise)
        precondition(store.pendingSyncCount == 1)
        auth.signOut()
        precondition(store.exercises.isEmpty && store.pendingSyncCount == 0)
        auth.login("B")
        let before = SyntheticProtocol.count()
        precondition(SyntheticProtocol.count() == before && store.exercises.isEmpty && store.logs.isEmpty)
        precondition(store.pendingSyncCount == 1)
        auth.login("A")
        precondition(store.pendingSyncCount == 1)
        for outcome in ["success", "offline", "401", "aba"] {
            SyntheticProtocol.hold = true
            let start = SyntheticProtocol.count()
            let saving = Task { try await store.saveExercise(Exercise(id: "late-\(outcome)", name: "Synthetic A")) }
            for _ in 0..<10000 { if SyntheticProtocol.count() > start { break }; await Task.yield() }
            precondition(SyntheticProtocol.count() == start + 1)
            auth.signOut(); auth.login("B")
            if outcome == "aba" { auth.login("A") }
            SyntheticProtocol.finish(status: outcome == "401" ? 401 : 200, body: "{\"id\":\"late-\(outcome)\",\"name\":\"Synthetic A\",\"muscleGroup\":\"Other\"}", fail: outcome == "offline")
            do { try await saving.value; preconditionFailure("Late write was accepted") }
            catch { precondition(isCancellationError(error)) }
            precondition(store.exercises.isEmpty)
            precondition(auth.user?.sub == (outcome == "aba" ? "A" : "B"))
            auth.login("A")
            precondition(store.pendingSyncCount >= 2)
        }
        // Old flush must not consume another account's queue or send its next item.
        let start = SyntheticProtocol.count()
        let syncing = Task { await store.syncPendingChanges() }
        for _ in 0..<10000 { if SyntheticProtocol.count() > start { break }; await Task.yield() }
        auth.signOut(); auth.login("B")
        SyntheticProtocol.finish(status: 401)
        await syncing.value
        precondition(SyntheticProtocol.count() == start + 1)
        precondition(auth.user?.sub == "B" && store.pendingSyncCount == 1)

        // A newer edit is durable while an older save is still in flight.
        auth.login("C")
        let queuedLog = WorkoutLog(id: "ordered", name: "Before removal", date: "2026-10-04")
        let oldCount = SyntheticProtocol.count()
        let oldSave = Task { try await store.saveLog(queuedLog) }
        while SyntheticProtocol.count() == oldCount { await Task.yield() }
        var removed = queuedLog
        removed.name = "After core removal"
        let latest = removed
        let newerSave = Task { try await store.saveLog(latest) }
        func hasQueuedText(_ text: String) -> Bool {
            defaults.dictionaryRepresentation().values.compactMap { $0 as? Data }
                .contains { String(data: $0, encoding: .utf8)?.contains(text) == true }
        }
        while !hasQueuedText("After core removal") { await Task.yield() }
        precondition(SyntheticProtocol.count() == oldCount + 1)
        oldSave.cancel()
        SyntheticProtocol.finish(body: String(data: try JSONEncoder().encode(queuedLog), encoding: .utf8)!)
        do { _ = try await oldSave.value; preconditionFailure("Superseded save was accepted") }
        catch { precondition(isCancellationError(error)) }
        while SyntheticProtocol.count() == oldCount + 1 { await Task.yield() }
        SyntheticProtocol.finish(body: String(data: try JSONEncoder().encode(latest), encoding: .utf8)!)
        _ = try await newerSave.value
        precondition(store.logs.first?.name == latest.name && store.pendingSyncCount == 0)

        // Queued deletion retains its owner and cannot acquire a new account's API.
        let heldCount = SyntheticProtocol.count()
        let heldSave = Task { try await store.saveLog(queuedLog) }
        while SyntheticProtocol.count() == heldCount { await Task.yield() }
        let deleting = Task { try await store.deleteLog(queuedLog.id) }
        while !hasQueuedText("\"operation\":\"delete\"") { await Task.yield() }
        auth.signOut(); auth.login("B")
        SyntheticProtocol.finish(body: String(data: try JSONEncoder().encode(queuedLog), encoding: .utf8)!)
        do { _ = try await heldSave.value; preconditionFailure("Old account save was accepted") }
        catch { precondition(isCancellationError(error)) }
        do { try await deleting.value; preconditionFailure("Queued delete crossed accounts") }
        catch { precondition(isCancellationError(error)) }
        precondition(SyntheticProtocol.count() == heldCount + 1 && store.logs.isEmpty)
        auth.login("C")
        precondition(store.pendingSyncCount == 1 && hasQueuedText("\"operation\":\"delete\""))
        for key in ["forge.pendingResourceChanges.v1", "forge.pendingWorkoutLogSaves.v1", "forge.pendingConflicts.v1"] { precondition(defaults.data(forKey: key) == legacy) }
        precondition(store.syncDetailText?.contains("preserved") == true)
        // Pause state uses the same durable queue and offline snapshot on relaunch.
        SyntheticProtocol.hold = false
        let pauseAuth = AuthManager()
        let pauseStore = WorkoutStore(auth: pauseAuth, offlineDefaults: defaults, urlSession: session, snapshotFolder: directory)
        pauseAuth.login("pause-owner")
        let started = workoutTimestamp("2026-10-05T10:00:00Z")!
        var paused = WorkoutLog(id: "paused-session", name: "Pause restore", date: "2026-10-05", exerciseItems: [ExerciseItem(exerciseId: "bench", sets: [WorkoutSet(reps: "8", weight: "100", restStartTime: started.addingTimeInterval(50).timeIntervalSince1970 * 1000, rir: "0")])], startTime: "2026-10-05T10:00:00Z", status: "active")
        paused.pause(at: started.addingTimeInterval(60))
        try await pauseStore.saveLog(paused)
        let restoredAuth = AuthManager()
        let restoredStore = WorkoutStore(auth: restoredAuth, offlineDefaults: defaults, urlSession: session, snapshotFolder: directory)
        restoredAuth.login("pause-owner")
        await restoredStore.loadData()
        precondition(restoredStore.activeWorkout() == paused)
        var resumed = restoredStore.activeWorkout()!
        resumed.resume(at: started.addingTimeInterval(3660))
        try await restoredStore.saveLog(resumed)
        precondition(restoredStore.logs.first?.pausedAt == nil)
        precondition(restoredStore.logs.first?.pausedDurationMs == 3_600_000)
        resumed.pause(at: started.addingTimeInterval(3720))
        resumed.finishTiming(at: started.addingTimeInterval(7320))
        resumed.status = "finished"
        resumed.endTime = "2026-10-05T12:02:00Z"
        try await restoredStore.saveLog(resumed)
        precondition(restoredStore.logs.first?.pausedDurationMs == 7_200_000)
        precondition(restoredStore.activeWorkout() == nil)
        paused.id = "discard-paused"
        try await restoredStore.saveLog(paused)
        try await restoredStore.deleteLog(paused.id)
        precondition(!restoredStore.logs.contains { $0.id == paused.id })
        await restoredStore.loadData()
        precondition(!restoredStore.logs.contains { $0.id == paused.id })
        precondition(restoredStore.logs.first?.status == "finished")
        print("PASS pause offline lifecycle: queued pause, full store recreation, offline resume/finish/discard and reload")
        print("PASS native account isolation: durable owner queues, sign-out reset, legacy quarantine, late success/failure/401, A-B-A, interrupted flush, ordered edits, durable queued deletion and account-switch fencing")
    }
}
