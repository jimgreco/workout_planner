import GoogleSignIn
import SwiftUI

@main
struct WorkoutPlannerApp: App {
    @StateObject private var auth: AuthManager
    @StateObject private var store: WorkoutStore

    init() {
        let authManager = AuthManager()
        _auth = StateObject(wrappedValue: authManager)
        _store = StateObject(wrappedValue: WorkoutStore(auth: authManager))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(store)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
                .task {
                    await auth.restore()
                    if auth.user != nil {
                        await store.loadData()
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var store: WorkoutStore

    var body: some View {
        Group {
            if auth.isRestoring {
                LoadingView(text: "Restoring session...")
            } else if auth.user == nil {
                LoginView()
            } else if store.isLoading {
                LoadingView(text: "Loading your workouts...")
            } else {
                AppShell()
            }
        }
        .background(Theme.background.ignoresSafeArea())
    }
}

struct LoadingView: View {
    let text: String

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(Theme.accent)
                .scaleEffect(1.2)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
