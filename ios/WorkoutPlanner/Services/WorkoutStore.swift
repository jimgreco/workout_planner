import Foundation
import Combine

struct PendingWorkoutStart: Equatable {
    var template: WorkoutTemplate
    var program: TrainingProgram?
}

@MainActor
final class WorkoutStore: ObservableObject {
    @Published var exercises: [Exercise] = []
    @Published var templates: [WorkoutTemplate] = []
    @Published var logs: [WorkoutLog] = []
    var personalBestLogs: [WorkoutLog] { logsWithPersonalBests(logs) }
    @Published var equipment: [GymEquipment] = GymEquipment.preloaded
    @Published var gyms: [Gym] = []
    @Published var programs: [TrainingProgram] = []
    @Published var settings = WorkoutSettings.defaults
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var pendingTemplate: WorkoutTemplate?
    @Published var pendingWorkoutStart: PendingWorkoutStart?
    @Published var editingLog: WorkoutLog?
    @Published var pendingSyncCount = 0
    @Published var pendingConflictCount = 0
    @Published var syncConflicts: [SyncConflictItem] = []
    @Published var isSyncingPending = false
    @Published var syncIssueMessage: String?
    @Published var lastSyncAttemptAt: Date?
    @Published var isUsingOfflineSnapshot = false

    private let auth: AuthManager
    private let offlineDefaults: UserDefaults
    private let urlSession: URLSession
    private let snapshotFolder: URL?
    private var storeGeneration = UUID()
    private var pendingResourceQueue: PendingResourceQueue { .init(ownerID: auth.user?.sub, defaults: offlineDefaults) }
    private var pendingLogQueue: PendingWorkoutLogQueue { .init(ownerID: auth.user?.sub, defaults: offlineDefaults) }
    private var pendingConflictQueue: PendingSyncConflictQueue { .init(ownerID: auth.user?.sub, defaults: offlineDefaults) }
    private var snapshotStore: OfflineDataSnapshotStore { .init(ownerID: auth.user?.sub, directory: snapshotFolder) }
    private var pendingRetryTask: Task<Void, Never>?
    private var isFlushingPendingChanges = false
    private let logWriteQueue = WorkoutLogWriteQueue()
    private var api: WorkoutAPI? {
        guard let baseURL = AppConfiguration.apiBaseURL, auth.user != nil else { return nil }
        let generation = auth.sessionGeneration
        let storeGeneration = self.storeGeneration
        let check = { [weak self, auth] in
            try auth.checkSession(generation)
            guard let self, self.storeGeneration == storeGeneration else { throw CancellationError() }
        }
        return WorkoutAPI(baseURL: baseURL, tokenProvider: { [auth] in
            try check()
            let token = try await auth.freshIDToken()
            try check()
            return token
        }, checkSession: check, urlSession: urlSession)
    }

    init(auth: AuthManager, offlineDefaults: UserDefaults = .standard, urlSession: URLSession = .shared, snapshotFolder: URL? = nil) {
        self.auth = auth
        self.offlineDefaults = offlineDefaults
        self.urlSession = urlSession
        self.snapshotFolder = snapshotFolder
        auth.accountDidChange = { [weak self] in self?.reset() }
        refreshPendingSyncCount()
    }

    var usesLocalData: Bool {
        AppConfiguration.allowsLocalFallback && (auth.isDemoMode || api == nil)
    }

    var syncStatusText: String {
        if usesLocalData { return "Local demo data" }
        if isUsingOfflineSnapshot { return "Offline data" }
        if pendingConflictCount > 0 {
            return "\(pendingConflictCount) sync \(pendingConflictCount == 1 ? "conflict" : "conflicts")"
        }
        if pendingSyncCount > 0 {
            if isSyncingPending { return "Syncing \(pendingSyncCount) pending" }
            return "\(pendingSyncCount) pending \(pendingSyncCount == 1 ? "change" : "changes")"
        }
        return "Cloud sync"
    }

    var syncDetailText: String? {
        if hasLegacyRecoveryWork {
            return "Older offline changes are preserved on this device. Open Offline Recovery to verify their original account; do not remove the app."
        }
        if let syncIssueMessage {
            return syncIssueMessage
        }
        if pendingConflictCount > 0 {
            return "Review sync conflicts before Rep, Mix, Burn retries those changes."
        }
        if pendingSyncCount > 0 {
            let retryText = lastSyncAttemptAt.map { "Last retry \(Self.syncAttemptFormatter.string(from: $0))" } ?? "Will retry automatically"
            return "\(retryText) while Rep, Mix, Burn is open."
        }
        if isUsingOfflineSnapshot {
            return "Showing saved data. Changes will sync when Rep, Mix, Burn reconnects."
        }
        return nil
    }

    var hasLegacyRecoveryWork: Bool { LegacyRecoveryJournal.keys.contains { offlineDefaults.object(forKey: $0) != nil } }
    var recoveryAccountID: String? { auth.user?.sub }
    var recoveryGeneration: UUID { storeGeneration }

    func beginLegacyRecovery(account: String, confirmed: Bool) throws -> LegacyRecoveryReview {
        guard confirmed, auth.user?.sub == account else { throw LegacyRecoveryError.reviewRequired }
        return LegacyRecoveryReview(owner: account, generation: storeGeneration, sources: LegacyRecoveryJournal.sources(offlineDefaults))
    }

    private func checkLegacyReview(_ review: LegacyRecoveryReview) throws {
        guard review.owner == auth.user?.sub, review.generation == storeGeneration,
              review.sources == LegacyRecoveryJournal.sources(offlineDefaults) else { throw CancellationError() }
    }

    func legacyRecoveryRecords(_ review: LegacyRecoveryReview) throws -> [LegacyRecoveryRecord] {
        try checkLegacyReview(review)
        return try LegacyRecoveryJournal.records(review, defaults: offlineDefaults)
    }

    func exportLegacyRecovery(_ review: LegacyRecoveryReview) throws -> String {
        try checkLegacyReview(review)
        let decisions = try LegacyRecoveryJournal.read(offlineDefaults)
        let allowed = review.sources.filter { source in !decisions.contains { $0.source == source && $0.owner != review.owner } }
        let packet = LegacyRecoveryExport(account: review.owner, sources: allowed, decisions: decisions.filter { $0.owner == review.owner && allowed.contains($0.source) })
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return String(decoding: try encoder.encode(packet), as: UTF8.self)
    }

    func restoreLegacyRecord(_ recordID: String, review: LegacyRecoveryReview) throws {
        try checkLegacyReview(review)
        guard let record = try legacyRecoveryRecords(review).first(where: { $0.id == recordID }), record.state == "set-aside" else { throw LegacyRecoveryError.reviewRequired }
        try LegacyRecoveryJournal.record(record, owner: review.owner, state: "preserved", conflict: nil, defaults: offlineDefaults)
    }

    func recoverLegacyRecord(_ recordID: String, review: LegacyRecoveryReview, setAside: Bool) async throws {
        try checkLegacyReview(review)
        guard let record = try legacyRecoveryRecords(review).first(where: { $0.id == recordID }), record.state == "preserved" else { throw LegacyRecoveryError.reviewRequired }
        if setAside {
            try LegacyRecoveryJournal.record(record, owner: review.owner, state: "set-aside", conflict: nil, defaults: offlineDefaults)
            return
        }
        guard let resource = record.resource, let local = record.local, record.operation == "put", let itemID = record.itemID, let api, !usesLocalData else { throw LegacyRecoveryError.reviewRequired }
        let decisionsBeforeRead = try LegacyRecoveryJournal.read(offlineDefaults)
        let remote: SyncConflictValue?
        switch resource {
        case .logs: remote = try await api.fetchLogs().first { $0.id == itemID }.map { .log($0) }
        case .exercises: remote = try await api.fetchExercises().first { $0.id == itemID }.map { .exercise($0) }
        case .templates: remote = try await api.fetchTemplates().first { $0.id == itemID }.map { .template($0) }
        case .programs: remote = try await api.fetchPrograms().first { $0.id == itemID }.map { .program($0) }
        }
        try api.checkSession()
        try checkLegacyReview(review)
        guard try LegacyRecoveryJournal.read(offlineDefaults) == decisionsBeforeRead else { throw LegacyRecoveryError.reviewRequired }
        guard let remote, let remoteRevision = remote.revision, remoteRevision > 0,
              !pendingLogQueue.changes.contains(where: { resource == .logs && $0.id == itemID }),
              !pendingResourceQueue.all.contains(where: { $0.resource.conflictResource == resource && $0.id == itemID }),
              !pendingConflictQueue.all.contains(where: { $0.resource == resource && $0.itemId == itemID }) else { throw LegacyRecoveryError.reviewRequired }
        let conflict = SyncConflictItem(recoveryID: UUID().uuidString, resource: resource, operation: .put, itemId: itemID, local: local, remote: remote, expectedRevision: local.revision, actualRevision: remoteRevision, requestId: nil, createdAt: ISO8601DateFormatter().string(from: Date()))
        // The receipt and staged conflict commit together. No network write or active
        // queue adoption occurs, even if the process exits immediately after this.
        try LegacyRecoveryJournal.record(record, owner: review.owner, state: "staged", conflict: conflict, defaults: offlineDefaults)
        refreshPendingSyncCount()
    }

    func reset() {
        storeGeneration = UUID()
        isLoading = false
        syncIssueMessage = nil
        exercises = []
        templates = []
        logs = []
        gyms = []
        equipment = GymEquipment.preloaded
        programs = []
        settings = .defaults
        pendingTemplate = nil
        pendingWorkoutStart = nil
        editingLog = nil
        errorMessage = nil
        isUsingOfflineSnapshot = false
        refreshPendingSyncCount()
        stopPendingSyncRetryLoop()
    }

    func loadData() async {
        guard auth.user != nil else { reset(); return }
        let generation = storeGeneration
        isLoading = true
        errorMessage = nil
        defer {
            if generation == storeGeneration {
                isLoading = false
                refreshPendingSyncCount()
            }
        }

        if usesLocalData {
            loadDemoDataIfNeeded()
            return
        }

        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Rep, Mix, Burn production."
            return
        }

        let hadOfflineSnapshot = loadOfflineSnapshot(markOffline: false)
        do {
            try await loadCloudData(using: api)
            try api.checkSession()
        } catch WorkoutAPIError.unauthorized {
            guard (try? api.checkSession()) != nil else { return }
            auth.signOut()
            errorMessage = WorkoutAPIError.unauthorized.localizedDescription
        } catch {
            guard (try? api.checkSession()) != nil else { return }
            if isCancellationError(error) { return }
            if isNetworkAvailabilityError(error),
               (hadOfflineSnapshot || loadOfflineSnapshot(markOffline: true)) {
                isUsingOfflineSnapshot = true
                syncIssueMessage = nil
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    func saveEquipment(_ item: GymEquipment) async throws -> GymEquipment {
        guard !equipment.contains(where: { $0.id != item.id && $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == item.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }) else {
            throw WorkoutAPIError.server(400, "Equipment with that name already exists in your library.", requestID: nil, conflict: nil)
        }
        let saved: GymEquipment
        if usesLocalData { saved = item }
        else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            let received = try await api.saveEquipment(item)
            try api.checkSession()
            saved = received
        }
        equipment = (equipment.filter { $0.id != saved.id } + [saved]).sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        for gymIndex in gyms.indices {
            for itemIndex in gyms[gymIndex].equipment.indices where gyms[gymIndex].equipment[itemIndex].libraryID == saved.id {
                gyms[gymIndex].equipment[itemIndex].name = saved.name
                gyms[gymIndex].equipment[itemIndex].category = saved.category
            }
        }
        persistOfflineSnapshot()
        return saved
    }

    func deleteEquipment(_ id: String) async throws {
        guard !gyms.contains(where: { $0.equipment.contains { $0.libraryID == id } }),
              !exercises.contains(where: { $0.equipmentAlternatives?.contains { $0.equipmentId == id } == true }) else {
            throw WorkoutAPIError.server(409, "Remove this equipment from gyms and exercises before deleting it.", requestID: nil, conflict: nil)
        }
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            try await api.deleteEquipment(id)
            try api.checkSession()
        }
        equipment.removeAll { $0.id == id }
        persistOfflineSnapshot()
    }

    func saveGym(_ gym: Gym) async throws {
        guard !exercises.contains(where: { exercise in
            exercise.equipmentAlternatives?.contains { ref in ref.gymId == gym.id && !gym.equipment.contains { $0.id == ref.equipmentId } } == true
        }) else {
            throw WorkoutAPIError.server(409, "Remove exercise associations before removing equipment from this gym.", requestID: nil, conflict: nil)
        }
        let saved: Gym
        if usesLocalData { saved = gym }
        else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            let received = try await api.saveGym(gym)
            try api.checkSession()
            saved = received
        }
        gyms = (gyms.filter { $0.id != saved.id } + [saved]).sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        persistOfflineSnapshot()
    }

    func deleteGym(_ id: String) async throws {
        guard !exercises.contains(where: { $0.equipmentAlternatives?.contains { $0.gymId == id } == true }) else {
            throw WorkoutAPIError.server(409, "Remove exercise equipment associations before deleting this gym.", requestID: nil, conflict: nil)
        }
        guard !templates.contains(where: { $0.gymId == id }) else {
            throw WorkoutAPIError.server(409, "Reassign or unassign routines using this gym before deleting it.", requestID: nil, conflict: nil)
        }
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            try await api.deleteGym(id)
            try api.checkSession()
        }
        gyms.removeAll { $0.id == id }
        persistOfflineSnapshot()
    }

    func saveSettings(_ value: WorkoutSettings) async throws {
        if usesLocalData {
            settings = value
            return
        }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        let received = try await api.saveSettings(value)
        try api.checkSession()
        settings = received
        isUsingOfflineSnapshot = false
        persistOfflineSnapshot()
    }

    func deleteEquipmentSetup(exerciseID: String, setupID: String) async throws {
        guard var exercise = exercises.first(where: { $0.id == exerciseID }) else { throw WorkoutAPIError.server(404, "Exercise unavailable. Reload and try again.", requestID: nil, conflict: nil) }
        exercise.removeSetup(setupID)
        try await saveExercise(exercise)
    }

    func saveExercise(_ exercise: Exercise) async throws {
        let saved: Exercise
        if usesLocalData {
            saved = exercise
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            pendingResourceQueue.upsertExercise(exercise)
            let sentChange = pendingResourceQueue.all.first { $0.id == exercise.id && $0.resource == .exercises }!
            do {
                let received = try await api.saveExercise(exercise)
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                saved = received
                pendingResourceQueue.remove(.exercises, id: exercise.id)
                pendingConflictQueue.remove(.exercises, id: exercise.id)
            } catch {
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                if rememberConflict(resource: .exercises, operation: .put, itemId: exercise.id, local: .exercise(exercise), error: error) {
                    saved = exercise
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    saved = exercise
                }
                refreshPendingSyncCount()
            }
        }
        upsert(saved, in: &exercises)
        exercises = exercises.sortedByName()
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }

    func deleteExercise(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            pendingResourceQueue.delete(.exercises, id: id)
            let sentChange = pendingResourceQueue.all.first { $0.id == id && $0.resource == .exercises }!
            do {
                try await api.deleteExercise(id)
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                pendingResourceQueue.remove(.exercises, id: id)
            } catch {
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                guard isNetworkAvailabilityError(error) else { throw error }
            }
        }
        exercises.removeAll { $0.id == id }
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }

    func saveTemplate(_ template: WorkoutTemplate) async throws {
        let saved: WorkoutTemplate
        if usesLocalData {
            saved = template
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            pendingResourceQueue.upsertTemplate(template)
            let sentChange = pendingResourceQueue.all.first { $0.id == template.id && $0.resource == .templates }!
            do {
                let received = try await api.saveTemplate(template)
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                saved = received
                pendingResourceQueue.remove(.templates, id: template.id)
                pendingConflictQueue.remove(.templates, id: template.id)
            } catch {
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                if rememberConflict(resource: .templates, operation: .put, itemId: template.id, local: .template(template), error: error) {
                    saved = template
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    saved = template
                }
                refreshPendingSyncCount()
            }
        }
        upsert(saved, in: &templates)
        templates = templates.sortedByName()
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }

    func deleteTemplate(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            pendingResourceQueue.delete(.templates, id: id)
            let sentChange = pendingResourceQueue.all.first { $0.id == id && $0.resource == .templates }!
            do {
                try await api.deleteTemplate(id)
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                pendingResourceQueue.remove(.templates, id: id)
            } catch {
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                guard isNetworkAvailabilityError(error) else { throw error }
            }
        }
        templates.removeAll { $0.id == id }
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }

    func saveProgram(_ program: TrainingProgram) async throws {
        let saved: TrainingProgram
        if usesLocalData {
            saved = program
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            pendingResourceQueue.upsertProgram(program)
            let sentChange = pendingResourceQueue.all.first { $0.id == program.id && $0.resource == .programs }!
            do {
                let received = try await api.saveProgram(program)
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                saved = received
                pendingResourceQueue.remove(.programs, id: program.id)
                pendingConflictQueue.remove(.programs, id: program.id)
            } catch {
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                if rememberConflict(resource: .programs, operation: .put, itemId: program.id, local: .program(program), error: error) {
                    saved = program
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    saved = program
                }
                refreshPendingSyncCount()
            }
        }
        upsert(saved, in: &programs)
        programs = programs.sortedForDisplay()
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }

    func deleteProgram(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            pendingResourceQueue.delete(.programs, id: id)
            let sentChange = pendingResourceQueue.all.first { $0.id == id && $0.resource == .programs }!
            do {
                try await api.deleteProgram(id)
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                pendingResourceQueue.remove(.programs, id: id)
            } catch {
                try api.checkSession()
                guard pendingResourceQueue.all.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                guard isNetworkAvailabilityError(error) else { throw error }
            }
        }
        programs.removeAll { $0.id == id }
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }

    @discardableResult
    func saveLog(_ log: WorkoutLog) async throws -> WorkoutLog {
        let generation = storeGeneration
        let requestAPI = usesLocalData ? nil : api
        if !usesLocalData, requestAPI == nil { throw WorkoutAPIError.missingConfiguration }
        // Persist the latest intent before waiting for an older network request.
        let sentChange: PendingWorkoutLogChange?
        if requestAPI != nil {
            pendingLogQueue.upsert(log)
            sentChange = pendingLogQueue.changes.first { $0.id == log.id }
            refreshPendingSyncCount()
        } else { sentChange = nil }
        return try await logWriteQueue.perform(id: log.id) { [self] in
            guard storeGeneration == generation else { throw CancellationError() }
            return try await persistLog(log, using: requestAPI, sentChange: sentChange)
        }
    }

    private func persistLog(_ log: WorkoutLog, using api: WorkoutAPI?, sentChange: PendingWorkoutLogChange?) async throws -> WorkoutLog {
        let saved: WorkoutLog
        if let api {
            try api.checkSession()
            guard let sentChange, pendingLogQueue.changes.contains(sentChange) else { throw CancellationError() }
            do {
                let received = try await api.saveLog(log)
                try api.checkSession()
                guard pendingLogQueue.changes.contains(sentChange) else { throw CancellationError() }
                saved = received
                pendingLogQueue.remove(log.id)
                pendingConflictQueue.remove(.logs, id: log.id)
            } catch {
                try api.checkSession()
                guard pendingLogQueue.changes.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                if rememberConflict(resource: .logs, operation: .put, itemId: log.id, local: .log(log), error: error) {
                    saved = log
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    saved = log
                }
                refreshPendingSyncCount()
            }
        } else {
            saved = log
        }
        upsert(saved, in: &logs)
        persistOfflineSnapshot()
        refreshPendingSyncCount()
        return saved
    }

    func deleteLog(_ id: String) async throws {
        let generation = storeGeneration
        let requestAPI = usesLocalData ? nil : api
        if !usesLocalData, requestAPI == nil { throw WorkoutAPIError.missingConfiguration }
        let sentChange: PendingWorkoutLogChange?
        if requestAPI != nil {
            pendingLogQueue.delete(id)
            sentChange = pendingLogQueue.changes.first { $0.id == id }
            refreshPendingSyncCount()
        } else { sentChange = nil }
        try await logWriteQueue.perform(id: id) { [self] in
            guard storeGeneration == generation else { throw CancellationError() }
            try await persistLogDeletion(id, using: requestAPI, sentChange: sentChange)
        }
    }

    private func persistLogDeletion(_ id: String, using api: WorkoutAPI?, sentChange: PendingWorkoutLogChange?) async throws {
        if let api {
            try api.checkSession()
            guard let sentChange, pendingLogQueue.changes.contains(sentChange) else { throw CancellationError() }
            do {
                try await api.deleteLog(id)
                try api.checkSession()
                guard pendingLogQueue.changes.contains(sentChange) else { throw CancellationError() }
                pendingLogQueue.remove(id)
            } catch {
                try api.checkSession()
                guard pendingLogQueue.changes.contains(sentChange) else { throw CancellationError() }
                if isCancellationError(error) { throw error }
                guard isNetworkAvailabilityError(error) else { throw error }
            }
        }
        refreshPendingSyncCount()
        logs.removeAll { $0.id == id }
        persistOfflineSnapshot()
    }

    func syncPendingChanges() async {
        guard !isSyncingPending else { return }
        guard !usesLocalData else { return }
        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Rep, Mix, Burn production."
            return
        }
        isSyncingPending = true
        lastSyncAttemptAt = Date()
        syncIssueMessage = nil
        defer {
            isSyncingPending = false
            refreshPendingSyncCount()
        }
        await flushPendingChanges(using: api)
    }

    func resolveSyncConflict(_ conflict: SyncConflictItem, keeping resolution: SyncConflictResolution) async {
        guard pendingConflictQueue.all.contains(conflict) else { return }
        guard !usesLocalData else { return }
        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Rep, Mix, Burn production."
            return
        }

        do {
            try checkRecoveredConflict(conflict)
            switch resolution {
            case .remote:
                applyRemoteConflictValue(conflict)
            case .local:
                try await saveLocalConflictValue(conflict, using: api)
                try api.checkSession()
            }
            guard pendingConflictQueue.all.contains(conflict) else { throw CancellationError() }
            removePendingChange(for: conflict)
            pendingConflictQueue.remove(conflict.resource, id: conflict.itemId)
            persistOfflineSnapshot()
            refreshPendingSyncCount()
        } catch WorkoutAPIError.unauthorized {
            guard (try? api.checkSession()) != nil else { return }
            auth.signOut()
            errorMessage = WorkoutAPIError.unauthorized.localizedDescription
        } catch {
            guard (try? api.checkSession()) != nil else { return }
            syncIssueMessage = "Could not resolve sync conflict: \(error.localizedDescription)"
            errorMessage = syncIssueMessage
            refreshPendingSyncCount()
        }
    }

    func appBecameActive() {
        refreshPendingSyncCount()
        guard pendingSyncCount > 0, pendingConflictCount == 0 else { return }
        startPendingSyncRetryLoop()
        Task { await syncPendingChanges() }
    }

    func appMovedToBackground() {
        scheduleBackgroundSyncIfNeeded()
    }

    func scheduleBackgroundSyncIfNeeded() {
        BackgroundSyncScheduler.scheduleIfNeeded(
            pendingSyncCount: pendingSyncCount,
            pendingConflictCount: pendingConflictCount
        )
    }

    func performBackgroundSync() async -> Bool {
        guard pendingSyncCount > 0, pendingConflictCount == 0 else { return true }
        await syncPendingChanges()
        scheduleBackgroundSyncIfNeeded()
        return pendingConflictCount == 0 && syncIssueMessage == nil
    }

    func submitFeedback(_ message: String) async throws {
        guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if usesLocalData { return }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        try await api.submitFeedback(message: message, build: AppConfiguration.buildLabel)
        try api.checkSession()
    }

    func exportData() async throws -> Data {
        if usesLocalData {
            return try JSONEncoder().encode(RepMixBurnExportPayload(
                exportedAt: ISO8601DateFormatter().string(from: Date()),
                exercises: exercises,
                templates: templates,
                logs: logs,
                programs: programs,
                gyms: gyms,
                equipment: equipment,
                settings: settings
            ))
        }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        return try await api.exportData()
    }

    private var hasEditedEquipment: Bool {
        equipment.contains { item in
            !GymEquipment.preloaded.contains { $0.id == item.id && $0.name == item.name && $0.category == item.category && $0.details == item.details }
        }
    }

    func previewImport(_ payload: RepMixBurnExportPayload) -> RepMixBurnImportPreview {
        let importedExercises = payload.exercises ?? []
        let importedTemplates = payload.templates ?? []
        let importedLogs = payload.logs ?? []
        let importedPrograms = payload.programs ?? []
        let importedGyms = payload.gyms ?? []
        let importedEquipment = payload.equipment ?? []
        let existingExerciseIds = Set(exercises.map(\.id))
        let existingTemplateIds = Set(templates.map(\.id))
        let existingLogIds = Set(logs.map(\.id))
        let existingProgramIds = Set(programs.map(\.id))
        return RepMixBurnImportPreview(
            counts: .init(
                exercises: importedExercises.count,
                templates: importedTemplates.count,
                logs: importedLogs.count,
                programs: importedPrograms.count,
                gyms: importedGyms.count,
                equipment: importedEquipment.count,
                settings: payload.settings == nil ? 0 : 1
            ),
            duplicateIds: .init(
                exercises: importedExercises.filter { existingExerciseIds.contains($0.id) }.count,
                templates: importedTemplates.filter { existingTemplateIds.contains($0.id) }.count,
                logs: importedLogs.filter { existingLogIds.contains($0.id) }.count,
                programs: importedPrograms.filter { existingProgramIds.contains($0.id) }.count,
                gyms: importedGyms.filter { gym in gyms.contains { $0.id == gym.id } }.count,
                equipment: importedEquipment.filter { entry in equipment.contains { $0.id == entry.id } }.count
            ),
            isEmpty: importedExercises.isEmpty && importedTemplates.isEmpty && importedLogs.isEmpty && importedPrograms.isEmpty && importedGyms.isEmpty && importedEquipment.isEmpty,
            targetIsEmpty: exercises.isEmpty && templates.isEmpty && logs.isEmpty && programs.isEmpty && gyms.isEmpty && !hasEditedEquipment
        )
    }

    func importData(_ payload: RepMixBurnExportPayload, mode: RepMixBurnImportMode) async throws -> RepMixBurnImportResult {
        if usesLocalData {
            return try importLocalData(payload, mode: mode)
        }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        let result = try await api.importData(payload, mode: mode)
        try api.checkSession()
        await loadData()
        try api.checkSession()
        return result
    }

    private func importLocalData(_ payload: RepMixBurnExportPayload, mode: RepMixBurnImportMode) throws -> RepMixBurnImportResult {
        let incomingExercises = payload.exercises ?? []
        let incomingTemplates = payload.templates ?? []
        let incomingLogs = payload.logs ?? []
        let incomingPrograms = payload.programs ?? []
        let incomingGyms = payload.gyms ?? []
        let incomingEquipment = payload.equipment ?? []
        if mode == .emptyOnly && (!exercises.isEmpty || !templates.isEmpty || !logs.isEmpty || !programs.isEmpty || !gyms.isEmpty || hasEditedEquipment) {
            throw WorkoutAPIError.server(409, "Import can only restore into an empty account.", requestID: nil, conflict: nil)
        }

        if mode == .emptyOnly {
            exercises = incomingExercises.sortedByName()
            templates = incomingTemplates.sortedByName()
            logs = incomingLogs
            programs = incomingPrograms.sortedForDisplay()
            gyms = incomingGyms
            equipment = incomingEquipment.isEmpty ? GymEquipment.preloaded : incomingEquipment
            if let importedSettings = payload.settings { settings = importedSettings }
            return RepMixBurnImportResult(
                imported: .init(
                    exercises: incomingExercises.count,
                    templates: incomingTemplates.count,
                    logs: incomingLogs.count,
                    programs: incomingPrograms.count,
                    gyms: incomingGyms.count,
                    equipment: incomingEquipment.count,
                    settings: payload.settings != nil
                ),
                renamed: .init(exercises: [], templates: [], logs: [], programs: []),
                skipped: .init(exercises: [], templates: [], logs: [], programs: [])
            )
        }

        let existingExerciseIds = Set(exercises.map(\.id))
        let existingTemplateIds = Set(templates.map(\.id))
        let existingLogIds = Set(logs.map(\.id))
        let existingProgramIds = Set(programs.map(\.id))
        var skippedExercises: [RepMixBurnSkippedExercise] = []
        var skippedTemplates: [RepMixBurnSkippedExercise] = []
        var skippedLogs: [RepMixBurnSkippedLog] = []
        var skippedPrograms: [RepMixBurnSkippedExercise] = []
        var renamedExercises: [RepMixBurnImportRename] = []
        var renamedTemplates: [RepMixBurnImportRename] = []
        var renamedLogs: [RepMixBurnImportRename] = []
        var renamedPrograms: [RepMixBurnImportRename] = []
        var exerciseNames = Set(exercises.map { nameKey($0.name) })
        var templateNames = Set(templates.map { nameKey($0.name) })
        var logNamesByDate = Set(logs.map { "\($0.date)|\(nameKey($0.name))" })
        var programNames = Set(programs.map { nameKey($0.name) })

        let newExercises: [Exercise] = incomingExercises.compactMap { exercise in
            if existingExerciseIds.contains(exercise.id) {
                skippedExercises.append(.init(id: exercise.id, name: exercise.name))
                return nil
            }
            var next = exercise
            next.name = uniqueImportedName(next.name, existingNames: &exerciseNames, renamed: &renamedExercises)
            return next
        }

        let newTemplates: [WorkoutTemplate] = incomingTemplates.compactMap { template in
            if existingTemplateIds.contains(template.id) {
                skippedTemplates.append(.init(id: template.id, name: template.name))
                return nil
            }
            var next = template
            next.name = uniqueImportedName(next.name, existingNames: &templateNames, renamed: &renamedTemplates)
            return next
        }

        let newLogs: [WorkoutLog] = incomingLogs.compactMap { log in
            if existingLogIds.contains(log.id) {
                skippedLogs.append(.init(id: log.id, name: log.name, date: log.date))
                return nil
            }
            let key = "\(log.date)|\(nameKey(log.name))"
            guard logNamesByDate.contains(key) else {
                logNamesByDate.insert(key)
                return log
            }
            var namesForDate = Set(logNamesByDate
                .filter { $0.hasPrefix("\(log.date)|") }
                .map { String($0.dropFirst(log.date.count + 1)) })
            var next = log
            next.name = uniqueImportedName(next.name.isEmpty ? "Imported workout" : next.name, existingNames: &namesForDate, renamed: &renamedLogs)
            logNamesByDate.insert("\(next.date)|\(nameKey(next.name))")
            return next
        }

        let newPrograms: [TrainingProgram] = incomingPrograms.compactMap { program in
            if existingProgramIds.contains(program.id) {
                skippedPrograms.append(.init(id: program.id, name: program.name))
                return nil
            }
            var next = program
            next.name = uniqueImportedName(next.name, existingNames: &programNames, renamed: &renamedPrograms)
            return next
        }

        var gymIds = Set(gyms.map(\.id))
        var gymNames = Set(gyms.map { nameKey($0.name) })
        var renamedGyms: [RepMixBurnImportRename] = []
        var skippedGyms: [RepMixBurnSkippedExercise] = []
        let newGyms: [Gym] = incomingGyms.compactMap { gym in
            guard gymIds.insert(gym.id).inserted else {
                skippedGyms.append(.init(id: gym.id, name: gym.name))
                return nil
            }
            var next = gym
            next.name = uniqueImportedName(next.name, existingNames: &gymNames, renamed: &renamedGyms)
            return next
        }
        gyms += newGyms
        let newEquipment = incomingEquipment.filter { entry in !equipment.contains { $0.id == entry.id } }
        equipment += newEquipment
        exercises = (exercises + newExercises).sortedByName()
        templates = (templates + newTemplates).sortedByName()
        logs += newLogs
        programs = (programs + newPrograms).sortedForDisplay()
        if let importedSettings = payload.settings { settings = importedSettings }

        return RepMixBurnImportResult(
            imported: .init(
                exercises: newExercises.count,
                templates: newTemplates.count,
                logs: newLogs.count,
                programs: newPrograms.count,
                gyms: newGyms.count,
                equipment: newEquipment.count,
                settings: payload.settings != nil
            ),
            renamed: .init(exercises: renamedExercises, templates: renamedTemplates, logs: renamedLogs, programs: renamedPrograms, gyms: renamedGyms),
            skipped: .init(exercises: skippedExercises, templates: skippedTemplates, logs: skippedLogs, programs: skippedPrograms, gyms: skippedGyms)
        )
    }

    func deleteAccount() async throws -> Bool {
        var appleRevocationRequired = false
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            appleRevocationRequired = try await api.deleteAccount()
            try api.checkSession()
        }
        pendingLogQueue.clear()
        pendingResourceQueue.clear()
        pendingConflictQueue.clear()
        snapshotStore.clear()
        auth.invalidateSessionWork()
        reset()
        return appleRevocationRequired
    }

    func activeWorkout() -> WorkoutLog? {
        // Pending intent wins while the save is still in flight.
        mergePendingLogs(logs).first { $0.status == "active" || $0.status == "planning" }
    }

    func exercise(id: String) -> Exercise? {
        exercises.first { $0.id == id }
    }

    func setStartTemplate(_ template: WorkoutTemplate, program: TrainingProgram? = nil) {
        pendingWorkoutStart = PendingWorkoutStart(template: template, program: program)
        pendingTemplate = nil
    }

    func setEditingLog(_ log: WorkoutLog) {
        editingLog = log
    }

    private func loadDemoDataIfNeeded() {
        guard exercises.isEmpty, templates.isEmpty, logs.isEmpty, programs.isEmpty else { return }
        let bench = Exercise(name: "Bench Press", muscleGroup: "Chest", notes: "Pause first rep", personalBest: PersonalBest(weight: "225", date: DateHelpers.todayString(), reps: "5"))
        let row = Exercise(name: "Barbell Row", muscleGroup: "Back")
        let press = Exercise(name: "Overhead Press", muscleGroup: "Shoulders")
        let squat = Exercise(name: "Back Squat", muscleGroup: "Quads", personalBest: PersonalBest(weight: "315", date: DateHelpers.todayString(), reps: "3"))
        exercises = [bench, row, press, squat].sortedByName()
        templates = [
            WorkoutTemplate(
                name: "Push Day",
                description: "Chest, shoulders, and triceps",
                exerciseItems: [
                    ExerciseItem(exerciseId: bench.id, sets: defaultSets()),
                    ExerciseItem(exerciseId: press.id, sets: defaultSets()),
                ]
            ),
            WorkoutTemplate(
                name: "Heavy Legs",
                description: "Squat-focused day",
                exerciseItems: [
                    ExerciseItem(exerciseId: squat.id, sets: defaultSets(reps: "5")),
                ]
            ),
        ].sortedByName()
        programs = [
            TrainingProgram(
                name: "Starter Week",
                description: "Push, legs, and repeatable practice days",
                schedule: [
                    ProgramScheduleItem(templateId: templates[0].id),
                    ProgramScheduleItem(templateId: templates[1].id),
                    ProgramScheduleItem(templateId: templates[0].id),
                ],
                startDate: DateHelpers.todayString(),
                active: true,
                progressionRule: "Add reps or weight when every set hits the target."
            )
        ]
    }

    private func defaultSets(reps: String? = nil) -> [WorkoutSet] {
        Array(repeating: WorkoutSet(reps: reps ?? String(settings.defaultReps), weight: ""), count: settings.defaultSets)
    }

    private func upsert<T: Identifiable>(_ item: T, in list: inout [T]) where T.ID == String {
        if let index = list.firstIndex(where: { $0.id == item.id }) {
            list[index] = item
        } else {
            list.append(item)
        }
    }

    private func refreshPendingSyncCount() {
        syncConflicts = pendingConflictQueue.all
        pendingSyncCount = pendingLogQueue.count + pendingResourceQueue.count
        pendingConflictCount = syncConflicts.count
        if usesLocalData {
            stopPendingSyncRetryLoop()
            return
        }
        if pendingConflictCount > 0 {
            stopPendingSyncRetryLoop()
            return
        }
        if pendingSyncCount > 0 {
            startPendingSyncRetryLoop()
        } else {
            syncIssueMessage = nil
            stopPendingSyncRetryLoop()
        }
    }

    private func startPendingSyncRetryLoop() {
        guard pendingRetryTask == nil else { return }
        pendingRetryTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30 * 1_000_000_000)
                guard !Task.isCancelled else { return }
                await self?.syncPendingChanges()
            }
        }
    }

    private func stopPendingSyncRetryLoop() {
        pendingRetryTask?.cancel()
        pendingRetryTask = nil
    }

    private func loadCloudData(using api: WorkoutAPI) async throws {
        var loadedSections = 0
        var failures: [String] = []
        var firstError: Error?
        isUsingOfflineSnapshot = false

        do {
            let received = try await api.fetchEquipment()
            try api.checkSession()
            equipment = received
            loadedSections += 1
        } catch {
            try api.checkSession()
            try recordLoadFailure(error, label: "equipment library", failures: &failures, firstError: &firstError)
        }

        do {
            let received = mergePendingExercises(try await api.fetchExercises()).sortedByName()
            try api.checkSession()
            exercises = received
            loadedSections += 1
        } catch {
            try api.checkSession()
            try recordLoadFailure(error, label: "exercise library", failures: &failures, firstError: &firstError)
        }

        do {
            let received = mergePendingTemplates(try await api.fetchTemplates()).sortedByName()
            try api.checkSession()
            templates = received
            loadedSections += 1
        } catch {
            try api.checkSession()
            try recordLoadFailure(error, label: "routines", failures: &failures, firstError: &firstError)
        }

        do {
            let received = mergePendingLogs(try await api.fetchLogs())
            try api.checkSession()
            logs = received
            loadedSections += 1
        } catch {
            try api.checkSession()
            try recordLoadFailure(error, label: "workout history", failures: &failures, firstError: &firstError)
        }

        do {
            let received = mergePendingPrograms(try await api.fetchPrograms()).sortedForDisplay()
            try api.checkSession()
            programs = received
            loadedSections += 1
        } catch {
            try api.checkSession()
            try recordLoadFailure(error, label: "programs", failures: &failures, firstError: &firstError)
        }

        do {
            let received = try await api.fetchGyms().sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            try api.checkSession()
            gyms = received
            loadedSections += 1
        } catch {
            try api.checkSession()
            try recordLoadFailure(error, label: "gyms", failures: &failures, firstError: &firstError)
        }

        do {
            let received = try await api.fetchSettings()
            try api.checkSession()
            settings = received
            loadedSections += 1
        } catch {
            try api.checkSession()
            try recordLoadFailure(error, label: "settings", failures: &failures, firstError: &firstError)
        }

        guard loadedSections > 0 else {
            throw firstError ?? WorkoutAPIError.invalidResponse
        }

        if failures.isEmpty {
            errorMessage = nil
        } else {
            errorMessage = "Some data could not load: \(failures.joined(separator: ", ")). Pull to retry."
        }
        refreshPendingSyncCount()
        persistOfflineSnapshot()
        await flushPendingChanges(using: api)
        try api.checkSession()
        persistOfflineSnapshot()
    }

    @discardableResult
    private func loadOfflineSnapshot(markOffline: Bool) -> Bool {
        guard let snapshot = snapshotStore.load(for: auth.user?.sub) else { return false }
        exercises = mergePendingExercises(snapshot.exercises).sortedByName()
        templates = mergePendingTemplates(snapshot.templates).sortedByName()
        logs = mergePendingLogs(snapshot.logs)
        programs = mergePendingPrograms(snapshot.programs).sortedForDisplay()
        gyms = snapshot.gyms ?? []
        equipment = snapshot.equipment ?? GymEquipment.preloaded
        settings = snapshot.settings
        isUsingOfflineSnapshot = markOffline
        refreshPendingSyncCount()
        return true
    }

    private func persistOfflineSnapshot() {
        guard !usesLocalData, let userID = auth.user?.sub else { return }
        snapshotStore.save(.init(
            userID: userID,
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            exercises: exercises,
            templates: templates,
            logs: logs,
            programs: programs,
            gyms: gyms,
            equipment: equipment,
            settings: settings
        ))
    }

    private func recordLoadFailure(
        _ error: Error,
        label: String,
        failures: inout [String],
        firstError: inout Error?
    ) throws {
        if isCancellationError(error) {
            throw error
        }
        if case WorkoutAPIError.unauthorized = error {
            throw error
        }
        if firstError == nil {
            firstError = error
        }
        failures.append("\(label) (\(error.localizedDescription))")
    }

    private func rememberConflict(_ change: PendingResourceChange, error: Error) -> Bool {
        let local: SyncConflictValue?
        switch change.resource {
        case .exercises:
            local = change.exercise.map { .exercise($0) }
        case .templates:
            local = change.template.map { .template($0) }
        case .programs:
            local = change.program.map { .program($0) }
        }
        return rememberConflict(
            resource: change.resource.conflictResource,
            operation: change.operation.conflictOperation,
            itemId: change.id,
            local: local,
            error: error
        )
    }

    private func rememberConflict(_ change: PendingWorkoutLogChange, error: Error) -> Bool {
        rememberConflict(
            resource: .logs,
            operation: change.operation.conflictOperation,
            itemId: change.id,
            local: change.log.map { .log($0) },
            error: error
        )
    }

    private func rememberConflict(
        resource: SyncConflictResource,
        operation: SyncConflictOperation,
        itemId: String,
        local: SyncConflictValue?,
        error: Error
    ) -> Bool {
        guard let apiError = error as? WorkoutAPIError, let conflict = apiError.conflict else { return false }
        let item = SyncConflictItem(
            resource: resource,
            operation: operation,
            itemId: itemId,
            local: local,
            remote: remoteConflictValue(resource: resource, data: conflict.remoteData),
            expectedRevision: conflict.expectedRevision,
            actualRevision: conflict.actualRevision,
            requestId: apiError.requestID,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        pendingConflictQueue.upsert(item)
        syncIssueMessage = "\(resource.label) changed in the cloud. Review sync conflicts."
        return true
    }

    private func remoteConflictValue(resource: SyncConflictResource, data: Data?) -> SyncConflictValue? {
        guard let data else { return nil }
        let decoder = JSONDecoder()
        switch resource {
        case .exercises:
            return (try? decoder.decode(Exercise.self, from: data)).map { .exercise($0) }
        case .templates:
            return (try? decoder.decode(WorkoutTemplate.self, from: data)).map { .template($0) }
        case .logs:
            return (try? decoder.decode(WorkoutLog.self, from: data)).map { .log($0) }
        case .programs:
            return (try? decoder.decode(TrainingProgram.self, from: data)).map { .program($0) }
        }
    }

    private func checkRecoveredConflict(_ conflict: SyncConflictItem) throws {
        guard conflict.recoveryID != nil else { return }
        guard let revision = conflict.remote?.revision, revision > 0 else { throw LegacyRecoveryError.reviewRequired }
        guard pendingConflictQueue.all.contains(conflict),
              !pendingLogQueue.changes.contains(where: { conflict.resource == .logs && $0.id == conflict.itemId }),
              !pendingResourceQueue.all.contains(where: { $0.resource.conflictResource == conflict.resource && $0.id == conflict.itemId }) else { throw LegacyRecoveryError.reviewRequired }
    }

    private func saveLocalConflictValue(_ conflict: SyncConflictItem, using api: WorkoutAPI) async throws {
        try checkRecoveredConflict(conflict)
        let expectedRevision = conflict.remote?.revision ?? conflict.actualRevision
        switch conflict.resource {
        case .exercises:
            guard var exercise = conflict.local?.exercise else { return }
            exercise.revision = expectedRevision
            let saved = try await api.saveExercise(exercise)
            try api.checkSession()
            try checkRecoveredConflict(conflict)
            upsert(saved, in: &exercises)
            exercises = exercises.sortedByName()
        case .templates:
            guard var template = conflict.local?.template else { return }
            template.revision = expectedRevision
            let saved = try await api.saveTemplate(template)
            try api.checkSession()
            try checkRecoveredConflict(conflict)
            upsert(saved, in: &templates)
            templates = templates.sortedByName()
        case .logs:
            guard var log = conflict.local?.log else { return }
            log.revision = expectedRevision
            let value = log
            try await logWriteQueue.perform(id: log.id) { [self] in
                try api.checkSession()
            try checkRecoveredConflict(conflict)
                let saved = try await api.saveLog(value)
                try api.checkSession()
            try checkRecoveredConflict(conflict)
                upsert(saved, in: &logs)
            }
        case .programs:
            guard var program = conflict.local?.program else { return }
            program.revision = expectedRevision
            let saved = try await api.saveProgram(program)
            try api.checkSession()
            try checkRecoveredConflict(conflict)
            upsert(saved, in: &programs)
            programs = programs.sortedForDisplay()
        }
    }

    private func applyRemoteConflictValue(_ conflict: SyncConflictItem) {
        switch conflict.resource {
        case .exercises:
            if let exercise = conflict.remote?.exercise {
                upsert(exercise, in: &exercises)
                exercises = exercises.sortedByName()
            } else {
                exercises.removeAll { $0.id == conflict.itemId }
            }
        case .templates:
            if let template = conflict.remote?.template {
                upsert(template, in: &templates)
                templates = templates.sortedByName()
            } else {
                templates.removeAll { $0.id == conflict.itemId }
            }
        case .logs:
            if let log = conflict.remote?.log {
                upsert(log, in: &logs)
            } else {
                logs.removeAll { $0.id == conflict.itemId }
            }
        case .programs:
            if let program = conflict.remote?.program {
                upsert(program, in: &programs)
                programs = programs.sortedForDisplay()
            } else {
                programs.removeAll { $0.id == conflict.itemId }
            }
        }
    }

    private func removePendingChange(for conflict: SyncConflictItem) {
        if conflict.resource == .logs {
            pendingLogQueue.remove(conflict.itemId)
        } else if let resource = PendingResourceKind(conflict.resource) {
            pendingResourceQueue.remove(resource, id: conflict.itemId)
        }
    }

    private func mergePendingExercises(_ cloudExercises: [Exercise]) -> [Exercise] {
        var merged = Dictionary(uniqueKeysWithValues: cloudExercises.map { ($0.id, $0) })
        for pending in pendingResourceQueue.all where pending.resource == .exercises {
            if pending.operation == .delete {
                merged.removeValue(forKey: pending.id)
            } else if let exercise = pending.exercise {
                merged[pending.id] = exercise
            }
        }
        return Array(merged.values)
    }

    private func mergePendingTemplates(_ cloudTemplates: [WorkoutTemplate]) -> [WorkoutTemplate] {
        var merged = Dictionary(uniqueKeysWithValues: cloudTemplates.map { ($0.id, $0) })
        for pending in pendingResourceQueue.all where pending.resource == .templates {
            if pending.operation == .delete {
                merged.removeValue(forKey: pending.id)
            } else if let template = pending.template {
                merged[pending.id] = template
            }
        }
        return Array(merged.values)
    }

    private func mergePendingPrograms(_ cloudPrograms: [TrainingProgram]) -> [TrainingProgram] {
        var merged = Dictionary(uniqueKeysWithValues: cloudPrograms.map { ($0.id, $0) })
        for pending in pendingResourceQueue.all where pending.resource == .programs {
            if pending.operation == .delete {
                merged.removeValue(forKey: pending.id)
            } else if let program = pending.program {
                merged[pending.id] = program
            }
        }
        return Array(merged.values)
    }

    private func mergePendingLogs(_ cloudLogs: [WorkoutLog]) -> [WorkoutLog] {
        var merged = Dictionary(uniqueKeysWithValues: cloudLogs.map { ($0.id, $0) })
        for pending in pendingLogQueue.changes {
            if pending.operation == .delete {
                merged.removeValue(forKey: pending.id)
            } else if let log = pending.log {
                merged[pending.id] = log
            }
        }
        return Array(merged.values)
    }

    private func flushPendingChanges(using api: WorkoutAPI) async {
        guard !isFlushingPendingChanges else { return }
        isFlushingPendingChanges = true
        defer { isFlushingPendingChanges = false }
        guard (try? api.checkSession()) != nil else { return }
        await flushPendingResources(using: api)
        guard (try? api.checkSession()) != nil else { return }
        await flushPendingLogs(using: api)
    }

    private func flushPendingResources(using api: WorkoutAPI) async {
        let pending = pendingResourceQueue.all
        guard !pending.isEmpty else {
            refreshPendingSyncCount()
            return
        }

        for change in pending {
            guard (try? api.checkSession()) != nil else { return }
            guard pendingResourceQueue.all.contains(change) else { continue }
            do {
                switch (change.resource, change.operation) {
                case (.exercises, .delete):
                    try await api.deleteExercise(change.id)
                    try api.checkSession()
                    guard pendingResourceQueue.all.contains(change) else { continue }
                    exercises.removeAll { $0.id == change.id }
                case (.exercises, .put):
                    guard let exercise = change.exercise else { break }
                    let saved = try await api.saveExercise(exercise)
                    try api.checkSession()
                    guard pendingResourceQueue.all.contains(change) else { continue }
                    upsert(saved, in: &exercises)
                    pendingConflictQueue.remove(.exercises, id: change.id)
                case (.templates, .delete):
                    try await api.deleteTemplate(change.id)
                    try api.checkSession()
                    guard pendingResourceQueue.all.contains(change) else { continue }
                    templates.removeAll { $0.id == change.id }
                case (.templates, .put):
                    guard let template = change.template else { break }
                    let saved = try await api.saveTemplate(template)
                    try api.checkSession()
                    guard pendingResourceQueue.all.contains(change) else { continue }
                    upsert(saved, in: &templates)
                    pendingConflictQueue.remove(.templates, id: change.id)
                case (.programs, .delete):
                    try await api.deleteProgram(change.id)
                    try api.checkSession()
                    guard pendingResourceQueue.all.contains(change) else { continue }
                    programs.removeAll { $0.id == change.id }
                case (.programs, .put):
                    guard let program = change.program else { break }
                    let saved = try await api.saveProgram(program)
                    try api.checkSession()
                    guard pendingResourceQueue.all.contains(change) else { continue }
                    upsert(saved, in: &programs)
                    pendingConflictQueue.remove(.programs, id: change.id)
                }
                pendingResourceQueue.remove(change.resource, id: change.id)
            } catch WorkoutAPIError.unauthorized {
                guard (try? api.checkSession()) != nil else { return }
                auth.signOut()
                errorMessage = WorkoutAPIError.unauthorized.localizedDescription
                break
            } catch {
                guard (try? api.checkSession()) != nil else { return }
                if isCancellationError(error) { return }
                guard pendingResourceQueue.all.contains(change) else { continue }
                if rememberConflict(change, error: error) {
                    syncIssueMessage = "A pending library change changed in the cloud. Review sync conflicts."
                } else if !isNetworkAvailabilityError(error) {
                    syncIssueMessage = "A pending library change could not sync: \(error.localizedDescription)"
                    errorMessage = syncIssueMessage
                }
                break
            }
        }
        exercises = exercises.sortedByName()
        templates = templates.sortedByName()
        programs = programs.sortedForDisplay()
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }

    private func flushPendingLogs(using api: WorkoutAPI) async {
        let pending = pendingLogQueue.changes
        guard !pending.isEmpty else {
            refreshPendingSyncCount()
            return
        }

        for change in pending {
            guard (try? api.checkSession()) != nil else { return }
            guard pendingLogQueue.changes.contains(change) else { continue }
            do {
                try await logWriteQueue.perform(id: change.id) { [self] in
                    try api.checkSession()
                    guard pendingLogQueue.changes.contains(change) else { return }
                    if change.operation == .delete {
                        try await api.deleteLog(change.id)
                        try api.checkSession()
                        guard pendingLogQueue.changes.contains(change) else { return }
                        logs.removeAll { $0.id == change.id }
                    } else if let log = change.log {
                        let saved = try await api.saveLog(log)
                        try api.checkSession()
                        guard pendingLogQueue.changes.contains(change) else { return }
                        upsert(saved, in: &logs)
                        pendingConflictQueue.remove(.logs, id: change.id)
                    }
                    pendingLogQueue.remove(change.id)
                }
            } catch WorkoutAPIError.unauthorized {
                guard (try? api.checkSession()) != nil else { return }
                auth.signOut()
                errorMessage = WorkoutAPIError.unauthorized.localizedDescription
                break
            } catch {
                guard (try? api.checkSession()) != nil else { return }
                if isCancellationError(error) { return }
                guard pendingLogQueue.changes.contains(change) else { continue }
                if rememberConflict(change, error: error) {
                    syncIssueMessage = "A pending workout changed in the cloud. Review sync conflicts."
                } else if !isNetworkAvailabilityError(error) {
                    syncIssueMessage = "A pending workout could not sync: \(error.localizedDescription)"
                    errorMessage = syncIssueMessage
                }
                break
            }
        }
        persistOfflineSnapshot()
        refreshPendingSyncCount()
    }
}

private extension WorkoutStore {
    static let syncAttemptFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter
    }()
}

private struct OfflineDataSnapshot: Codable {
    var userID: String
    var capturedAt: String
    var exercises: [Exercise]
    var templates: [WorkoutTemplate]
    var logs: [WorkoutLog]
    var programs: [TrainingProgram]
    var gyms: [Gym]?
    var equipment: [GymEquipment]? = nil
    var settings: WorkoutSettings
}

private struct OfflineDataSnapshotStore {
    let ownerID: String?
    let directory: URL?
    private var folderURL: URL {
        directory ?? (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory).appendingPathComponent("Forge", isDirectory: true)
    }
    private var fileURL: URL {
        folderURL.appendingPathComponent(AccountOfflineKey.key("offline-data-snapshot.v2", ownerID: ownerID) + ".json")
    }
    func load(for userID: String?) -> OfflineDataSnapshot? {
        guard let userID, userID == ownerID else { return nil }
        for url in [fileURL, folderURL.appendingPathComponent("offline-data-snapshot.json")] {
            if let data = try? Data(contentsOf: url),
               let snapshot = try? JSONDecoder().decode(OfflineDataSnapshot.self, from: data),
               snapshot.userID == userID { return snapshot }
        }
        return nil
    }
    func save(_ snapshot: OfflineDataSnapshot) {
        guard snapshot.userID == ownerID else { return }
        do {
            try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
            try JSONEncoder().encode(snapshot).write(to: fileURL, options: [.atomic])
        } catch { /* Pending writes remain durable in the separate account queue. */ }
    }
    func clear() {
        guard let ownerID else { return }
        try? FileManager.default.removeItem(at: fileURL)
        let legacy = folderURL.appendingPathComponent("offline-data-snapshot.json")
        if let data = try? Data(contentsOf: legacy),
           let snapshot = try? JSONDecoder().decode(OfflineDataSnapshot.self, from: data), snapshot.userID == ownerID {
            try? FileManager.default.removeItem(at: legacy)
        }
    }
}

private enum AccountOfflineKey {
    static func key(_ prefix: String, ownerID: String?) -> String {
        // Hex UTF-8 is injective, filesystem-safe and never uses profile emails.
        let suffix = ownerID.map { Data($0.utf8).map { String(format: "%02x", $0) }.joined() } ?? "signed-out"
        return prefix + "." + suffix
    }
}

private enum PendingResourceKind: String, Codable {
    case exercises
    case templates
    case programs

    init?(_ conflictResource: SyncConflictResource) {
        switch conflictResource {
        case .exercises:
            self = .exercises
        case .templates:
            self = .templates
        case .programs:
            self = .programs
        case .logs:
            return nil
        }
    }

    var conflictResource: SyncConflictResource {
        switch self {
        case .exercises: return .exercises
        case .templates: return .templates
        case .programs: return .programs
        }
    }
}

private enum PendingResourceOperation: String, Codable {
    case put
    case delete

    var conflictOperation: SyncConflictOperation {
        switch self {
        case .put: return .put
        case .delete: return .delete
        }
    }
}

private struct PendingResourceChange: Codable, Identifiable, Equatable {
    var changeID: UUID = UUID()
    var resource: PendingResourceKind
    var operation: PendingResourceOperation
    var id: String
    var exercise: Exercise?
    var template: WorkoutTemplate?
    var program: TrainingProgram?
}

private struct PendingWorkoutLogChange: Codable, Identifiable, Equatable {
    var changeID: UUID = UUID()
    var operation: PendingResourceOperation
    var id: String
    var log: WorkoutLog?
}

private struct PendingResourceQueue {
    let ownerID: String?
    let defaults: UserDefaults
    private var key: String { AccountOfflineKey.key("forge.pendingResourceChanges.v2", ownerID: ownerID) }

    var all: [PendingResourceChange] {
        guard ownerID != nil, let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([PendingResourceChange].self, from: data)) ?? []
    }

    var count: Int {
        all.count
    }

    func upsertExercise(_ exercise: Exercise) {
        upsert(.init(resource: .exercises, operation: .put, id: exercise.id, exercise: exercise, template: nil, program: nil))
    }

    func upsertTemplate(_ template: WorkoutTemplate) {
        upsert(.init(resource: .templates, operation: .put, id: template.id, exercise: nil, template: template, program: nil))
    }

    func upsertProgram(_ program: TrainingProgram) {
        upsert(.init(resource: .programs, operation: .put, id: program.id, exercise: nil, template: nil, program: program))
    }

    func delete(_ resource: PendingResourceKind, id: String) {
        upsert(.init(resource: resource, operation: .delete, id: id, exercise: nil, template: nil, program: nil))
    }

    func remove(_ resource: PendingResourceKind, id: String) {
        save(all.filter { !($0.resource == resource && $0.id == id) })
    }

    func clear() {
        guard ownerID != nil else { return }
        defaults.removeObject(forKey: key)
    }

    private func upsert(_ change: PendingResourceChange) {
        var changes = all.filter { !($0.resource == change.resource && $0.id == change.id) }
        changes.append(change)
        save(changes)
    }

    private func save(_ changes: [PendingResourceChange]) {
        guard ownerID != nil else { return }
        guard !changes.isEmpty else {
            clear()
            return
        }
        if let data = try? JSONEncoder().encode(changes) {
            defaults.set(data, forKey: key)
        }
    }
}

private struct PendingWorkoutLogQueue {
    let ownerID: String?
    let defaults: UserDefaults
    private var key: String { AccountOfflineKey.key("forge.pendingWorkoutLogSaves.v2", ownerID: ownerID) }

    var changes: [PendingWorkoutLogChange] {
        guard ownerID != nil, let data = defaults.data(forKey: key) else { return [] }
        if let changes = try? JSONDecoder().decode([PendingWorkoutLogChange].self, from: data) {
            return changes
        }
        let legacyLogs = (try? JSONDecoder().decode([WorkoutLog].self, from: data)) ?? []
        return legacyLogs.map { .init(operation: .put, id: $0.id, log: $0) }
    }

    var count: Int {
        changes.count
    }

    func upsert(_ log: WorkoutLog) {
        var next = changes.filter { $0.id != log.id }
        next.append(.init(operation: .put, id: log.id, log: log))
        save(next)
    }

    func delete(_ id: String) {
        var next = changes.filter { $0.id != id }
        next.append(.init(operation: .delete, id: id, log: nil))
        save(next)
    }

    func remove(_ id: String) {
        save(changes.filter { $0.id != id })
    }

    func clear() {
        guard ownerID != nil else { return }
        defaults.removeObject(forKey: key)
    }

    private func save(_ changes: [PendingWorkoutLogChange]) {
        guard ownerID != nil else { return }
        guard !changes.isEmpty else {
            clear()
            return
        }
        if let data = try? JSONEncoder().encode(changes) {
            defaults.set(data, forKey: key)
        }
    }
}

private struct PendingSyncConflictQueue {
    let ownerID: String?
    let defaults: UserDefaults
    private var key: String { AccountOfflineKey.key("forge.pendingConflicts.v2", ownerID: ownerID) }

    var all: [SyncConflictItem] {
        guard let ownerID else { return [] }
        let ordinary = defaults.data(forKey: key).flatMap { try? JSONDecoder().decode([SyncConflictItem].self, from: $0) } ?? []
        let recovered = (try? LegacyRecoveryJournal.read(defaults))?.filter { $0.owner == ownerID && $0.state == "staged" }.compactMap(\.conflict) ?? []
        return (ordinary + recovered).sorted { $0.createdAt > $1.createdAt }
    }

    var count: Int {
        all.count
    }

    func upsert(_ conflict: SyncConflictItem) {
        var conflicts = all.filter { !($0.resource == conflict.resource && $0.itemId == conflict.itemId) }
        conflicts.append(conflict)
        save(conflicts)
    }

    func remove(_ resource: SyncConflictResource, id: String) {
        save(all.filter { !($0.resource == resource && $0.itemId == id) })
    }

    func clear() {
        guard ownerID != nil else { return }
        try? LegacyRecoveryJournal.settle(owner: ownerID!, retained: [], defaults: defaults)
        defaults.removeObject(forKey: key)
    }

    private func save(_ conflicts: [SyncConflictItem]) {
        guard let ownerID else { return }
        do { try LegacyRecoveryJournal.settle(owner: ownerID, retained: conflicts, defaults: defaults) } catch { return }
        let conflicts = conflicts.filter { $0.recoveryID == nil }
        guard !conflicts.isEmpty else {
            defaults.removeObject(forKey: key)
            return
        }
        if let data = try? JSONEncoder().encode(conflicts) {
            defaults.set(data, forKey: key)
        }
    }
}

private func nameKey(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

private func uniqueImportedName(
    _ name: String,
    existingNames: inout Set<String>,
    renamed: inout [RepMixBurnImportRename]
) -> String {
    let base = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? "Imported"
        : name.trimmingCharacters(in: .whitespacesAndNewlines)
    if !existingNames.contains(nameKey(base)) {
        existingNames.insert(nameKey(base))
        return base
    }

    var candidate = "\(base) (imported)"
    var index = 2
    while existingNames.contains(nameKey(candidate)) {
        candidate = "\(base) (imported \(index))"
        index += 1
    }
    existingNames.insert(nameKey(candidate))
    renamed.append(.init(from: base, to: candidate))
    return candidate
}

private func isNetworkAvailabilityError(_ error: Error) -> Bool {
    guard let urlError = error as? URLError else { return false }
    switch urlError.code {
    case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .timedOut:
        return true
    default:
        return false
    }
}

func isCancellationError(_ error: Error) -> Bool {
    if error is CancellationError { return true }
    if let urlError = error as? URLError, urlError.code == .cancelled { return true }
    let nsError = error as NSError
    return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
}

private extension Array where Element == Exercise {
    func sortedByName() -> [Exercise] {
        sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

private extension Array where Element == WorkoutTemplate {
    func sortedByName() -> [WorkoutTemplate] {
        sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

private extension Array where Element == TrainingProgram {
    func sortedForDisplay() -> [TrainingProgram] {
        sorted {
            let leftActive = $0.active == true
            let rightActive = $1.active == true
            if leftActive != rightActive { return leftActive && !rightActive }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }
}


enum LegacyRecoveryError: LocalizedError {
    case reviewRequired
    var errorDescription: String? { "Verify the original account and resolve newer pending work first. Missing, deleted, unversioned or already reviewed work stays export-only for support; its absence cannot prove it was never saved." }
}
struct LegacyRecoverySource: Codable, Equatable { var key: String; var bytes: Data }
struct LegacyRecoveryReview { var owner: String; var generation: UUID; var sources: [LegacyRecoverySource] }
struct LegacyRecoveryRecord: Identifiable {
    var source: LegacyRecoverySource
    var index: Int
    var state: String
    var preview: String
    var resource: SyncConflictResource?
    var operation: String?
    var local: SyncConflictValue?
    var itemID: String?
    var id: String { "\(source.key):\(index)" }
}
struct LegacyRecoveryDecision: Codable, Equatable {
    var decisionID: String? = nil
    var source: LegacyRecoverySource
    var index: Int
    var owner: String
    var state: String
    var conflict: SyncConflictItem?
}
struct LegacyRecoveryExport: Codable {
    var format = "forge-local-recovery-v1"
    var ownership = "user-asserted; verify before repair"
    var account: String
    var sources: [LegacyRecoverySource]
    var decisions: [LegacyRecoveryDecision]
}
private enum LegacyRecoveryJournal {
    static let key = "forge.legacyRecoveryReview.v1"
    static let keys = ["forge.pendingWorkoutLogSaves.v1", "forge.pendingResourceChanges.v1", "forge.pendingConflicts.v1"]
    static func sources(_ defaults: UserDefaults) -> [LegacyRecoverySource] {
        keys.compactMap { key in defaults.data(forKey: key).map { .init(key: key, bytes: $0) } }
    }
    static func read(_ defaults: UserDefaults) throws -> [LegacyRecoveryDecision] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return try JSONDecoder().decode([LegacyRecoveryDecision].self, from: data)
    }
    static func records(_ review: LegacyRecoveryReview, defaults: UserDefaults) throws -> [LegacyRecoveryRecord] {
        let decisions = try read(defaults)
        return review.sources.flatMap { source -> [LegacyRecoveryRecord] in
            guard let rows = (try? JSONSerialization.jsonObject(with: source.bytes)) as? [[String: Any]] else {
                return [.init(source: source, index: -1, state: "unreadable", preview: "Unreadable source; export preserves its exact bytes.")]
            }
            return rows.enumerated().map { index, row in
                let prior = decisions.first { $0.source == source && $0.index == index }
                if let prior, prior.owner != review.owner {
                    return .init(source: source, index: index, state: "another-account", preview: "Already attributed to another account. Sign in to that account.")
                }
                let resource = source.key == keys[0] ? SyncConflictResource.logs : SyncConflictResource(rawValue: row["resource"] as? String ?? "")
                let operation = row["operation"] as? String ?? "put"
                let payload: Any?
                if source.key == keys[2], let local = row["local"] as? [String: Any], let resource {
                    payload = local[resource == .exercises ? "exercise" : resource == .logs ? "log" : resource == .templates ? "template" : "program"]
                } else if resource == .logs { payload = row["log"] ?? row }
                else if resource == .exercises { payload = row["exercise"] }
                else if resource == .templates { payload = row["template"] }
                else if resource == .programs { payload = row["program"] }
                else { payload = nil }
                var local: SyncConflictValue?
                if let payload, JSONSerialization.isValidJSONObject(payload), let data = try? JSONSerialization.data(withJSONObject: payload) {
                    switch resource {
                    case .logs: local = (try? JSONDecoder().decode(WorkoutLog.self, from: data)).map { .log($0) }
                    case .exercises: local = (try? JSONDecoder().decode(Exercise.self, from: data)).map { .exercise($0) }
                    case .templates: local = (try? JSONDecoder().decode(WorkoutTemplate.self, from: data)).map { .template($0) }
                    case .programs: local = (try? JSONDecoder().decode(TrainingProgram.self, from: data)).map { .program($0) }
                    case nil: break
                    }
                }
                let itemID = local?.log?.id ?? local?.exercise?.id ?? local?.template?.id ?? local?.program?.id
                if (payload as? [String: Any])?["deleted"] as? Bool == true || operation != "put" || itemID?.range(of: "^[A-Za-z0-9_-]{1,160}$", options: .regularExpression) == nil { local = nil }
                if let outerID = (row[source.key == keys[2] ? "itemId" : "id"] as? String), outerID != itemID { local = nil }
                let preview = (try? JSONSerialization.data(withJSONObject: row, options: [.prettyPrinted, .sortedKeys])).map { String(decoding: $0, as: UTF8.self) } ?? "Unreadable"
                return .init(source: source, index: index, state: prior?.state ?? "preserved", preview: preview, resource: resource, operation: operation, local: local, itemID: itemID)
            }
        }
    }
    static func record(_ record: LegacyRecoveryRecord, owner: String, state: String, conflict: SyncConflictItem?, defaults: UserDefaults) throws {
        var rows = try read(defaults)
        if let prior = rows.first(where: { $0.source == record.source && $0.index == record.index }) {
            guard prior.owner == owner && (prior.state == "preserved" || (prior.state == "set-aside" && state == "preserved")) else { throw LegacyRecoveryError.reviewRequired }
            rows.removeAll { $0.source == record.source && $0.index == record.index }
        }
        rows.append(.init(decisionID: UUID().uuidString, source: record.source, index: record.index, owner: owner, state: state, conflict: conflict))
        defaults.set(try JSONEncoder().encode(rows), forKey: key)
    }
    static func settle(owner: String, retained: [SyncConflictItem], defaults: UserDefaults) throws {
        var rows = try read(defaults)
        var changed = false
        for index in rows.indices where rows[index].owner == owner && rows[index].state == "staged" {
            if !retained.contains(where: { $0.recoveryID == rows[index].conflict?.recoveryID }) {
                rows[index].state = "reviewed"; changed = true
            }
        }
        if changed { defaults.set(try JSONEncoder().encode(rows), forKey: key) }
    }
}
