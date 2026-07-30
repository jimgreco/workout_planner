import AuthenticationServices
import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var store: WorkoutStore
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.accent.opacity(colorScheme == .dark ? 0.12 : 0.08), .clear],
                startPoint: .topTrailing,
                endPoint: .center
            )
            .ignoresSafeArea()

            VStack {
                Spacer()

                VStack(spacing: 14) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 68, height: 68)
                        .background(
                            LinearGradient(
                                colors: [Theme.accentLight, Theme.accent, Theme.accentDark],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 21, style: .continuous))
                        .shadow(color: Theme.accent.opacity(0.28), radius: 18, y: 9)

                    VStack(spacing: 6) {
                        Text("Forge")
                            .font(.system(size: 48, weight: .heavy, design: .rounded))
                            .foregroundStyle(Theme.text)
                            .tracking(-1.8)
                        Text("Strength, structured.")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                    }
                }
                .padding(.bottom, 38)

                VStack(spacing: 12) {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    Task {
                        await auth.handleAppleSignIn(result)
                        if auth.user != nil {
                            await store.loadData()
                        }
                    }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 44)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .disabled(!AppConfiguration.isAPIConfigured)

                Button {
                    Task {
                        await auth.signIn()
                        if auth.user != nil {
                            await store.loadData()
                        }
                    }
                } label: {
                    Label("Sign in with Google", systemImage: "person.crop.circle.badge.checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!AppConfiguration.isAPIConfigured || !AppConfiguration.isGoogleConfigured)

                if AppConfiguration.allowsLocalFallback {
                    Button {
                        auth.useDemoMode()
                        Task { await store.loadData() }
                    } label: {
                        Text("Try Demo Data")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Theme.text)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Theme.surface)
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                                    .stroke(Theme.border, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                }
                .padding(18)
                .background(Theme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(Theme.border, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: .black.opacity(0.08), radius: 22, y: 10)

                if let authError = auth.authError {
                    Text(authError)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.danger)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                } else if !AppConfiguration.isAPIConfigured {
                    Text("This build is missing its API configuration. Install a production-configured build to sign in.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                } else if !AppConfiguration.isGoogleConfigured {
                    Text("Configure Google Sign-In for Google login. Apple login also needs the Sign in with Apple capability and backend Apple audience.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                }

                Spacer()

                Text("Plan with intent. Train with focus. Progress with proof.")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
