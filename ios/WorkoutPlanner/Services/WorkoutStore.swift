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
        pendingSyncCount = PendingWorkoutLogQueue.count
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
            exercises = loaded.0.sortedByName()
            templates = loaded.1.sortedByName()
            logs = mergePendingLogs(loaded.2)
            settings = loaded.3
            refreshPendingSyncCount()
            await flushPendingLogs(using: api)
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
            saved = try await api.saveExercise(exercise)
        }
        upsert(saved, in: &exercises)
        exercises = exercises.sortedByName()
    }

    func deleteExercise(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            try await api.deleteExercise(id)
        }
        exercises.removeAll { $0.id == id }
    }

    func saveTemplate(_ template: WorkoutTemplate) async throws {
        let saved: WorkoutTemplate
        if usesLocalData {
            saved = template
        } else {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            saved = try await api.saveTemplate(template)
        }
        upsert(saved, in: &templates)
        templates = templates.sortedByName()
    }

    func deleteTemplate(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            try await api.deleteTemplate(id)
        }
        templates.removeAll { $0.id == id }
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
            try await api.deleteLog(id)
        }
        PendingWorkoutLogQueue.remove(id)
        refreshPendingSyncCount()
        logs.removeAll { $0.id == id }
    }

    func syncPendingChanges() async {
        guard !usesLocalData else { return }
        guard let api else {
            errorMessage = "API configuration is missing. Install a build configured for Forge production."
            return
        }
        await flushPendingLogs(using: api)
    }

    func submitFeedback(_ message: String) async throws {
        guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if usesLocalData { return }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        try await api.submitFeedback(message: message, build: AppConfiguration.buildLabel)
    }

    func exportData() async throws -> Data {
        if usesLocalData {
            return try JSONEncoder().encode([
                "exportedAt": ISO8601DateFormatter().string(from: Date()),
                "mode": "local",
            ])
        }
        guard let api else { throw WorkoutAPIError.missingConfiguration }
        return try await api.exportData()
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
        pendingSyncCount = PendingWorkoutLogQueue.count
    }

    private func mergePendingLogs(_ cloudLogs: [WorkoutLog]) -> [WorkoutLog] {
        var merged = Dictionary(uniqueKeysWithValues: cloudLogs.map { ($0.id, $0) })
        for pending in PendingWorkoutLogQueue.all {
            merged[pending.id] = pending
        }
        return Array(merged.values)
    }

    private func flushPendingLogs(using api: WorkoutAPI) async {
        let pending = PendingWorkoutLogQueue.all
        guard !pending.isEmpty else {
            refreshPendingSyncCount()
            return
        }

        for log in pending {
            do {
                let saved = try await api.saveLog(log)
                PendingWorkoutLogQueue.remove(log.id)
                upsert(saved, in: &logs)
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

private enum PendingWorkoutLogQueue {
    private static let key = "forge.pendingWorkoutLogSaves.v1"

    static var all: [WorkoutLog] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([WorkoutLog].self, from: data)) ?? []
    }

    static var count: Int {
        all.count
    }

    static func upsert(_ log: WorkoutLog) {
        var logs = all.filter { $0.id != log.id }
        logs.append(log)
        save(logs)
    }

    static func remove(_ id: String) {
        save(all.filter { $0.id != id })
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ logs: [WorkoutLog]) {
        guard !logs.isEmpty else {
            clear()
            return
        }
        if let data = try? JSONEncoder().encode(logs) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
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
