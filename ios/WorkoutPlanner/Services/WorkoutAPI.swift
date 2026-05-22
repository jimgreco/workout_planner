import Foundation

enum WorkoutAPIError: LocalizedError {
    case missingConfiguration
    case unauthorized
    case invalidResponse
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Missing API configuration."
        case .unauthorized:
            return "Session expired. Please sign in again."
        case .invalidResponse:
            return "The API returned an invalid response."
        case let .server(code, body):
            return "API \(code): \(body)"
        }
    }
}

struct WorkoutAPI {
    let baseURL: URL
    let tokenProvider: () async throws -> String

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func initData() async throws -> ([Exercise], [WorkoutTemplate], [WorkoutLog], WorkoutSettings) {
        async let exercises: [Exercise] = request("GET", path: "/exercises")
        async let templates: [WorkoutTemplate] = request("GET", path: "/templates")
        async let logs: [WorkoutLog] = request("GET", path: "/logs")
        async let settings: WorkoutSettings = request("GET", path: "/settings")
        return try await (exercises, templates.sortedByName(), logs, settings)
    }

    func saveSettings(_ settings: WorkoutSettings) async throws -> WorkoutSettings {
        try await request("PUT", path: "/settings", body: settings)
    }

    func saveExercise(_ exercise: Exercise) async throws -> Exercise {
        try await request("PUT", path: "/exercises/\(exercise.id)", body: exercise)
    }

    func deleteExercise(_ id: String) async throws {
        try await requestNoBody("DELETE", path: "/exercises/\(id)")
    }

    func saveTemplate(_ template: WorkoutTemplate) async throws -> WorkoutTemplate {
        try await request("PUT", path: "/templates/\(template.id)", body: template)
    }

    func deleteTemplate(_ id: String) async throws {
        try await requestNoBody("DELETE", path: "/templates/\(id)")
    }

    func saveLog(_ log: WorkoutLog) async throws -> WorkoutLog {
        try await request("PUT", path: "/logs/\(log.id)", body: log)
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
            throw WorkoutAPIError.server(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }
}

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
