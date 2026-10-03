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
        let log = WorkoutLog(id: "b-workout", name: "Synthetic B", date: "2026-10-03")
        _ = try await store.saveLog(log)
        precondition(store.pendingSyncCount == 1)
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
        for key in ["forge.pendingResourceChanges.v1", "forge.pendingWorkoutLogSaves.v1", "forge.pendingConflicts.v1"] { precondition(defaults.data(forKey: key) == legacy) }
        precondition(store.syncDetailText?.contains("preserved") == true)
        print("PASS native account isolation: durable owner queues, sign-out reset, legacy quarantine, late success/failure/401, A-B-A, interrupted flush")
    }
}
