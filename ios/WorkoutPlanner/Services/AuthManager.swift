import AuthenticationServices
import Foundation
import GoogleSignIn
import Security
import SwiftUI
import UIKit

private enum AuthProvider: String {
    case google
    case apple
    case demo
}

private struct AuthSessionResponse: Decodable {
    let token: String
    let expiresAt: String
    let user: UserProfile?
}

private struct GoogleAuthRequest: Encodable {
    let credential: String
}

private struct AppleAuthRequest: Encodable {
    let identityToken: String
    let profile: AppleProfilePayload
}

private struct AppleProfilePayload: Encodable {
    let name: String
    let email: String
    let picture: String?
}

@MainActor
final class AuthManager: ObservableObject {
    @Published var user: UserProfile?
    @Published var isRestoring = true
    @Published var authError: String?
    @Published var isDemoMode = false
    private var currentProvider: AuthProvider?

    init() {
        if let clientID = AppConfiguration.googleClientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
    }

    func restore() async {
        let storedProvider = AppleSessionStore.storedProvider()

        if storedProvider == .apple {
            if await restoreAppleSession() {
                isRestoring = false
                return
            }
            isRestoring = false
            return
        }

        if AppConfiguration.isGoogleConfigured {
            do {
                let gidUser = try await restorePreviousSignIn()
                try await ensureGoogleSession(for: gidUser)
                user = profile(from: gidUser)
                currentProvider = .google
                isDemoMode = false
                AppleSessionStore.storeProvider(.google)
            } catch {
                user = nil
                AppSessionStore.clear()
            }
        }
        isRestoring = false
    }

    func signIn() async {
        authError = nil
        guard AppConfiguration.isGoogleConfigured else {
            authError = "Add the iOS Google client ID in ios/project.yml, then regenerate the project."
            return
        }
        guard let presenter = UIApplication.shared.keyWindowRootViewController else {
            authError = "Unable to open the Google sign-in sheet."
            return
        }

        do {
            let result: GIDSignInResult = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<GIDSignInResult, Error>) in
                GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else if let result {
                        continuation.resume(returning: result)
                    } else {
                        continuation.resume(throwing: WorkoutAPIError.unauthorized)
                    }
                }
            }
            try await ensureGoogleSession(for: result.user)
            user = profile(from: result.user)
            currentProvider = .google
            isDemoMode = false
            AppleSessionStore.clearApple()
            AppleSessionStore.storeProvider(.google)
        } catch {
            authError = error.localizedDescription
        }
    }

    func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        authError = nil

        switch result {
        case let .success(authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8)
            else {
                authError = "Apple did not return a usable identity token."
                return
            }

            let previousProfile = AppleSessionStore.loadApple()?.profile
            let nameParts = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
            let displayName = nameParts.isEmpty ? (previousProfile?.name ?? "Apple User") : nameParts.joined(separator: " ")
            let email = credential.email ?? previousProfile?.email ?? ""
            let profile = UserProfile(sub: credential.user, name: displayName, email: email, picture: nil)

            do {
                try await exchangeAppleSession(identityToken: token, profile: profile)
                GIDSignIn.sharedInstance.signOut()
                AppleSessionStore.saveApple(userID: credential.user, identityToken: token, profile: profile)
                AppleSessionStore.storeProvider(.apple)
                user = profile
                currentProvider = .apple
                isDemoMode = false
            } catch {
                authError = error.localizedDescription
            }

        case let .failure(error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled {
                return
            }
            self.authError = error.localizedDescription
        }
    }

    func useDemoMode() {
        user = UserProfile(sub: "dev-user-local", name: "Dev User", email: "dev@localhost", picture: nil)
        currentProvider = .demo
        isDemoMode = true
        authError = nil
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        AppleSessionStore.clearAll()
        AppSessionStore.clear()
        user = nil
        currentProvider = nil
        isDemoMode = false
        authError = nil
    }

    func freshIDToken() async throws -> String {
        if isDemoMode { return "dev-bypass-token" }
        if let token = AppSessionStore.validToken() {
            return token
        }
        if currentProvider == .apple {
            throw WorkoutAPIError.unauthorized
        }

        guard let gidUser = GIDSignIn.sharedInstance.currentUser else {
            throw WorkoutAPIError.unauthorized
        }

        let refreshed: GIDGoogleUser = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<GIDGoogleUser, Error>) in
            gidUser.refreshTokensIfNeeded { user, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let user {
                    continuation.resume(returning: user)
                } else {
                    continuation.resume(throwing: WorkoutAPIError.unauthorized)
                }
            }
        }

        guard let token = refreshed.idToken?.tokenString else {
            throw WorkoutAPIError.unauthorized
        }
        return try await exchangeGoogleSession(idToken: token)
    }

    private func restorePreviousSignIn() async throws -> GIDGoogleUser {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<GIDGoogleUser, Error>) in
            GIDSignIn.sharedInstance.restorePreviousSignIn { user, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let user {
                    continuation.resume(returning: user)
                } else {
                    continuation.resume(throwing: WorkoutAPIError.unauthorized)
                }
            }
        }
    }

    private func ensureGoogleSession(for gidUser: GIDGoogleUser) async throws {
        if AppConfiguration.apiBaseURL == nil { return }
        if AppSessionStore.validToken() != nil { return }
        let refreshed: GIDGoogleUser = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<GIDGoogleUser, Error>) in
            gidUser.refreshTokensIfNeeded { user, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let user {
                    continuation.resume(returning: user)
                } else {
                    continuation.resume(throwing: WorkoutAPIError.unauthorized)
                }
            }
        }
        guard let token = refreshed.idToken?.tokenString else {
            throw WorkoutAPIError.unauthorized
        }
        _ = try await exchangeGoogleSession(idToken: token)
    }

    @discardableResult
    private func exchangeGoogleSession(idToken: String) async throws -> String {
        let response: AuthSessionResponse = try await exchangeSession(
            path: "auth/google",
            body: GoogleAuthRequest(credential: idToken)
        )
        AppSessionStore.save(token: response.token, expiresAt: response.expiresAt)
        return response.token
    }

    private func exchangeAppleSession(identityToken: String, profile: UserProfile) async throws {
        guard AppConfiguration.apiBaseURL != nil else { return }
        let response: AuthSessionResponse = try await exchangeSession(
            path: "auth/apple",
            body: AppleAuthRequest(
                identityToken: identityToken,
                profile: AppleProfilePayload(name: profile.name, email: profile.email, picture: profile.picture)
            )
        )
        AppSessionStore.save(token: response.token, expiresAt: response.expiresAt)
    }

    private func exchangeSession<Body: Encodable>(path: String, body: Body) async throws -> AuthSessionResponse {
        guard let baseURL = AppConfiguration.apiBaseURL else { throw WorkoutAPIError.missingConfiguration }
        var url = baseURL
        for component in path.split(separator: "/") {
            url.appendPathComponent(String(component))
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw WorkoutAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw WorkoutAPIError.server(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(AuthSessionResponse.self, from: data)
    }

    private func profile(from gidUser: GIDGoogleUser) -> UserProfile {
        UserProfile(
            sub: gidUser.userID ?? gidUser.profile?.email ?? "google-user",
            name: gidUser.profile?.name ?? "Google User",
            email: gidUser.profile?.email ?? "",
            picture: gidUser.profile?.imageURL(withDimension: 96)?.absoluteString
        )
    }

    private func restoreAppleSession() async -> Bool {
        guard let session = AppleSessionStore.loadApple(), AppSessionStore.validToken() != nil else {
            AppleSessionStore.clearAll()
            AppSessionStore.clear()
            return false
        }
        let state = await appleCredentialState(for: session.userID)
        guard state == .authorized else {
            AppleSessionStore.clearAll()
            AppSessionStore.clear()
            return false
        }
        user = session.profile
        currentProvider = .apple
        isDemoMode = false
        return true
    }

    private func appleCredentialState(for userID: String) async -> ASAuthorizationAppleIDProvider.CredentialState {
        await withCheckedContinuation { continuation in
            ASAuthorizationAppleIDProvider().getCredentialState(forUserID: userID) { state, _ in
                continuation.resume(returning: state)
            }
        }
    }
}

private extension UIApplication {
    var keyWindowRootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}

private enum AppSessionStore {
    private static let keychainService = "com.workoutplanner.auth"
    private static let sessionTokenAccount = "app.sessionToken"
    private static let sessionExpiresAtKey = "wp.session.expiresAt"
    private static let expiryBuffer: TimeInterval = 5 * 60

    static func save(token: String, expiresAt: String) {
        saveKeychain(value: token, account: sessionTokenAccount)
        UserDefaults.standard.set(expiresAt, forKey: sessionExpiresAtKey)
    }

    static func validToken() -> String? {
        guard let token = loadKeychain(account: sessionTokenAccount),
              let expiresAt = UserDefaults.standard.string(forKey: sessionExpiresAtKey),
              let expiryDate = parseDate(expiresAt),
              expiryDate.timeIntervalSinceNow > expiryBuffer
        else { return nil }
        return token
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: sessionExpiresAtKey)
        deleteKeychain(account: sessionTokenAccount)
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }

    private static func saveKeychain(value: String, account: String) {
        deleteKeychain(account: account)
        let data = Data(value.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: account,
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private static func loadKeychain(account: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func deleteKeychain(account: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private enum AppleSessionStore {
    private static let providerKey = "wp.auth.provider"
    private static let appleUserIDKey = "wp.apple.userID"
    private static let appleProfileKey = "wp.apple.profile"
    private static let keychainService = "com.workoutplanner.auth"
    private static let appleTokenAccount = "apple.identityToken"

    struct AppleSession {
        let userID: String
        let identityToken: String
        let profile: UserProfile
    }

    static func storedProvider() -> AuthProvider? {
        UserDefaults.standard.string(forKey: providerKey).flatMap(AuthProvider.init(rawValue:))
    }

    static func storeProvider(_ provider: AuthProvider) {
        UserDefaults.standard.set(provider.rawValue, forKey: providerKey)
    }

    static func saveApple(userID: String, identityToken: String, profile: UserProfile) {
        UserDefaults.standard.set(userID, forKey: appleUserIDKey)
        if let data = try? JSONEncoder().encode(profile) {
            UserDefaults.standard.set(data, forKey: appleProfileKey)
        }
        saveKeychain(value: identityToken, account: appleTokenAccount)
    }

    static func loadApple() -> AppleSession? {
        guard let userID = UserDefaults.standard.string(forKey: appleUserIDKey),
              let token = loadKeychain(account: appleTokenAccount),
              let profileData = UserDefaults.standard.data(forKey: appleProfileKey),
              let profile = try? JSONDecoder().decode(UserProfile.self, from: profileData)
        else { return nil }
        return AppleSession(userID: userID, identityToken: token, profile: profile)
    }

    static func clearApple() {
        UserDefaults.standard.removeObject(forKey: appleUserIDKey)
        UserDefaults.standard.removeObject(forKey: appleProfileKey)
        deleteKeychain(account: appleTokenAccount)
    }

    static func clearAll() {
        clearApple()
        UserDefaults.standard.removeObject(forKey: providerKey)
    }

    private static func saveKeychain(value: String, account: String) {
        deleteKeychain(account: account)
        let data = Data(value.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: account,
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private static func loadKeychain(account: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func deleteKeychain(account: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
