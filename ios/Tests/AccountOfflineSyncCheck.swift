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
        // Equipment preference uses the same owned snapshot/queue after an offline
        // finish. A tentative active choice and a discarded session cannot replace it.
        let setup = EquipmentSetup(id: "home", machine: "Synthetic bench")
        let setupExercise = Exercise(id: "press", name: "Press", equipmentSetups: [setup])
        try await restoredStore.saveExercise(setupExercise)
        let selected = ExerciseItem(exerciseId: "press", sets: [], baselineId: setup.id, setupProfile: setup, targetRIR: 2, setupSelectionMade: true)
        let selectionLog = WorkoutLog(id: "setup-finished", name: "Synthetic", date: "2026-10-07", exerciseItems: [selected], status: "finished")
        try await restoredStore.saveLog(selectionLog)
        func preferred(_ source: WorkoutStore) -> EquipmentSetup? {
            newWorkoutEquipment(ExerciseItem(exerciseId: "press", sets: []), exercise: source.exercise(id: "press"), logs: source.logs).setupProfile
        }
        let setupAuth = AuthManager()
        let setupStore = WorkoutStore(auth: setupAuth, offlineDefaults: defaults, urlSession: session, snapshotFolder: directory)
        setupAuth.login("pause-owner")
        await setupStore.loadData()
        precondition(setupStore.isUsingOfflineSnapshot && preferred(setupStore) == setup)
        precondition(setupStore.logs.first { $0.id == selectionLog.id }?.exerciseItems[0].setupSelectionMade == true)
        var tentative = selectionLog; tentative.id = "setup-discard"; tentative.status = "active"; tentative.date = "2026-10-08"
        tentative.exerciseItems[0].setupProfile = nil
        SyntheticProtocol.hold = true
        let pendingSetupCount = SyntheticProtocol.count()
        let savingChoice = Task { try await setupStore.saveLog(tentative) }
        for _ in 0..<10000 { if SyntheticProtocol.count() > pendingSetupCount { break }; await Task.yield() }
        precondition(setupStore.activeWorkout()?.id == tentative.id)
        precondition(setupStore.activeWorkout()?.exerciseItems[0].setupProfile == nil)
        precondition(setupStore.activeWorkout()?.exerciseItems[0].setupSelectionMade == true)
        precondition(preferred(setupStore) == setup)
        SyntheticProtocol.finish(fail: true)
        _ = try await savingChoice.value
        let pendingDeleteCount = SyntheticProtocol.count()
        let deletingChoice = Task { try await setupStore.deleteLog(tentative.id) }
        for _ in 0..<10000 { if SyntheticProtocol.count() > pendingDeleteCount { break }; await Task.yield() }
        precondition(setupStore.activeWorkout() == nil)
        SyntheticProtocol.finish(fail: true)
        try await deletingChoice.value
        precondition(preferred(setupStore) == setup)
        // Hold a source load, switch accounts, then release a late offline result.
        SyntheticProtocol.hold = true
        let requestCount = SyntheticProtocol.count()
        let lateLoad = Task { await setupStore.loadData() }
        for _ in 0..<10000 { if SyntheticProtocol.count() >= requestCount + 1 { break }; await Task.yield() }
        precondition(SyntheticProtocol.count() == requestCount + 1)
        setupAuth.login("setup-other")
        SyntheticProtocol.finish(fail: true)
        await lateLoad.value
        precondition(preferred(setupStore) == nil && setupStore.logs.isEmpty)
        SyntheticProtocol.hold = false
        setupAuth.login("pause-owner")
        await setupStore.loadData()
        precondition(preferred(setupStore) == setup)
        try await setupStore.deleteEquipmentSetup(exerciseID: "press", setupID: setup.id)
        precondition(preferred(setupStore) == nil)
        precondition(setupStore.logs.first { $0.id == selectionLog.id }?.exerciseItems[0].setupProfile == setup)
        await setupStore.loadData()
        precondition(preferred(setupStore) == nil)
        print("PASS equipment preference: explicit choice, offline finish/restart, draft/discard, late source load/account switch, deleted setup and unchanged history")
        // Explicit legacy recovery stages a retained comparison; no historical write.
        let recoveryAuth = AuthManager()
        let recoveryStore = WorkoutStore(auth: recoveryAuth, offlineDefaults: defaults, urlSession: session, snapshotFolder: directory)
        recoveryAuth.login("recovery-A")
        var original = paused
        original.id = "legacy-recovery-only"
        original.exerciseItems[0].targetRIR = 2
        let originalBytes = try JSONEncoder().encode([original])
        defaults.set(originalBytes, forKey: "forge.pendingWorkoutLogSaves.v1")
        do { _ = try recoveryStore.beginLegacyRecovery(account: "wrong", confirmed: true); preconditionFailure("Wrong owner accepted") } catch {}
        let review = try recoveryStore.beginLegacyRecovery(account: "recovery-A", confirmed: true)
        let record = try recoveryStore.legacyRecoveryRecords(review).first { $0.resource == .logs }!
        precondition(record.local?.log == original)
        SyntheticProtocol.hold = true
        let firstReadCount = SyntheticProtocol.count()
        let recovering = Task { try await recoveryStore.recoverLegacyRecord(record.id, review: review, setAside: false) }
        while SyntheticProtocol.count() == firstReadCount { await Task.yield() }
        var cloudOriginal = original; cloudOriginal.revision = 7
        SyntheticProtocol.finish(body: String(decoding: try JSONEncoder().encode([cloudOriginal]), as: UTF8.self))
        try await recovering.value
        precondition(SyntheticProtocol.count() == firstReadCount + 1)
        precondition(recoveryStore.pendingSyncCount == 0 && recoveryStore.pendingConflictCount == 1)
        let comparison = recoveryStore.syncConflicts[0]
        precondition(comparison.local?.log == original && comparison.actualRevision == 7)
        precondition(comparison.local?.log?.exerciseItems[0].targetRIR == 2)
        precondition(comparison.local?.log?.exerciseItems[0].sets[0].rir == "0")
        precondition(comparison.local?.log?.pausedAt == original.pausedAt)
        let reloaded = WorkoutStore(auth: recoveryAuth, offlineDefaults: defaults, urlSession: session, snapshotFolder: directory)
        precondition(reloaded.syncConflicts == [comparison])
        do { try await recoveryStore.recoverLegacyRecord(record.id, review: review, setAside: false); preconditionFailure("Duplicate recovery staged") } catch {}
        let conflictWriteCount = SyntheticProtocol.count()
        let conflictWrite = Task { await recoveryStore.resolveSyncConflict(comparison, keeping: .local) }
        while SyntheticProtocol.count() == conflictWriteCount { await Task.yield() }
        // The server committed the positive-revision write but its response was lost.
        SyntheticProtocol.finish(fail: true)
        await conflictWrite.value
        precondition(recoveryStore.syncConflicts == [comparison])
        let retryCount = SyntheticProtocol.count()
        let retryAfterDelete = Task { await recoveryStore.resolveSyncConflict(comparison, keeping: .local) }
        while SyntheticProtocol.count() == retryCount { await Task.yield() }
        // Another client then hard-deleted it. The reviewed positive revision must
        // be retained; the real handler regression verifies this returns 409.
        SyntheticProtocol.finish(status: 409, body: #"{"error":"Resource was updated elsewhere","conflict":{"actualRevision":0}}"#)
        await retryAfterDelete.value
        precondition(recoveryStore.syncConflicts == [comparison])
        precondition(defaults.data(forKey: "forge.pendingWorkoutLogSaves.v1") == originalBytes)
        await recoveryStore.resolveSyncConflict(comparison, keeping: .remote)
        precondition(recoveryStore.pendingConflictCount == 0)
        precondition(defaults.data(forKey: "forge.pendingWorkoutLogSaves.v1") == originalBytes)
        recoveryAuth.login("recovery-B")
        let otherReview = try reloaded.beginLegacyRecovery(account: "recovery-B", confirmed: true)
        let otherRecords = try reloaded.legacyRecoveryRecords(otherReview)
        precondition(otherRecords.first { $0.id == record.id }?.state == "another-account")
        let otherPacket = try reloaded.exportLegacyRecovery(otherReview)
        precondition(!otherPacket.contains(originalBytes.base64EncodedString()))
        recoveryAuth.login("recovery-A")
        let lateReview = try reloaded.beginLegacyRecovery(account: "recovery-A", confirmed: true)
        // A new source version allows review, but an A → B → A session switch cancels its read.
        original.id = "late-recovery-source"
        defaults.set(try JSONEncoder().encode([original]), forKey: "forge.pendingWorkoutLogSaves.v1")
        do { _ = try reloaded.exportLegacyRecovery(lateReview); preconditionFailure("Changed source accepted") } catch {}
        let freshReview = try reloaded.beginLegacyRecovery(account: "recovery-A", confirmed: true)
        let freshRecord = try reloaded.legacyRecoveryRecords(freshReview).first { $0.resource == .logs }!
        let lateCount = SyntheticProtocol.count()
        let lateRecovery = Task { try await reloaded.recoverLegacyRecord(freshRecord.id, review: freshReview, setAside: false) }
        while SyntheticProtocol.count() == lateCount { await Task.yield() }
        recoveryAuth.login("recovery-B"); recoveryAuth.login("recovery-A")
        SyntheticProtocol.finish(body: "[]")
        do { try await lateRecovery.value; preconditionFailure("Late recovery crossed accounts") } catch { precondition(isCancellationError(error)) }
        precondition(reloaded.pendingConflictCount == 0)
        let reversibleReview = try reloaded.beginLegacyRecovery(account: "recovery-A", confirmed: true)
        let reversibleRecord = try reloaded.legacyRecoveryRecords(reversibleReview).first { $0.resource == .logs }!
        let beforeAside = SyntheticProtocol.count()
        try await reloaded.recoverLegacyRecord(reversibleRecord.id, review: reversibleReview, setAside: true)
        try reloaded.restoreLegacyRecord(reversibleRecord.id, review: reversibleReview)
        let restoredRecords = try reloaded.legacyRecoveryRecords(reversibleReview)
        precondition(restoredRecords.first { $0.id == reversibleRecord.id }?.state == "preserved")
        precondition(SyntheticProtocol.count() == beforeAside)
        let missingCount = SyntheticProtocol.count()
        let missingRecovery = Task { try await reloaded.recoverLegacyRecord(reversibleRecord.id, review: reversibleReview, setAside: false) }
        while SyntheticProtocol.count() == missingCount { await Task.yield() }
        SyntheticProtocol.finish(body: "[]")
        do { try await missingRecovery.value; preconditionFailure("Missing history was staged") } catch {}
        precondition(reloaded.pendingConflictCount == 0 && SyntheticProtocol.count() == missingCount + 1)
        let retainedPacket = try reloaded.exportLegacyRecovery(reversibleReview)
        precondition(retainedPacket.contains(defaults.data(forKey: "forge.pendingWorkoutLogSaves.v1")!.base64EncodedString()))
        let reviewRaceCount = SyntheticProtocol.count()
        let reviewRace = Task { try await reloaded.recoverLegacyRecord(reversibleRecord.id, review: reversibleReview, setAside: false) }
        while SyntheticProtocol.count() == reviewRaceCount { await Task.yield() }
        try await reloaded.recoverLegacyRecord(reversibleRecord.id, review: reversibleReview, setAside: true)
        try reloaded.restoreLegacyRecord(reversibleRecord.id, review: reversibleReview)
        var liveCopy = original; liveCopy.revision = 7
        SyntheticProtocol.finish(body: String(decoding: try JSONEncoder().encode([liveCopy]), as: UTF8.self))
        do { try await reviewRace.value; preconditionFailure("Set-aside decision was ignored") } catch {}
        precondition(reloaded.pendingConflictCount == 0 && SyntheticProtocol.count() == reviewRaceCount + 1)
        print("PASS missing/deleted recovery containment and in-flight set-aside/return review fencing")
        print("PASS legacy recovery: exact source retention, explicit attribution, staged comparison, pause/RIR preservation, reload, duplicate decisions, cross-account export and stale-read fencing")
        print("PASS pause offline lifecycle: queued pause, full store recreation, offline resume/finish/discard and reload")
        print("PASS native account isolation: durable owner queues, sign-out reset, legacy quarantine, late success/failure/401, A-B-A, interrupted flush, ordered edits, durable queued deletion and account-switch fencing")
    }
}
