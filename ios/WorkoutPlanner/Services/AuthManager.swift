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
                user = profile(from: gidUser)
                currentProvider = .google
                isDemoMode = false
            } catch {
                user = nil
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
            user = profile(from: result.user)
            currentProvider = .google
            isDemoMode = false
            AppleSessionStore.clearApple()
            AppleSessionStore.storeProvider(.google)
        } catch {
            authError = error.localizedDescription
        }
    }

    func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) {
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

            GIDSignIn.sharedInstance.signOut()
            AppleSessionStore.saveApple(userID: credential.user, identityToken: token, profile: profile)
            AppleSessionStore.storeProvider(.apple)
            user = profile
            currentProvider = .apple
            isDemoMode = false

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
        user = nil
        currentProvider = nil
        isDemoMode = false
        authError = nil
    }

    func freshIDToken() async throws -> String {
        if isDemoMode { return "dev-bypass-token" }
        if currentProvider == .apple {
            guard let token = AppleSessionStore.loadApple()?.identityToken else {
                throw WorkoutAPIError.unauthorized
            }
            return token
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
        return token
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

    private func profile(from gidUser: GIDGoogleUser) -> UserProfile {
        UserProfile(
            sub: gidUser.userID ?? gidUser.profile?.email ?? "google-user",
            name: gidUser.profile?.name ?? "Google User",
            email: gidUser.profile?.email ?? "",
            picture: gidUser.profile?.imageURL(withDimension: 96)?.absoluteString
        )
    }

    private func restoreAppleSession() async -> Bool {
        guard let session = AppleSessionStore.loadApple() else { return false }
        let state = await appleCredentialState(for: session.userID)
        guard state == .authorized else {
            AppleSessionStore.clearAll()
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
