import AuthenticationServices
import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var store: WorkoutStore
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack {
            Spacer()

            VStack(spacing: 10) {
                Text("Forge")
                    .font(.system(size: 48, weight: .heavy))
                    .foregroundStyle(Theme.accent)
                Text("Workout Planner")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.text)
            }
            .padding(.bottom, 30)

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
                .disabled(!AppConfiguration.isGoogleConfigured)

                Button {
                    auth.useDemoMode()
                    Task { await store.loadData() }
                } label: {
                    Text("Try Demo Data")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
            }

            if let authError = auth.authError {
                Text(authError)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.danger)
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
        }
        .padding(24)
        .frame(maxWidth: 440)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
