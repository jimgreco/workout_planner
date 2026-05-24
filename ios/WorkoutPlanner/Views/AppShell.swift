import AuthenticationServices
import SwiftUI
import UniformTypeIdentifiers

enum AppPage: String, CaseIterable, Identifiable, Hashable {
    case log
    case progress
    case history
    case templates
    case exercises
    case settings

    var id: String { rawValue }

    var label: String {
        switch self {
        case .log: return "Workout"
        case .progress: return "Progress"
        case .history: return "History"
        case .templates: return "Routines"
        case .exercises: return "Exercise Library"
        case .settings: return "Settings"
        }
    }

    var symbol: String {
        switch self {
        case .log: return "dumbbell.fill"
        case .progress: return "chart.bar.fill"
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
        tabShell
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background)
            .tint(Theme.accent)
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

    @ViewBuilder
    private var tabShell: some View {
        if #available(iOS 18.0, *) {
            modernTabShell
        } else {
            legacyTabShell
        }
    }

    @available(iOS 18.0, *)
    private var modernTabShell: some View {
        TabView(selection: $page) {
            Tab(AppPage.log.label, systemImage: AppPage.log.symbol, value: AppPage.log) {
                tabContent(for: .log)
            }

            Tab(AppPage.progress.label, systemImage: AppPage.progress.symbol, value: AppPage.progress) {
                tabContent(for: .progress)
            }

            Tab(AppPage.history.label, systemImage: AppPage.history.symbol, value: AppPage.history) {
                tabContent(for: .history)
            }

            Tab(AppPage.templates.label, systemImage: AppPage.templates.symbol, value: AppPage.templates) {
                tabContent(for: .templates)
            }

            Tab(AppPage.exercises.label, systemImage: AppPage.exercises.symbol, value: AppPage.exercises) {
                tabContent(for: .exercises)
            }

            Tab(AppPage.settings.label, systemImage: AppPage.settings.symbol, value: AppPage.settings) {
                tabContent(for: .settings)
            }
        }
        .nativeLiquidGlassTabBar()
    }

    private var legacyTabShell: some View {
        TabView(selection: $page) {
            ForEach(AppPage.allCases) { item in
                tabContent(for: item)
                    .tabItem {
                        Label(item.label, systemImage: item.symbol)
                    }
                    .tag(item)
            }
        }
    }

    @ViewBuilder
    private func tabContent(for item: AppPage) -> some View {
        switch item {
        case .log:
            WorkoutLogView()
        case .progress:
            ProgressDashboardView()
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

    private func signOut() {
        auth.signOut()
        store.reset()
        page = .log
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
    @State private var showingImportPicker = false
    @State private var importDraft: ImportDraft?

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
                        showingImportPicker = true
                    } label: {
                        Label("Import Data", systemImage: "square.and.arrow.up")
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

                Section("Privacy & Support") {
                    Link(destination: SupportLinks.support) {
                        Label("Support", systemImage: "questionmark.circle")
                    }

                    Link(destination: SupportLinks.privacy) {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }

                    LabeledContent("Sync", value: store.syncStatusText)

                    if store.pendingSyncCount > 0 {
                        Button {
                            Task { await store.syncPendingChanges() }
                        } label: {
                            Label("Sync Pending Changes", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .disabled(accountBusy)
                    }
                }

                Section("App") {
                    LabeledContent("Build", value: AppConfiguration.buildLabel)
                }

                Section("Beta") {
                    Text("Use TestFlight feedback or Send Feedback for issues. Export data before broad test runs.")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
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
        .sheet(item: $importDraft) { draft in
            ImportPreviewSheet(draft: draft, isImporting: $accountBusy) { mode in
                try await store.importData(draft.payload, mode: mode)
            }
        }
        .fileImporter(isPresented: $showingImportPicker, allowedContentTypes: [.json]) { result in
            loadImportFile(result)
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
            Text("This permanently deletes your exercises, workouts, routines, programs, settings, and feedback from the backend.")
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

    @MainActor
    private func loadImportFile(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let didStartAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didStartAccess { url.stopAccessingSecurityScopedResource() }
            }
            let data = try Data(contentsOf: url)
            let payload = try JSONDecoder().decode(ForgeExportPayload.self, from: data)
            let preview = store.previewImport(payload)
            importDraft = ImportDraft(
                fileName: url.lastPathComponent,
                payload: payload,
                preview: preview,
                defaultMode: preview.targetIsEmpty ? .emptyOnly : .merge
            )
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }
}

private struct ExportFile: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ImportDraft: Identifiable {
    let id = UUID()
    let fileName: String
    let payload: ForgeExportPayload
    let preview: ForgeImportPreview
    let defaultMode: ForgeImportMode
}

private struct ImportPreviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    let draft: ImportDraft
    @Binding var isImporting: Bool
    let onImport: (ForgeImportMode) async throws -> ForgeImportResult
    @State private var mode: ForgeImportMode
    @State private var errorMessage: String?

    init(
        draft: ImportDraft,
        isImporting: Binding<Bool>,
        onImport: @escaping (ForgeImportMode) async throws -> ForgeImportResult
    ) {
        self.draft = draft
        _isImporting = isImporting
        self.onImport = onImport
        _mode = State(initialValue: draft.defaultMode)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("File", value: draft.fileName)
                    LabeledContent("Exercises", value: "\(draft.preview.counts.exercises)")
                    LabeledContent("Routines", value: "\(draft.preview.counts.templates)")
                    LabeledContent("Workouts", value: "\(draft.preview.counts.logs)")
                    LabeledContent("Programs", value: "\(draft.preview.counts.programs)")
                    LabeledContent("Settings", value: "\(draft.preview.counts.settings)")
                } header: {
                    Text("Preview")
                }

                if !draft.preview.isEmpty {
                    Section {
                        Picker("Mode", selection: $mode) {
                            ForEach(ForgeImportMode.allCases) { option in
                                Text(option.label).tag(option)
                            }
                        }
                        .pickerStyle(.segmented)
                    } footer: {
                        Text(mode == .merge
                            ? "Existing IDs stay untouched; duplicate names are renamed."
                            : "Restore only succeeds when this account has no exercises, routines, workouts, or programs.")
                    }
                }

                if duplicateIdCount > 0 {
                    Section {
                        Text("\(duplicateIdCount) existing ID \(duplicateIdCount == 1 ? "match" : "matches") will be skipped in merge mode.")
                            .foregroundStyle(Theme.muted)
                    }
                }

                if draft.preview.isEmpty {
                    Section {
                        Text("This file does not contain exercises, routines, workouts, or programs.")
                            .foregroundStyle(Theme.muted)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(Theme.danger)
                    }
                }
            }
            .navigationTitle("Import Data")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isImporting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isImporting ? "Importing..." : "Import") {
                        Task {
                            isImporting = true
                            defer { isImporting = false }
                            do {
                                _ = try await onImport(mode)
                                dismiss()
                            } catch {
                                errorMessage = error.localizedDescription
                            }
                        }
                    }
                    .disabled(draft.preview.isEmpty || isImporting)
                }
            }
        }
    }

    private var duplicateIdCount: Int {
        draft.preview.duplicateIds.exercises
            + draft.preview.duplicateIds.templates
            + draft.preview.duplicateIds.logs
            + draft.preview.duplicateIds.programs
    }
}

private enum SupportLinks {
    static let support = URL(string: "https://workout-planner.jim-greco.com/support.html")!
    static let privacy = URL(string: "https://workout-planner.jim-greco.com/privacy.html")!
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

private extension View {
    @ViewBuilder
    func nativeLiquidGlassTabBar() -> some View {
        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior(.automatic)
        } else {
            self
        }
    }
}
