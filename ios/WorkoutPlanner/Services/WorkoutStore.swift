import Foundation

@MainActor
final class WorkoutStore: ObservableObject {
    @Published var exercises: [Exercise] = []
    @Published var templates: [WorkoutTemplate] = []
    @Published var logs: [WorkoutLog] = []
    @Published var settings = WorkoutSettings.defaults
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var pendingTemplate: WorkoutTemplate?
    @Published var editingLog: WorkoutLog?
    @Published var pendingSyncCount = 0

    private let auth: AuthManager
    private var api: WorkoutAPI? {
        guard let baseURL = AppConfiguration.apiBaseURL else { return nil }
        return WorkoutAPI(baseURL: baseURL) { [auth] in
            try await auth.freshIDToken()
        }
    }

    init(auth: AuthManager) {
        self.auth = auth
        pendingSyncCount = PendingWorkoutLogQueue.count + PendingResourceQueue.count
    }

    var usesLocalData: Bool {
        AppConfiguration.allowsLocalFallback && (auth.isDemoMode || api == nil)
    }

    var syncStatusText: String {
        if usesLocalData { return "Local demo data" }
        if pendingSyncCount > 0 {
            return "\(pendingSyncCount) pending \(pendingSyncCount == 1 ? "change" : "changes")"
        }
        return "Cloud sync"
    }

    func reset() {
        exercises = []
        templates = []
        logs = []
        settings = .defaults
        pendingTemplate = nil
        editingLog = nil
        errorMessage = nil
        PendingWorkoutLogQueue.clear()
        PendingResourceQueue.clear()
        refreshPendingSyncCount()
    }

    func loadData() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if usesLocalData {
            loadDemoDataIfNeeded()
            return
        }

        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Forge production."
            return
        }

        do {
            let loaded = try await api.initData()
            exercises = mergePendingExercises(loaded.0).sortedByName()
            templates = mergePendingTemplates(loaded.1).sortedByName()
            logs = mergePendingLogs(loaded.2)
            settings = loaded.3
            refreshPendingSyncCount()
            await flushPendingChanges(using: api)
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
            } catch {
                guard isNetworkAvailabilityError(error) else { throw error }
                PendingResourceQueue.upsertExercise(exercise)
                refreshPendingSyncCount()
                saved = exercise
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
            } catch {
                guard isNetworkAvailabilityError(error) else { throw error }
                PendingResourceQueue.upsertTemplate(template)
                refreshPendingSyncCount()
                saved = template
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
            } catch {
                guard isNetworkAvailabilityError(error) else { throw error }
                PendingWorkoutLogQueue.upsert(log)
                refreshPendingSyncCount()
                saved = log
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
        guard !usesLocalData else { return }
        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Forge production."
            return
        }
        await flushPendingChanges(using: api)
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
        let existingExerciseIds = Set(exercises.map(\.id))
        let existingTemplateIds = Set(templates.map(\.id))
        let existingLogIds = Set(logs.map(\.id))
        return ForgeImportPreview(
            counts: .init(
                exercises: importedExercises.count,
                templates: importedTemplates.count,
                logs: importedLogs.count,
                settings: payload.settings == nil ? 0 : 1
            ),
            duplicateIds: .init(
                exercises: importedExercises.filter { existingExerciseIds.contains($0.id) }.count,
                templates: importedTemplates.filter { existingTemplateIds.contains($0.id) }.count,
                logs: importedLogs.filter { existingLogIds.contains($0.id) }.count
            ),
            isEmpty: importedExercises.isEmpty && importedTemplates.isEmpty && importedLogs.isEmpty,
            targetIsEmpty: exercises.isEmpty && templates.isEmpty && logs.isEmpty
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
        if mode == .emptyOnly && (!exercises.isEmpty || !templates.isEmpty || !logs.isEmpty) {
            throw WorkoutAPIError.server(409, "Import can only restore into an empty account.", requestID: nil)
        }

        if mode == .emptyOnly {
            exercises = incomingExercises.sortedByName()
            templates = incomingTemplates.sortedByName()
            logs = incomingLogs
            if let importedSettings = payload.settings { settings = importedSettings }
            return ForgeImportResult(
                imported: .init(
                    exercises: incomingExercises.count,
                    templates: incomingTemplates.count,
                    logs: incomingLogs.count,
                    settings: payload.settings != nil
                ),
                renamed: .init(exercises: [], templates: [], logs: []),
                skipped: .init(exercises: [], templates: [], logs: [])
            )
        }

        let existingExerciseIds = Set(exercises.map(\.id))
        let existingTemplateIds = Set(templates.map(\.id))
        let existingLogIds = Set(logs.map(\.id))
        var skippedExercises: [ForgeSkippedExercise] = []
        var skippedTemplates: [ForgeSkippedExercise] = []
        var skippedLogs: [ForgeSkippedLog] = []
        var renamedExercises: [ForgeImportRename] = []
        var renamedTemplates: [ForgeImportRename] = []
        var renamedLogs: [ForgeImportRename] = []
        var exerciseNames = Set(exercises.map { nameKey($0.name) })
        var templateNames = Set(templates.map { nameKey($0.name) })
        var logNamesByDate = Set(logs.map { "\($0.date)|\(nameKey($0.name))" })

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

        exercises = (exercises + newExercises).sortedByName()
        templates = (templates + newTemplates).sortedByName()
        logs += newLogs
        if let importedSettings = payload.settings { settings = importedSettings }

        return ForgeImportResult(
            imported: .init(
                exercises: newExercises.count,
                templates: newTemplates.count,
                logs: newLogs.count,
                settings: payload.settings != nil
            ),
            renamed: .init(exercises: renamedExercises, templates: renamedTemplates, logs: renamedLogs),
            skipped: .init(exercises: skippedExercises, templates: skippedTemplates, logs: skippedLogs)
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
        guard exercises.isEmpty, templates.isEmpty, logs.isEmpty else { return }
        let bench = Exercise(name: "Bench Press", muscleGroup: "Chest", notes: "Pause first rep", personalBest: PersonalBest(weight: "225", date: DateHelpers.todayString()))
        let row = Exercise(name: "Barbell Row", muscleGroup: "Back")
        let press = Exercise(name: "Overhead Press", muscleGroup: "Shoulders")
        let squat = Exercise(name: "Back Squat", muscleGroup: "Quads", personalBest: PersonalBest(weight: "315", date: DateHelpers.todayString()))
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
        pendingSyncCount = PendingWorkoutLogQueue.count + PendingResourceQueue.count
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
                case (.templates, .delete):
                    try await api.deleteTemplate(change.id)
                    templates.removeAll { $0.id == change.id }
                case (.templates, .put):
                    guard let template = change.template else { break }
                    let saved = try await api.saveTemplate(template)
                    upsert(saved, in: &templates)
                }
                PendingResourceQueue.remove(change.resource, id: change.id)
            } catch WorkoutAPIError.unauthorized {
                auth.signOut()
                errorMessage = WorkoutAPIError.unauthorized.localizedDescription
                break
            } catch {
                if !isNetworkAvailabilityError(error) {
                    errorMessage = "A pending library change could not sync: \(error.localizedDescription)"
                }
                break
            }
        }
        exercises = exercises.sortedByName()
        templates = templates.sortedByName()
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
                }
                PendingWorkoutLogQueue.remove(change.id)
            } catch WorkoutAPIError.unauthorized {
                auth.signOut()
                errorMessage = WorkoutAPIError.unauthorized.localizedDescription
                break
            } catch {
                if !isNetworkAvailabilityError(error) {
                    errorMessage = "A pending workout could not sync: \(error.localizedDescription)"
                }
                break
            }
        }
        refreshPendingSyncCount()
    }
}

private enum PendingResourceKind: String, Codable {
    case exercises
    case templates
}

private enum PendingResourceOperation: String, Codable {
    case put
    case delete
}

private struct PendingResourceChange: Codable, Identifiable {
    var resource: PendingResourceKind
    var operation: PendingResourceOperation
    var id: String
    var exercise: Exercise?
    var template: WorkoutTemplate?
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
        upsert(.init(resource: .exercises, operation: .put, id: exercise.id, exercise: exercise, template: nil))
    }

    static func upsertTemplate(_ template: WorkoutTemplate) {
        upsert(.init(resource: .templates, operation: .put, id: template.id, exercise: nil, template: template))
    }

    static func delete(_ resource: PendingResourceKind, id: String) {
        upsert(.init(resource: resource, operation: .delete, id: id, exercise: nil, template: nil))
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
