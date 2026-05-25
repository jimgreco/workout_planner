import Foundation

enum WorkoutAPIError: LocalizedError {
    case missingConfiguration
    case unauthorized
    case invalidResponse
    case server(Int, String, requestID: String?, conflict: WorkoutAPIConflict?)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Missing API configuration."
        case .unauthorized:
            return "Session expired. Please sign in again."
        case .invalidResponse:
            return "The API returned an invalid response."
        case let .server(code, message, requestID, _):
            if let requestID, !requestID.isEmpty {
                return "API \(code): \(message) (Request ID: \(requestID))"
            }
            return "API \(code): \(message)"
        }
    }

    var conflict: WorkoutAPIConflict? {
        if case let .server(_, _, _, conflict) = self { return conflict }
        return nil
    }

    var requestID: String? {
        if case let .server(_, _, requestID, _) = self { return requestID }
        return nil
    }
}

struct WorkoutAPIConflict {
    var expectedRevision: Int?
    var actualRevision: Int?
    var remoteData: Data?
}

private struct APIErrorResponse: Decodable {
    let error: String?
    let requestId: String?
}

struct WorkoutAPI {
    let baseURL: URL
    let tokenProvider: () async throws -> String

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func initData() async throws -> ([Exercise], [WorkoutTemplate], [WorkoutLog], [TrainingProgram], WorkoutSettings) {
        async let exercises = fetchExercises()
        async let templates = fetchTemplates()
        async let logs = fetchLogs()
        async let programs = fetchPrograms()
        async let settings = fetchSettings()
        return try await (exercises, templates.sortedByName(), logs, programs.sortedForDisplay(), settings)
    }

    func fetchExercises() async throws -> [Exercise] {
        try await request("GET", path: "/exercises")
    }

    func fetchTemplates() async throws -> [WorkoutTemplate] {
        try await request("GET", path: "/templates")
    }

    func fetchLogs() async throws -> [WorkoutLog] {
        try await request("GET", path: "/logs")
    }

    func fetchPrograms() async throws -> [TrainingProgram] {
        try await request("GET", path: "/programs")
    }

    func fetchSettings() async throws -> WorkoutSettings {
        try await request("GET", path: "/settings")
    }

    func saveSettings(_ settings: WorkoutSettings) async throws -> WorkoutSettings {
        try await request("PUT", path: "/settings", body: settings)
    }

    func saveExercise(_ exercise: Exercise) async throws -> Exercise {
        try await requestVersioned("PUT", path: "/exercises/\(exercise.id)", body: exercise)
    }

    func deleteExercise(_ id: String) async throws {
        try await requestNoBody("DELETE", path: "/exercises/\(id)")
    }

    func saveTemplate(_ template: WorkoutTemplate) async throws -> WorkoutTemplate {
        try await requestVersioned("PUT", path: "/templates/\(template.id)", body: template)
    }

    func deleteTemplate(_ id: String) async throws {
        try await requestNoBody("DELETE", path: "/templates/\(id)")
    }

    func saveProgram(_ program: TrainingProgram) async throws -> TrainingProgram {
        try await requestVersioned("PUT", path: "/programs/\(program.id)", body: program)
    }

    func deleteProgram(_ id: String) async throws {
        try await requestNoBody("DELETE", path: "/programs/\(id)")
    }

    func saveLog(_ log: WorkoutLog) async throws -> WorkoutLog {
        try await requestVersioned("PUT", path: "/logs/\(log.id)", body: log)
    }

    func deleteLog(_ id: String) async throws {
        try await requestNoBody("DELETE", path: "/logs/\(id)")
    }

    func submitFeedback(message: String, build: String) async throws {
        let _: FeedbackResponse = try await request("POST", path: "/feedback", body: FeedbackRequest(message: message, build: build))
    }

    func exportData() async throws -> Data {
        try await perform("GET", path: "/export", body: Optional<Data>.none)
    }

    func importData(_ data: ForgeExportPayload, mode: ForgeImportMode) async throws -> ForgeImportResult {
        try await request("POST", path: "/import", body: ForgeImportRequest(mode: mode, data: data))
    }

    func deleteAccount() async throws {
        _ = try await perform("DELETE", path: "/account", body: Optional<Data>.none)
    }

    private func request<T: Decodable>(_ method: String, path: String) async throws -> T {
        let data = try await perform(method, path: path, body: Optional<Data>.none)
        return try decoder.decode(T.self, from: data)
    }

    private func request<T: Decodable, Body: Encodable>(_ method: String, path: String, body: Body) async throws -> T {
        let data = try encoder.encode(body)
        let response = try await perform(method, path: path, body: data)
        return try decoder.decode(T.self, from: response)
    }

    private func requestVersioned<T: Decodable, Body: VersionedRequestBody>(_ method: String, path: String, body: Body) async throws -> T {
        let data = try encodeVersioned(body)
        let response = try await perform(method, path: path, body: data)
        return try decoder.decode(T.self, from: response)
    }

    private func requestNoBody(_ method: String, path: String) async throws {
        _ = try await perform(method, path: path, body: Optional<Data>.none)
    }

    private func perform(_ method: String, path: String, body: Data?) async throws -> Data {
        let token = try await tokenProvider()
        let url = baseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw WorkoutAPIError.invalidResponse }
        if http.statusCode == 401 { throw WorkoutAPIError.unauthorized }
        if http.statusCode == 204 { return Data("null".utf8) }
        guard (200..<300).contains(http.statusCode) else {
            let decodedError = try? decoder.decode(APIErrorResponse.self, from: data)
            let message = decodedError?.error ?? String(data: data, encoding: .utf8) ?? ""
            let requestID = decodedError?.requestId ?? http.value(forHTTPHeaderField: "X-Request-Id")
            throw WorkoutAPIError.server(http.statusCode, message, requestID: requestID, conflict: decodeConflict(from: data))
        }
        return data
    }

    private func encodeVersioned<Body: VersionedRequestBody>(_ body: Body) throws -> Data {
        let data = try encoder.encode(body)
        guard let revision = body.revision else { return data }
        guard var object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return data }
        object["expectedRevision"] = revision
        return try JSONSerialization.data(withJSONObject: object)
    }

    private func decodeConflict(from data: Data) -> WorkoutAPIConflict? {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let conflict = object["conflict"] as? [String: Any]
        else {
            return nil
        }
        var remoteData: Data?
        if let remote = conflict["remote"], !(remote is NSNull), JSONSerialization.isValidJSONObject(remote) {
            remoteData = try? JSONSerialization.data(withJSONObject: remote)
        }
        return WorkoutAPIConflict(
            expectedRevision: conflict["expectedRevision"] as? Int,
            actualRevision: conflict["actualRevision"] as? Int,
            remoteData: remoteData
        )
    }
}

private protocol VersionedRequestBody: Encodable {
    var revision: Int? { get }
}

extension Exercise: VersionedRequestBody {}
extension WorkoutTemplate: VersionedRequestBody {}
extension TrainingProgram: VersionedRequestBody {}
extension WorkoutLog: VersionedRequestBody {}

private struct FeedbackRequest: Encodable {
    let message: String
    let build: String
}

private struct FeedbackResponse: Decodable {
    let id: String
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
