import AuthenticationServices
import SwiftUI

enum AppPage: String, CaseIterable, Identifiable {
    case log
    case history
    case templates
    case exercises
    case settings

    var id: String { rawValue }

    static let tabPages: [AppPage] = [.log, .history, .templates, .exercises]

    var label: String {
        switch self {
        case .log: return "Burn!"
        case .history: return "History"
        case .templates: return "Workouts"
        case .exercises: return "Exercises"
        case .settings: return "Settings"
        }
    }

    var symbol: String {
        switch self {
        case .log: return "dumbbell.fill"
        case .history: return "calendar"
        case .templates: return "list.clipboard"
        case .exercises: return "figure.strengthtraining.traditional"
        case .settings: return "gearshape.fill"
        }
    }
}

struct AppShell: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var store: WorkoutStore
    @State private var page: AppPage = .log

    var body: some View {
        Group {
            switch page {
            case .log:
                WorkoutLogView()
            case .history:
                HistoryView(selectedPage: $page)
            case .templates:
                TemplatesView(selectedPage: $page)
            case .exercises:
                ExercisesView()
            case .settings:
                SettingsPage {
                    signOut()
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomNav(page: $page)
        }
        .onChange(of: store.pendingTemplate) { _, template in
            if template != nil { page = .log }
        }
        .onChange(of: store.editingLog) { _, log in
            if log != nil { page = .log }
        }
        .alert("Something went wrong", isPresented: Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
    }

    private func signOut() {
        auth.signOut()
        store.reset()
        page = .log
    }
}

private struct BottomNav: View {
    @Binding var page: AppPage

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 4) {
                ForEach(AppPage.tabPages) { item in
                    ToolbarPageButton(
                        item: item,
                        isSelected: page == item,
                        action: {
                            page = item
                        }
                    )
                }
            }
            .padding(4)
            .toolbarGlass(in: Capsule())
            .layoutPriority(1)

            ToolbarIconButton(
                systemName: "gearshape.fill",
                accessibilityLabel: "Settings",
                tint: page == .settings ? Theme.accent : Theme.muted,
                isSelected: page == .settings
            ) {
                page = .settings
            }
        }
        .padding(7)
        .frame(minHeight: 70)
        .toolbarGlass(in: Capsule(), tint: Theme.accent.opacity(0.04))
        .shadow(color: .black.opacity(0.16), radius: 22, x: 0, y: 12)
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }
}

private struct SettingsPage: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var store: WorkoutStore
    let onSignOut: () -> Void
    @State private var showingFeedback = false
    @State private var showingAppleLink = false
    @State private var confirmingDelete = false
    @State private var accountBusy = false
    @State private var exportFile: ExportFile?

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let user = auth.user {
                        LabeledContent("Name", value: user.name)
                        if !user.email.isEmpty {
                            LabeledContent("Email", value: user.email)
                        }
                    }
                    if auth.isDemoMode {
                        LabeledContent("Mode", value: "Demo")
                    }
                }

                Section("Data & Support") {
                    Button {
                        Task { await exportAccountData() }
                    } label: {
                        Label("Export Data", systemImage: "square.and.arrow.down")
                    }
                    .disabled(accountBusy)

                    Button {
                        showingFeedback = true
                    } label: {
                        Label("Send Feedback", systemImage: "message")
                    }
                    .disabled(accountBusy)

                    if !auth.isDemoMode {
                        Button {
                            showingAppleLink = true
                        } label: {
                            Label("Link Apple ID", systemImage: "apple.logo")
                        }
                        .disabled(accountBusy)
                    }

                    Button(role: .destructive) {
                        confirmingDelete = true
                    } label: {
                        Label("Delete Account", systemImage: "exclamationmark.triangle")
                    }
                    .disabled(accountBusy)
                }

                Section("App") {
                    LabeledContent("Build", value: AppConfiguration.buildLabel)
                }

                Section {
                    Button(role: .destructive, action: onSignOut) {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
        }
        .sheet(isPresented: $showingFeedback) {
            FeedbackSheet(isSending: $accountBusy) { message in
                try await store.submitFeedback(message)
            }
        }
        .sheet(isPresented: $showingAppleLink) {
            AppleLinkSheet(isLinking: $accountBusy) { result in
                let linked = await auth.handleAppleAccountLink(result)
                if linked {
                    await store.loadData()
                    return true
                }
                if let error = auth.authError {
                    store.errorMessage = error
                }
                return false
            }
        }
        .sheet(item: $exportFile) { file in
            NavigationStack {
                VStack(spacing: 24) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 44, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                    ShareLink(item: file.url) {
                        Label("Share Export", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
                .padding(24)
                .navigationTitle("Export Ready")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { exportFile = nil }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .confirmationDialog("Delete Account?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete Everything", role: .destructive) {
                Task {
                    accountBusy = true
                    defer { accountBusy = false }
                    do {
                        try await store.deleteAccount()
                        onSignOut()
                    } catch {
                        store.errorMessage = error.localizedDescription
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes your exercises, workouts, templates, settings, and feedback from the backend.")
        }
    }

    @MainActor
    private func exportAccountData() async {
        accountBusy = true
        defer { accountBusy = false }
        do {
            let data = try await store.exportData()
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("forge-workout-export-\(DateHelpers.todayString()).json")
            try data.write(to: url, options: .atomic)
            exportFile = ExportFile(url: url)
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }
}

private struct ExportFile: Identifiable {
    let id = UUID()
    let url: URL
}

private struct FeedbackSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var isSending: Bool
    let onSubmit: (String) async throws -> Void
    @State private var message = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $message)
                        .frame(minHeight: 160)
                } header: {
                    Text("What should I know?")
                } footer: {
                    Text("Includes \(AppConfiguration.buildLabel) so issues are easier to trace.")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(Theme.danger)
                    }
                }
            }
            .navigationTitle("Send Feedback")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSending ? "Sending..." : "Send") {
                        Task {
                            isSending = true
                            defer { isSending = false }
                            do {
                                try await onSubmit(message.trimmingCharacters(in: .whitespacesAndNewlines))
                                dismiss()
                            } catch {
                                errorMessage = error.localizedDescription
                            }
                        }
                    }
                    .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
                }
            }
        }
    }
}

private struct AppleLinkSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Binding var isLinking: Bool
    let onComplete: (Result<ASAuthorization, Error>) async -> Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Image(systemName: "apple.logo")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(Theme.text)
                Text("Link Apple ID")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Theme.text)

                SignInWithAppleButton(.continue) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    Task {
                        isLinking = true
                        defer { isLinking = false }
                        if await onComplete(result) {
                            dismiss()
                        }
                    }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 44)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .disabled(isLinking)
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background)
            .navigationTitle("Account")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isLinking)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

private struct ToolbarIconButton: View {
    let systemName: String
    let accessibilityLabel: String
    var tint: Color = Theme.text
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background {
                    if isSelected {
                        Circle()
                            .fill(Theme.accent.opacity(0.13))
                    }
                }
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .toolbarGlass(in: Circle())
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct ToolbarPageButton: View {
    let item: AppPage
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: item.symbol)
                    .font(.system(size: 17, weight: isSelected ? .bold : .semibold))
                Text(item.label)
                    .font(.system(size: 10, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
            .foregroundStyle(isSelected ? Theme.accent : Theme.muted)
            .frame(maxWidth: .infinity)
            .frame(height: 42)
            .padding(.horizontal, 2)
            .background {
                if isSelected {
                    Capsule()
                        .fill(Theme.accent.opacity(0.13))
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
