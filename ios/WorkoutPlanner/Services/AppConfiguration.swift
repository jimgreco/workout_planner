import Foundation

enum AppConfiguration {
    static var apiBaseURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("YOUR_API_ID") else { return nil }
        return URL(string: trimmed)
    }

    static var googleClientID: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "GOOGLE_IOS_CLIENT_ID") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("YOUR_IOS_CLIENT_ID") else { return nil }
        return trimmed
    }

    static var isGoogleConfigured: Bool {
        googleClientID != nil
    }
}
