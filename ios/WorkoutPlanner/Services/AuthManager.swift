import AuthenticationServices
import Combine
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

private struct AuthErrorResponse: Decodable {
    let error: String?
    let requestId: String?
}

private struct GoogleAuthRequest: Encodable {
    let credential: String
}

private struct AppleAuthRequest: Encodable {
    let identityToken: String
    let authorizationCode: String
    let profile: AppleProfilePayload
}

private struct AppleProfilePayload: Encodable {
    let name: String
    let email: String
    let picture: String?
}

@MainActor
final class AuthManager: ObservableObject {
    @Published var user: UserProfile? {
        didSet { if oldValue?.sub != user?.sub { invalidateSessionWork() } }
    }
    private(set) var sessionGeneration = UUID()
    var accountDidChange: (() -> Void)?

    func invalidateSessionWork() {
        sessionGeneration = UUID()
        accountDidChange?()
    }

    func checkSession(_ generation: UUID) throws {
        guard generation == sessionGeneration else { throw CancellationError() }
    }
    @Published var isRestoring = true
    @Published var authError: String?
    @Published var isDemoMode = false
    @Published var showAppleRevocationInstructions = false
    private var currentProvider: AuthProvider?
    private var appleRevocationObserver: AnyCancellable?

    init() {
        appleRevocationObserver = NotificationCenter.default.publisher(for: ASAuthorizationAppleIDProvider.credentialRevokedNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, let session = AppleSessionStore.loadApple() else { return }
                    let generation = self.sessionGeneration
                    let credential = await self.appleCredentialState(for: session.userID)
                    guard generation == self.sessionGeneration else { return }
                    if credential.error == nil && credential.state != .authorized {
                        self.signOut()
                    }
                }
            }

        if let clientID = AppConfiguration.googleClientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
    }

    func restore() async {
        invalidateSessionWork()
        let generation = sessionGeneration
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
                try checkSession(generation)
                let sessionProfile = try await ensureGoogleSession(for: gidUser)
                try checkSession(generation)
                let restoredProfile = sessionProfile ?? profile(from: gidUser)
                user = restoredProfile
                currentProvider = .google
                isDemoMode = false
                AppleSessionStore.storeProvider(.google)
                CachedUserProfileStore.save(restoredProfile)
            } catch {
                guard generation == sessionGeneration else { return }
                if storedProvider == .google,
                   let cachedUser = CachedUserProfileStore.load(),
                   AppSessionStore.validToken(for: cachedUser.sub) != nil {
                    user = cachedUser
                    currentProvider = .google
                    isDemoMode = false
                } else {
                    user = nil
                    AppSessionStore.clear()
                    CachedUserProfileStore.clear()
                }
            }
        }
        isRestoring = false
    }

    func signIn() async {
        invalidateSessionWork()
        let generation = sessionGeneration
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
            try checkSession(generation)
            let signedInProfile = try await ensureGoogleSession(for: result.user) ?? profile(from: result.user)
            try checkSession(generation)
            user = signedInProfile
            currentProvider = .google
            isDemoMode = false
            AppleSessionStore.clearApple()
            AppleSessionStore.storeProvider(.google)
            CachedUserProfileStore.save(signedInProfile)
        } catch {
            guard generation == sessionGeneration else { return }
            authError = error.localizedDescription
        }
    }

    func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        invalidateSessionWork()
        let generation = sessionGeneration
        authError = nil

        switch result {
        case let .success(authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8),
                  let codeData = credential.authorizationCode,
                  let authorizationCode = String(data: codeData, encoding: .utf8)
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
                let response = try await exchangeAppleSession(identityToken: token, authorizationCode: authorizationCode, profile: profile)
                try checkSession(generation)
                let sessionProfile = response.user ?? profile
                GIDSignIn.sharedInstance.signOut()
                AppleSessionStore.saveApple(userID: credential.user, identityToken: token, profile: sessionProfile)
                AppleSessionStore.storeProvider(.apple)
                user = sessionProfile
                currentProvider = .apple
                isDemoMode = false
                CachedUserProfileStore.save(sessionProfile)
            } catch {
                guard generation == sessionGeneration else { return }
                authError = error.localizedDescription
            }

        case let .failure(error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled {
                return
            }
            self.authError = error.localizedDescription
        }
    }

    func handleAppleAccountLink(_ result: Result<ASAuthorization, Error>) async -> Bool {
        invalidateSessionWork()
        let generation = sessionGeneration
        authError = nil

        switch result {
        case let .success(authorization):
            guard AppSessionStore.validToken(for: user?.sub) != nil else {
                authError = "Session expired. Please sign in again."
                return false
            }
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8),
                  let codeData = credential.authorizationCode,
                  let authorizationCode = String(data: codeData, encoding: .utf8)
            else {
                authError = "Apple did not return a usable identity token."
                return false
            }

            let nameParts = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
            let displayName = nameParts.isEmpty ? (user?.name ?? "Apple User") : nameParts.joined(separator: " ")
            let email = credential.email ?? user?.email ?? ""
            let profile = UserProfile(sub: credential.user, name: displayName, email: email, picture: user?.picture)

            do {
                let response = try await exchangeAppleSession(identityToken: token, authorizationCode: authorizationCode, profile: profile, linkToCurrentAccount: true)
                try checkSession(generation)
                user = response.user ?? user
                if let user {
                    CachedUserProfileStore.save(user)
                }
                isDemoMode = false
                return true
            } catch {
                guard generation == sessionGeneration else { return false }
                authError = error.localizedDescription
                return false
            }

        case let .failure(error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled {
                return false
            }
            self.authError = error.localizedDescription
            return false
        }
    }

    func useDemoMode() {
        guard AppConfiguration.allowsLocalFallback else {
            authError = "Demo mode is not available in release builds."
            return
        }
        user = UserProfile(sub: "dev-user-local", name: "Dev User", email: "dev@localhost", picture: nil)
        currentProvider = .demo
        isDemoMode = true
        authError = nil
    }

    func signOut() {
        invalidateSessionWork()
        GIDSignIn.sharedInstance.signOut()
        AppleSessionStore.clearAll()
        AppSessionStore.clear()
        CachedUserProfileStore.clear()
        user = nil
        currentProvider = nil
        isDemoMode = false
        authError = nil
    }

    func freshIDToken() async throws -> String {
        let generation = sessionGeneration
        if isDemoMode { return "dev-bypass-token" }
        if let token = AppSessionStore.validToken(for: user?.sub) {
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

        try checkSession(generation)
        guard let token = refreshed.idToken?.tokenString else {
            throw WorkoutAPIError.unauthorized
        }
        return try await exchangeGoogleSession(idToken: token, expectedOwnerID: user?.sub).token
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

    @discardableResult
    private func ensureGoogleSession(for gidUser: GIDGoogleUser) async throws -> UserProfile? {
        let generation = sessionGeneration
        if AppConfiguration.apiBaseURL == nil { return nil }
        do {
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
            try checkSession(generation)
            guard let token = refreshed.idToken?.tokenString else {
                throw WorkoutAPIError.unauthorized
            }
            return try await exchangeGoogleSession(idToken: token).user
        } catch {
            try checkSession(generation)
            throw error
        }
    }

    @discardableResult
    private func exchangeGoogleSession(idToken: String, expectedOwnerID: String? = nil) async throws -> AuthSessionResponse {
        let generation = sessionGeneration
        let response: AuthSessionResponse = try await exchangeSession(
            path: "auth/google",
            body: GoogleAuthRequest(credential: idToken)
        )
        try checkSession(generation)
        guard let ownerID = response.user?.sub, !ownerID.isEmpty else { throw WorkoutAPIError.invalidResponse }
        if let expectedOwnerID, ownerID != expectedOwnerID { throw WorkoutAPIError.unauthorized }
        AppSessionStore.save(token: response.token, expiresAt: response.expiresAt, userID: ownerID)
        return response
    }

    private func exchangeAppleSession(identityToken: String, authorizationCode: String, profile: UserProfile, linkToCurrentAccount: Bool = false) async throws -> AuthSessionResponse {
        let generation = sessionGeneration
        let response: AuthSessionResponse = try await exchangeSession(
            path: "auth/apple",
            body: AppleAuthRequest(
                identityToken: identityToken,
                authorizationCode: authorizationCode,
                profile: AppleProfilePayload(name: profile.name, email: profile.email, picture: profile.picture)
            ),
            includeAuthorization: linkToCurrentAccount
        )
        try checkSession(generation)
        guard let ownerID = response.user?.sub, !ownerID.isEmpty else { throw WorkoutAPIError.invalidResponse }
        AppSessionStore.save(token: response.token, expiresAt: response.expiresAt, userID: ownerID)
        return response
    }

    private func exchangeSession<Body: Encodable>(path: String, body: Body, includeAuthorization: Bool = false) async throws -> AuthSessionResponse {
        guard let baseURL = AppConfiguration.apiBaseURL else { throw WorkoutAPIError.missingConfiguration }
        var url = baseURL
        for component in path.split(separator: "/") {
            url.appendPathComponent(String(component))
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if includeAuthorization {
            guard let token = AppSessionStore.validToken(for: user?.sub) else { throw WorkoutAPIError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw WorkoutAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let decodedError = try? JSONDecoder().decode(AuthErrorResponse.self, from: data)
            let message = decodedError?.error ?? String(data: data, encoding: .utf8) ?? ""
            let requestID = decodedError?.requestId ?? http.value(forHTTPHeaderField: "X-Request-Id")
            throw WorkoutAPIError.server(http.statusCode, message, requestID: requestID, conflict: nil)
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
        let generation = sessionGeneration
        guard let session = AppleSessionStore.loadApple(), AppSessionStore.validToken(for: session.profile.sub) != nil else {
            AppleSessionStore.clearAll()
            AppSessionStore.clear()
            CachedUserProfileStore.clear()
            return false
        }
        let credential = await appleCredentialState(for: session.userID)
        guard generation == sessionGeneration else { return false }
        guard credential.state == .authorized || credential.error != nil else {
            AppleSessionStore.clearAll()
            AppSessionStore.clear()
            CachedUserProfileStore.clear()
            return false
        }
        user = session.profile
        currentProvider = .apple
        isDemoMode = false
        CachedUserProfileStore.save(session.profile)
        return true
    }

    private func appleCredentialState(for userID: String) async -> (state: ASAuthorizationAppleIDProvider.CredentialState, error: Error?) {
        await withCheckedContinuation { continuation in
            ASAuthorizationAppleIDProvider().getCredentialState(forUserID: userID) { state, error in
                continuation.resume(returning: (state, error))
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

    private struct BoundSession: Codable {
        let token: String
        let expiresAt: String
        let userID: String
    }
    private static let boundSessionAccount = "app.boundSession.v2"

    static func save(token: String, expiresAt: String, userID: String) {
        let session = BoundSession(token: token, expiresAt: expiresAt, userID: userID)
        guard let data = try? JSONEncoder().encode(session), let value = String(data: data, encoding: .utf8) else { return }
        saveKeychain(value: value, account: boundSessionAccount)
    }

    static func validToken(for userID: String?) -> String? {
        guard let userID,
              let value = loadKeychain(account: boundSessionAccount),
              let session = try? JSONDecoder().decode(BoundSession.self, from: Data(value.utf8)),
              session.userID == userID,
              let expiryDate = parseDate(session.expiresAt),
              expiryDate.timeIntervalSinceNow > expiryBuffer else { return nil }
        return session.token
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: sessionExpiresAtKey)
        deleteKeychain(account: sessionTokenAccount)
        deleteKeychain(account: boundSessionAccount)
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

private enum CachedUserProfileStore {
    private static let key = "wp.auth.cachedUserProfile"

    static func save(_ profile: UserProfile) {
        if let data = try? JSONEncoder().encode(profile) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func load() -> UserProfile? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(UserProfile.self, from: data)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
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
