import Foundation

@MainActor
final class WorkoutStore: ObservableObject {
    @Published var exercises: [Exercise] = []
    @Published var templates: [WorkoutTemplate] = []
    @Published var logs: [WorkoutLog] = []
    @Published var programs: [TrainingProgram] = []
    @Published var settings = WorkoutSettings.defaults
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var pendingTemplate: WorkoutTemplate?
    @Published var editingLog: WorkoutLog?
    @Published var pendingSyncCount = 0
    @Published var pendingConflictCount = 0
    @Published var syncConflicts: [SyncConflictItem] = []
    @Published var isSyncingPending = false
    @Published var syncIssueMessage: String?
    @Published var lastSyncAttemptAt: Date?

    private let auth: AuthManager
    private var pendingRetryTask: Task<Void, Never>?
    private var api: WorkoutAPI? {
        guard let baseURL = AppConfiguration.apiBaseURL else { return nil }
        return WorkoutAPI(baseURL: baseURL) { [auth] in
            try await auth.freshIDToken()
        }
    }

    init(auth: AuthManager) {
        self.auth = auth
        syncConflicts = PendingSyncConflictQueue.all
        pendingSyncCount = PendingWorkoutLogQueue.count + PendingResourceQueue.count
        pendingConflictCount = syncConflicts.count
    }

    var usesLocalData: Bool {
        AppConfiguration.allowsLocalFallback && (auth.isDemoMode || api == nil)
    }

    var syncStatusText: String {
        if usesLocalData { return "Local demo data" }
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
        if let syncIssueMessage {
            return syncIssueMessage
        }
        if pendingConflictCount > 0 {
            return "Review sync conflicts before Forge retries those changes."
        }
        if pendingSyncCount > 0 {
            let retryText = lastSyncAttemptAt.map { "Last retry \(Self.syncAttemptFormatter.string(from: $0))" } ?? "Will retry automatically"
            return "\(retryText) while Forge is open."
        }
        return nil
    }

    func reset() {
        exercises = []
        templates = []
        logs = []
        programs = []
        settings = .defaults
        pendingTemplate = nil
        editingLog = nil
        errorMessage = nil
        PendingWorkoutLogQueue.clear()
        PendingResourceQueue.clear()
        PendingSyncConflictQueue.clear()
        refreshPendingSyncCount()
        stopPendingSyncRetryLoop()
    }

    func loadData() async {
        isLoading = true
        errorMessage = nil
        defer {
            isLoading = false
            refreshPendingSyncCount()
        }

        if usesLocalData {
            loadDemoDataIfNeeded()
            return
        }

        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Forge production."
            return
        }

        do {
            try await loadCloudData(using: api)
        } catch WorkoutAPIError.unauthorized {
            auth.signOut()
            errorMessage = WorkoutAPIError.unauthorized.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveSettings(_ value: WorkoutSettings) async throws {
        if usesLocalData {
            settings = value
            return
        }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        settings = try await api.saveSettings(value)
    }

    func saveExercise(_ exercise: Exercise) async throws {
        let saved: Exercise
        if usesLocalData {
            saved = exercise
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                saved = try await api.saveExercise(exercise)
                PendingResourceQueue.remove(.exercises, id: exercise.id)
                PendingSyncConflictQueue.remove(.exercises, id: exercise.id)
            } catch {
                if rememberConflict(resource: .exercises, operation: .put, itemId: exercise.id, local: .exercise(exercise), error: error) {
                    PendingResourceQueue.upsertExercise(exercise)
                    saved = exercise
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    PendingResourceQueue.upsertExercise(exercise)
                    saved = exercise
                }
                refreshPendingSyncCount()
            }
        }
        upsert(saved, in: &exercises)
        exercises = exercises.sortedByName()
        refreshPendingSyncCount()
    }

    func deleteExercise(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                try await api.deleteExercise(id)
                PendingResourceQueue.remove(.exercises, id: id)
            } catch {
                guard isNetworkAvailabilityError(error) else { throw error }
                PendingResourceQueue.delete(.exercises, id: id)
            }
        }
        exercises.removeAll { $0.id == id }
        refreshPendingSyncCount()
    }

    func saveTemplate(_ template: WorkoutTemplate) async throws {
        let saved: WorkoutTemplate
        if usesLocalData {
            saved = template
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                saved = try await api.saveTemplate(template)
                PendingResourceQueue.remove(.templates, id: template.id)
                PendingSyncConflictQueue.remove(.templates, id: template.id)
            } catch {
                if rememberConflict(resource: .templates, operation: .put, itemId: template.id, local: .template(template), error: error) {
                    PendingResourceQueue.upsertTemplate(template)
                    saved = template
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    PendingResourceQueue.upsertTemplate(template)
                    saved = template
                }
                refreshPendingSyncCount()
            }
        }
        upsert(saved, in: &templates)
        templates = templates.sortedByName()
        refreshPendingSyncCount()
    }

    func deleteTemplate(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                try await api.deleteTemplate(id)
                PendingResourceQueue.remove(.templates, id: id)
            } catch {
                guard isNetworkAvailabilityError(error) else { throw error }
                PendingResourceQueue.delete(.templates, id: id)
            }
        }
        templates.removeAll { $0.id == id }
        refreshPendingSyncCount()
    }

    func saveProgram(_ program: TrainingProgram) async throws {
        let saved: TrainingProgram
        if usesLocalData {
            saved = program
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                saved = try await api.saveProgram(program)
                PendingResourceQueue.remove(.programs, id: program.id)
                PendingSyncConflictQueue.remove(.programs, id: program.id)
            } catch {
                if rememberConflict(resource: .programs, operation: .put, itemId: program.id, local: .program(program), error: error) {
                    PendingResourceQueue.upsertProgram(program)
                    saved = program
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    PendingResourceQueue.upsertProgram(program)
                    saved = program
                }
                refreshPendingSyncCount()
            }
        }
        upsert(saved, in: &programs)
        programs = programs.sortedForDisplay()
        refreshPendingSyncCount()
    }

    func deleteProgram(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                try await api.deleteProgram(id)
                PendingResourceQueue.remove(.programs, id: id)
            } catch {
                guard isNetworkAvailabilityError(error) else { throw error }
                PendingResourceQueue.delete(.programs, id: id)
            }
        }
        programs.removeAll { $0.id == id }
        refreshPendingSyncCount()
    }

    @discardableResult
    func saveLog(_ log: WorkoutLog) async throws -> WorkoutLog {
        let saved: WorkoutLog
        if usesLocalData {
            saved = log
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                saved = try await api.saveLog(log)
                PendingWorkoutLogQueue.remove(log.id)
                PendingSyncConflictQueue.remove(.logs, id: log.id)
            } catch {
                if rememberConflict(resource: .logs, operation: .put, itemId: log.id, local: .log(log), error: error) {
                    PendingWorkoutLogQueue.upsert(log)
                    saved = log
                } else {
                    guard isNetworkAvailabilityError(error) else { throw error }
                    PendingWorkoutLogQueue.upsert(log)
                    saved = log
                }
                refreshPendingSyncCount()
            }
        }
        upsert(saved, in: &logs)
        refreshPendingSyncCount()
        return saved
    }

    func deleteLog(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            do {
                try await api.deleteLog(id)
                PendingWorkoutLogQueue.remove(id)
            } catch {
                guard isNetworkAvailabilityError(error) else { throw error }
                PendingWorkoutLogQueue.delete(id)
            }
        }
        refreshPendingSyncCount()
        logs.removeAll { $0.id == id }
    }

    func syncPendingChanges() async {
        guard !isSyncingPending else { return }
        guard !usesLocalData else { return }
        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Forge production."
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
        guard !usesLocalData else { return }
        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Forge production."
            return
        }

        do {
            switch resolution {
            case .remote:
                applyRemoteConflictValue(conflict)
            case .local:
                try await saveLocalConflictValue(conflict, using: api)
            }
            removePendingChange(for: conflict)
            PendingSyncConflictQueue.remove(conflict.resource, id: conflict.itemId)
            refreshPendingSyncCount()
        } catch WorkoutAPIError.unauthorized {
            auth.signOut()
            errorMessage = WorkoutAPIError.unauthorized.localizedDescription
        } catch {
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
    }

    func exportData() async throws -> Data {
        if usesLocalData {
            return try JSONEncoder().encode(ForgeExportPayload(
                exportedAt: ISO8601DateFormatter().string(from: Date()),
                exercises: exercises,
                templates: templates,
                logs: logs,
                programs: programs,
                settings: settings
            ))
        }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        return try await api.exportData()
    }

    func previewImport(_ payload: ForgeExportPayload) -> ForgeImportPreview {
        let importedExercises = payload.exercises ?? []
        let importedTemplates = payload.templates ?? []
        let importedLogs = payload.logs ?? []
        let importedPrograms = payload.programs ?? []
        let existingExerciseIds = Set(exercises.map(\.id))
        let existingTemplateIds = Set(templates.map(\.id))
        let existingLogIds = Set(logs.map(\.id))
        let existingProgramIds = Set(programs.map(\.id))
        return ForgeImportPreview(
            counts: .init(
                exercises: importedExercises.count,
                templates: importedTemplates.count,
                logs: importedLogs.count,
                programs: importedPrograms.count,
                settings: payload.settings == nil ? 0 : 1
            ),
            duplicateIds: .init(
                exercises: importedExercises.filter { existingExerciseIds.contains($0.id) }.count,
                templates: importedTemplates.filter { existingTemplateIds.contains($0.id) }.count,
                logs: importedLogs.filter { existingLogIds.contains($0.id) }.count,
                programs: importedPrograms.filter { existingProgramIds.contains($0.id) }.count
            ),
            isEmpty: importedExercises.isEmpty && importedTemplates.isEmpty && importedLogs.isEmpty && importedPrograms.isEmpty,
            targetIsEmpty: exercises.isEmpty && templates.isEmpty && logs.isEmpty && programs.isEmpty
        )
    }

    func importData(_ payload: ForgeExportPayload, mode: ForgeImportMode) async throws -> ForgeImportResult {
        if usesLocalData {
            return try importLocalData(payload, mode: mode)
        }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        let result = try await api.importData(payload, mode: mode)
        await loadData()
        return result
    }

    private func importLocalData(_ payload: ForgeExportPayload, mode: ForgeImportMode) throws -> ForgeImportResult {
        let incomingExercises = payload.exercises ?? []
        let incomingTemplates = payload.templates ?? []
        let incomingLogs = payload.logs ?? []
        let incomingPrograms = payload.programs ?? []
        if mode == .emptyOnly && (!exercises.isEmpty || !templates.isEmpty || !logs.isEmpty || !programs.isEmpty) {
            throw WorkoutAPIError.server(409, "Import can only restore into an empty account.", requestID: nil, conflict: nil)
        }

        if mode == .emptyOnly {
            exercises = incomingExercises.sortedByName()
            templates = incomingTemplates.sortedByName()
            logs = incomingLogs
            programs = incomingPrograms.sortedForDisplay()
            if let importedSettings = payload.settings { settings = importedSettings }
            return ForgeImportResult(
                imported: .init(
                    exercises: incomingExercises.count,
                    templates: incomingTemplates.count,
                    logs: incomingLogs.count,
                    programs: incomingPrograms.count,
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
        var skippedExercises: [ForgeSkippedExercise] = []
        var skippedTemplates: [ForgeSkippedExercise] = []
        var skippedLogs: [ForgeSkippedLog] = []
        var skippedPrograms: [ForgeSkippedExercise] = []
        var renamedExercises: [ForgeImportRename] = []
        var renamedTemplates: [ForgeImportRename] = []
        var renamedLogs: [ForgeImportRename] = []
        var renamedPrograms: [ForgeImportRename] = []
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

        exercises = (exercises + newExercises).sortedByName()
        templates = (templates + newTemplates).sortedByName()
        logs += newLogs
        programs = (programs + newPrograms).sortedForDisplay()
        if let importedSettings = payload.settings { settings = importedSettings }

        return ForgeImportResult(
            imported: .init(
                exercises: newExercises.count,
                templates: newTemplates.count,
                logs: newLogs.count,
                programs: newPrograms.count,
                settings: payload.settings != nil
            ),
            renamed: .init(exercises: renamedExercises, templates: renamedTemplates, logs: renamedLogs, programs: renamedPrograms),
            skipped: .init(exercises: skippedExercises, templates: skippedTemplates, logs: skippedLogs, programs: skippedPrograms)
        )
    }

    func deleteAccount() async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            try await api.deleteAccount()
        }
        reset()
    }

    func activeWorkout() -> WorkoutLog? {
        logs.first { $0.status == "active" || $0.status == "planning" }
    }

    func exercise(id: String) -> Exercise? {
        exercises.first { $0.id == id }
    }

    func setStartTemplate(_ template: WorkoutTemplate) {
        pendingTemplate = template
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
                    ProgramScheduleItem(weekday: 1, templateId: templates[0].id),
                    ProgramScheduleItem(weekday: 3, templateId: templates[1].id),
                    ProgramScheduleItem(weekday: 5, templateId: templates[0].id),
                ],
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
        syncConflicts = PendingSyncConflictQueue.all
        pendingSyncCount = PendingWorkoutLogQueue.count + PendingResourceQueue.count
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

        do {
            exercises = mergePendingExercises(try await api.fetchExercises()).sortedByName()
            loadedSections += 1
        } catch {
            try recordLoadFailure(error, label: "exercise library", failures: &failures, firstError: &firstError)
        }

        do {
            templates = mergePendingTemplates(try await api.fetchTemplates()).sortedByName()
            loadedSections += 1
        } catch {
            try recordLoadFailure(error, label: "routines", failures: &failures, firstError: &firstError)
        }

        do {
            logs = mergePendingLogs(try await api.fetchLogs())
            loadedSections += 1
        } catch {
            try recordLoadFailure(error, label: "workout history", failures: &failures, firstError: &firstError)
        }

        do {
            programs = mergePendingPrograms(try await api.fetchPrograms()).sortedForDisplay()
            loadedSections += 1
        } catch {
            try recordLoadFailure(error, label: "programs", failures: &failures, firstError: &firstError)
        }

        do {
            settings = try await api.fetchSettings()
            loadedSections += 1
        } catch {
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
        await flushPendingChanges(using: api)
    }

    private func recordLoadFailure(
        _ error: Error,
        label: String,
        failures: inout [String],
        firstError: inout Error?
    ) throws {
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
        PendingSyncConflictQueue.upsert(item)
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

    private func saveLocalConflictValue(_ conflict: SyncConflictItem, using api: WorkoutAPI) async throws {
        let expectedRevision = conflict.remote?.revision ?? conflict.actualRevision
        switch conflict.resource {
        case .exercises:
            guard var exercise = conflict.local?.exercise else { return }
            exercise.revision = expectedRevision
            let saved = try await api.saveExercise(exercise)
            upsert(saved, in: &exercises)
            exercises = exercises.sortedByName()
        case .templates:
            guard var template = conflict.local?.template else { return }
            template.revision = expectedRevision
            let saved = try await api.saveTemplate(template)
            upsert(saved, in: &templates)
            templates = templates.sortedByName()
        case .logs:
            guard var log = conflict.local?.log else { return }
            log.revision = expectedRevision
            let saved = try await api.saveLog(log)
            upsert(saved, in: &logs)
        case .programs:
            guard var program = conflict.local?.program else { return }
            program.revision = expectedRevision
            let saved = try await api.saveProgram(program)
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
            PendingWorkoutLogQueue.remove(conflict.itemId)
        } else if let resource = PendingResourceKind(conflict.resource) {
            PendingResourceQueue.remove(resource, id: conflict.itemId)
        }
    }

    private func mergePendingExercises(_ cloudExercises: [Exercise]) -> [Exercise] {
        var merged = Dictionary(uniqueKeysWithValues: cloudExercises.map { ($0.id, $0) })
        for pending in PendingResourceQueue.all where pending.resource == .exercises {
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
        for pending in PendingResourceQueue.all where pending.resource == .templates {
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
        for pending in PendingResourceQueue.all where pending.resource == .programs {
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
        for pending in PendingWorkoutLogQueue.changes {
            if pending.operation == .delete {
                merged.removeValue(forKey: pending.id)
            } else if let log = pending.log {
                merged[pending.id] = log
            }
        }
        return Array(merged.values)
    }

    private func flushPendingChanges(using api: WorkoutAPI) async {
        await flushPendingResources(using: api)
        await flushPendingLogs(using: api)
    }

    private func flushPendingResources(using api: WorkoutAPI) async {
        let pending = PendingResourceQueue.all
        guard !pending.isEmpty else {
            refreshPendingSyncCount()
            return
        }

        for change in pending {
            do {
                switch (change.resource, change.operation) {
                case (.exercises, .delete):
                    try await api.deleteExercise(change.id)
                    exercises.removeAll { $0.id == change.id }
                case (.exercises, .put):
                    guard let exercise = change.exercise else { break }
                    let saved = try await api.saveExercise(exercise)
                    upsert(saved, in: &exercises)
                    PendingSyncConflictQueue.remove(.exercises, id: change.id)
                case (.templates, .delete):
                    try await api.deleteTemplate(change.id)
                    templates.removeAll { $0.id == change.id }
                case (.templates, .put):
                    guard let template = change.template else { break }
                    let saved = try await api.saveTemplate(template)
                    upsert(saved, in: &templates)
                    PendingSyncConflictQueue.remove(.templates, id: change.id)
                case (.programs, .delete):
                    try await api.deleteProgram(change.id)
                    programs.removeAll { $0.id == change.id }
                case (.programs, .put):
                    guard let program = change.program else { break }
                    let saved = try await api.saveProgram(program)
                    upsert(saved, in: &programs)
                    PendingSyncConflictQueue.remove(.programs, id: change.id)
                }
                PendingResourceQueue.remove(change.resource, id: change.id)
            } catch WorkoutAPIError.unauthorized {
                auth.signOut()
                errorMessage = WorkoutAPIError.unauthorized.localizedDescription
                break
            } catch {
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
        refreshPendingSyncCount()
    }

    private func flushPendingLogs(using api: WorkoutAPI) async {
        let pending = PendingWorkoutLogQueue.changes
        guard !pending.isEmpty else {
            refreshPendingSyncCount()
            return
        }

        for change in pending {
            do {
                if change.operation == .delete {
                    try await api.deleteLog(change.id)
                    logs.removeAll { $0.id == change.id }
                } else if let log = change.log {
                    let saved = try await api.saveLog(log)
                    upsert(saved, in: &logs)
                    PendingSyncConflictQueue.remove(.logs, id: change.id)
                }
                PendingWorkoutLogQueue.remove(change.id)
            } catch WorkoutAPIError.unauthorized {
                auth.signOut()
                errorMessage = WorkoutAPIError.unauthorized.localizedDescription
                break
            } catch {
                if rememberConflict(change, error: error) {
                    syncIssueMessage = "A pending workout changed in the cloud. Review sync conflicts."
                } else if !isNetworkAvailabilityError(error) {
                    syncIssueMessage = "A pending workout could not sync: \(error.localizedDescription)"
                    errorMessage = syncIssueMessage
                }
                break
            }
        }
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

private struct PendingResourceChange: Codable, Identifiable {
    var resource: PendingResourceKind
    var operation: PendingResourceOperation
    var id: String
    var exercise: Exercise?
    var template: WorkoutTemplate?
    var program: TrainingProgram?
}

private struct PendingWorkoutLogChange: Codable, Identifiable {
    var operation: PendingResourceOperation
    var id: String
    var log: WorkoutLog?
}

private enum PendingResourceQueue {
    private static let key = "forge.pendingResourceChanges.v1"

    static var all: [PendingResourceChange] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([PendingResourceChange].self, from: data)) ?? []
    }

    static var count: Int {
        all.count
    }

    static func upsertExercise(_ exercise: Exercise) {
        upsert(.init(resource: .exercises, operation: .put, id: exercise.id, exercise: exercise, template: nil, program: nil))
    }

    static func upsertTemplate(_ template: WorkoutTemplate) {
        upsert(.init(resource: .templates, operation: .put, id: template.id, exercise: nil, template: template, program: nil))
    }

    static func upsertProgram(_ program: TrainingProgram) {
        upsert(.init(resource: .programs, operation: .put, id: program.id, exercise: nil, template: nil, program: program))
    }

    static func delete(_ resource: PendingResourceKind, id: String) {
        upsert(.init(resource: resource, operation: .delete, id: id, exercise: nil, template: nil, program: nil))
    }

    static func remove(_ resource: PendingResourceKind, id: String) {
        save(all.filter { !($0.resource == resource && $0.id == id) })
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func upsert(_ change: PendingResourceChange) {
        var changes = all.filter { !($0.resource == change.resource && $0.id == change.id) }
        changes.append(change)
        save(changes)
    }

    private static func save(_ changes: [PendingResourceChange]) {
        guard !changes.isEmpty else {
            clear()
            return
        }
        if let data = try? JSONEncoder().encode(changes) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

private enum PendingWorkoutLogQueue {
    private static let key = "forge.pendingWorkoutLogSaves.v1"

    static var changes: [PendingWorkoutLogChange] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        if let changes = try? JSONDecoder().decode([PendingWorkoutLogChange].self, from: data) {
            return changes
        }
        let legacyLogs = (try? JSONDecoder().decode([WorkoutLog].self, from: data)) ?? []
        return legacyLogs.map { .init(operation: .put, id: $0.id, log: $0) }
    }

    static var count: Int {
        changes.count
    }

    static func upsert(_ log: WorkoutLog) {
        var next = changes.filter { $0.id != log.id }
        next.append(.init(operation: .put, id: log.id, log: log))
        save(next)
    }

    static func delete(_ id: String) {
        var next = changes.filter { $0.id != id }
        next.append(.init(operation: .delete, id: id, log: nil))
        save(next)
    }

    static func remove(_ id: String) {
        save(changes.filter { $0.id != id })
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ changes: [PendingWorkoutLogChange]) {
        guard !changes.isEmpty else {
            clear()
            return
        }
        if let data = try? JSONEncoder().encode(changes) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

private enum PendingSyncConflictQueue {
    private static let key = "forge.pendingConflicts.v1"

    static var all: [SyncConflictItem] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return ((try? JSONDecoder().decode([SyncConflictItem].self, from: data)) ?? [])
            .sorted { $0.createdAt > $1.createdAt }
    }

    static var count: Int {
        all.count
    }

    static func upsert(_ conflict: SyncConflictItem) {
        var conflicts = all.filter { !($0.resource == conflict.resource && $0.itemId == conflict.itemId) }
        conflicts.append(conflict)
        save(conflicts)
    }

    static func remove(_ resource: SyncConflictResource, id: String) {
        save(all.filter { !($0.resource == resource && $0.itemId == id) })
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ conflicts: [SyncConflictItem]) {
        guard !conflicts.isEmpty else {
            clear()
            return
        }
        if let data = try? JSONEncoder().encode(conflicts) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

private func nameKey(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

private func uniqueImportedName(
    _ name: String,
    existingNames: inout Set<String>,
    renamed: inout [ForgeImportRename]
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
