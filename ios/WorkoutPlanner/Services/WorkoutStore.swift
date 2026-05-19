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

    private let auth: AuthManager
    private var api: WorkoutAPI? {
        guard let baseURL = AppConfiguration.apiBaseURL else { return nil }
        return WorkoutAPI(baseURL: baseURL) { [auth] in
            try await auth.freshIDToken()
        }
    }

    init(auth: AuthManager) {
        self.auth = auth
    }

    var usesLocalData: Bool {
        auth.isDemoMode || api == nil
    }

    func reset() {
        exercises = []
        templates = []
        logs = []
        settings = .defaults
        pendingTemplate = nil
        editingLog = nil
        errorMessage = nil
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
            errorMessage = "Add API_BASE_URL in ios/project.yml, then regenerate the project."
            return
        }

        do {
            let loaded = try await api.initData()
            exercises = loaded.0.sortedByName()
            templates = loaded.1.sortedByName()
            logs = loaded.2
            settings = loaded.3
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
            saved = try await api.saveLog(log)
        }
        upsert(saved, in: &logs)
        return saved
    }

    func deleteLog(_ id: String) async throws {
        if !usesLocalData {
            guard let api else { throw WorkoutAPIError.missingConfiguration }
            try await api.deleteLog(id)
        }
        logs.removeAll { $0.id == id }
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
