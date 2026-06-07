import AuthenticationServices
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum AppPage: String, CaseIterable, Identifiable, Hashable {
    case log
    case templates
    case progress
    case history
    case exercises
    case settings

    var id: String { rawValue }

    var label: String {
        switch self {
        case .log: return "Workout"
        case .progress: return "Progress"
        case .history: return "History"
        case .templates: return "Program"
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
    @State private var showingSyncConflicts = false

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
            .sheet(isPresented: $showingSyncConflicts) {
                SyncConflictReviewSheet()
                    .environmentObject(store)
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

            Tab(AppPage.templates.label, systemImage: AppPage.templates.symbol, value: AppPage.templates) {
                tabContent(for: .templates)
            }

            Tab(AppPage.progress.label, systemImage: AppPage.progress.symbol, value: AppPage.progress) {
                tabContent(for: .progress)
            }

            Tab(AppPage.history.label, systemImage: AppPage.history.symbol, value: AppPage.history) {
                tabContent(for: .history)
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
                page = .log
            } onReviewConflicts: {
                showingSyncConflicts = true
            } onSignOut: {
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
    let onDone: () -> Void
    let onReviewConflicts: () -> Void
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
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    AccountProfileCard(user: auth.user, isDemoMode: auth.isDemoMode)

                    AccountSettingsSection(title: "Sync") {
                        AccountSettingsCard {
                            VStack(spacing: 0) {
                                HStack(spacing: 14) {
                                    Text("Status")
                                        .font(.system(size: 17, weight: .regular))
                                        .foregroundStyle(Theme.text)

                                    Spacer()

                                    AccountSyncStatusBadge(
                                        title: syncStatusTitle,
                                        systemImage: syncStatusIcon,
                                        tint: syncStatusTint
                                    )
                                }
                                .frame(minHeight: 50)

                                if let detail = store.syncDetailText {
                                    AccountSettingsDivider()

                                    Text(detail)
                                        .font(.footnote)
                                        .foregroundStyle(store.syncIssueMessage == nil ? Theme.muted : Theme.danger)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, 12)
                                }

                                AccountSettingsDivider()

                                Button {
                                    Task { await syncNow() }
                                } label: {
                                    Text(store.isSyncingPending ? "Syncing..." : "Sync Now")
                                        .font(.system(size: 17, weight: .medium))
                                        .foregroundStyle(syncButtonDisabled ? Theme.muted : Color.blue)
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 50)
                                }
                                .buttonStyle(.plain)
                                .disabled(syncButtonDisabled)

                                if store.pendingConflictCount > 0 {
                                    AccountSettingsDivider()

                                    Button(action: onReviewConflicts) {
                                        AccountSettingsActionRow(
                                            title: "Review Sync Conflicts",
                                            systemImage: "exclamationmark.triangle.fill",
                                            tint: Theme.warning
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(accountBusy)
                                }
                            }
                        }
                    }

                    AccountSettingsSection(title: "Data & Support") {
                        AccountSettingsCard {
                            VStack(spacing: 0) {
                                Button {
                                    Task { await exportAccountData() }
                                } label: {
                                    AccountSettingsActionRow(title: "Export Data", systemImage: "square.and.arrow.down")
                                }
                                .buttonStyle(.plain)
                                .disabled(accountBusy)

                                AccountSettingsDivider()

                                Button {
                                    showingImportPicker = true
                                } label: {
                                    AccountSettingsActionRow(title: "Import Data", systemImage: "square.and.arrow.up")
                                }
                                .buttonStyle(.plain)
                                .disabled(accountBusy)

                                AccountSettingsDivider()

                                Button {
                                    showingFeedback = true
                                } label: {
                                    AccountSettingsActionRow(title: "Send Feedback", systemImage: "message")
                                }
                                .buttonStyle(.plain)
                                .disabled(accountBusy)

                                if !auth.isDemoMode {
                                    AccountSettingsDivider()

                                    Button {
                                        showingAppleLink = true
                                    } label: {
                                        AccountSettingsActionRow(title: "Link Apple ID", systemImage: "apple.logo")
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(accountBusy)
                                }
                            }
                        }
                    }

                    AccountSettingsSection(title: "Privacy") {
                        AccountSettingsCard {
                            VStack(spacing: 0) {
                                Link(destination: SupportLinks.support) {
                                    AccountSettingsActionRow(title: "Support", systemImage: "questionmark.circle")
                                }
                                .buttonStyle(.plain)

                                AccountSettingsDivider()

                                Link(destination: SupportLinks.privacy) {
                                    AccountSettingsActionRow(title: "Privacy Policy", systemImage: "hand.raised")
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    AccountSettingsCard {
                        VStack(spacing: 0) {
                            Button(role: .destructive) {
                                confirmingDelete = true
                            } label: {
                                Text("Delete Account")
                                    .font(.system(size: 17, weight: .medium))
                                    .foregroundStyle(Theme.danger)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 50)
                            }
                            .buttonStyle(.plain)
                            .disabled(accountBusy)

                            AccountSettingsDivider()

                            Button(role: .destructive, action: onSignOut) {
                                Text("Sign Out")
                                    .font(.system(size: 17, weight: .medium))
                                    .foregroundStyle(Theme.danger)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 50)
                            }
                            .buttonStyle(.plain)
                            .disabled(accountBusy)
                        }
                    }

                    Text("Version \(AppConfiguration.appVersion) (\(AppConfiguration.buildNumber)) - \(AppConfiguration.gitCommitHash)")
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 18)
                }
                .padding(.horizontal, 24)
                .padding(.top, 30)
                .padding(.bottom, 44)
            }
            .background(AccountSettingsStyle.background.ignoresSafeArea())
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: onDone) {
                        Text("Done")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Theme.text)
                            .padding(.horizontal, 18)
                            .frame(height: 38)
                            .toolbarGlass(in: Capsule(), tint: AccountSettingsStyle.cardBackground.opacity(0.75))
                    }
                    .buttonStyle(.plain)
                }
            }
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
                        if !isCancellationError(error) {
                            store.errorMessage = error.localizedDescription
                        }
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes your exercises, workouts, routines, programs, settings, and feedback from the backend.")
        }
    }

    private var syncButtonDisabled: Bool {
        accountBusy || store.isSyncingPending || store.usesLocalData || store.pendingConflictCount > 0
    }

    private var syncStatusTitle: String {
        if store.syncIssueMessage != nil { return "Issue" }
        if store.pendingConflictCount > 0 { return "Conflict" }
        if store.usesLocalData { return "Local" }
        if store.isUsingOfflineSnapshot { return "Offline" }
        if store.isSyncingPending { return "Syncing" }
        if store.pendingSyncCount > 0 { return "Pending" }
        return "Connected"
    }

    private var syncStatusIcon: String {
        if store.syncIssueMessage != nil { return "exclamationmark.circle.fill" }
        if store.pendingConflictCount > 0 { return "exclamationmark.triangle.fill" }
        if store.usesLocalData { return "internaldrive.fill" }
        if store.isUsingOfflineSnapshot { return "wifi.slash" }
        if store.isSyncingPending { return "arrow.triangle.2.circlepath.circle.fill" }
        if store.pendingSyncCount > 0 { return "clock.fill" }
        return "checkmark.circle.fill"
    }

    private var syncStatusTint: Color {
        if store.syncIssueMessage != nil { return Theme.danger }
        if store.pendingConflictCount > 0 { return Theme.warning }
        if store.usesLocalData { return Theme.muted }
        if store.isUsingOfflineSnapshot { return Theme.warning }
        if store.pendingSyncCount > 0 || store.isSyncingPending { return Theme.warning }
        return Color(red: 0.2, green: 0.78, blue: 0.35)
    }

    @MainActor
    private func syncNow() async {
        accountBusy = true
        defer { accountBusy = false }
        await store.syncPendingChanges()
        if store.syncIssueMessage == nil {
            await store.loadData()
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
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
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
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }
}

private enum AccountSettingsStyle {
    static let background = Color(uiColor: .systemGroupedBackground)
    static let cardBackground = Color(uiColor: .secondarySystemGroupedBackground)
    static let divider = Color(uiColor: .separator).opacity(0.35)
    static let sectionTitle = Color(uiColor: .secondaryLabel)
    static let cardRadius: CGFloat = 28
}

private struct AccountProfileCard: View {
    let user: UserProfile?
    let isDemoMode: Bool

    private var displayName: String {
        let trimmed = user?.name.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "Forge Account" : trimmed
    }

    private var email: String {
        user?.email.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    var body: some View {
        HStack(spacing: 18) {
            AccountAvatar(user: user)

            VStack(alignment: .leading, spacing: 5) {
                Text(displayName)
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                HStack(spacing: 8) {
                    Text(email.isEmpty ? "Signed in" : email)
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)

                    if isDemoMode {
                        Text("Demo")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Theme.muted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.surface2)
                            .clipShape(Capsule())
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, minHeight: 124, alignment: .leading)
        .background(AccountSettingsStyle.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AccountSettingsStyle.cardRadius, style: .continuous))
        .shadow(color: .black.opacity(0.025), radius: 18, x: 0, y: 8)
        .accessibilityElement(children: .combine)
    }
}

private struct AccountAvatar: View {
    let user: UserProfile?

    private var imageURL: URL? {
        guard let raw = user?.picture?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        return URL(string: raw)
    }

    private var initials: String {
        let source = [user?.name, user?.email]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? "F"
        let parts = source.split(separator: " ")
        let letters = parts.prefix(2).compactMap(\.first).map(String.init).joined()
        return (letters.isEmpty ? String(source.prefix(1)) : letters).uppercased()
    }

    var body: some View {
        Group {
            if let imageURL {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .tint(Theme.muted)
                    case let .success(image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        fallback
                    @unknown default:
                        fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: 62, height: 62)
        .background(avatarBackground)
        .clipShape(Circle())
        .overlay(Circle().stroke(.white.opacity(0.65), lineWidth: 2))
        .shadow(color: .black.opacity(0.07), radius: 10, x: 0, y: 4)
    }

    private var fallback: some View {
        ZStack {
            avatarBackground
            Text(initials)
                .font(.system(size: 21, weight: .bold))
                .foregroundStyle(.white)
        }
    }

    private var avatarBackground: LinearGradient {
        LinearGradient(
            colors: [Theme.accent.opacity(0.9), Theme.accentDark.opacity(0.88)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct AccountSettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(AccountSettingsStyle.sectionTitle)
                .padding(.leading, 22)

            content
        }
    }
}

private struct AccountSettingsCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AccountSettingsStyle.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AccountSettingsStyle.cardRadius, style: .continuous))
    }
}

private struct AccountSettingsActionRow: View {
    let title: String
    let systemImage: String
    var tint: Color = Color.blue
    var showsChevron = true

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 24, weight: .regular))
                .foregroundStyle(tint)
                .frame(width: 30)

            Text(title)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.82)

            Spacer()

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.muted.opacity(0.45))
            }
        }
        .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
        .contentShape(Rectangle())
    }
}

private struct AccountSyncStatusBadge: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 27, weight: .semibold))
            Text(title)
                .font(.system(size: 18, weight: .medium))
        }
        .foregroundStyle(tint)
        .lineLimit(1)
        .minimumScaleFactor(0.82)
    }
}

private struct AccountSettingsDivider: View {
    var body: some View {
        Rectangle()
            .fill(AccountSettingsStyle.divider)
            .frame(height: 1 / UIScreen.main.scale)
    }
}

private struct SyncConflictReviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    @State private var resolvingID: String?

    var body: some View {
        NavigationStack {
            Group {
                if store.syncConflicts.isEmpty {
                    ContentUnavailableView("No Sync Conflicts", systemImage: "checkmark.icloud.fill")
                } else {
                    List {
                        ForEach(store.syncConflicts) { conflict in
                            Section {
                                VStack(alignment: .leading, spacing: 16) {
                                    HStack(spacing: 8) {
                                        Label(conflict.resource.label, systemImage: "arrow.triangle.2.circlepath")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(Theme.muted)
                                        Spacer()
                                        if let requestId = conflict.requestId, !requestId.isEmpty {
                                            Text("Request \(requestId)")
                                                .font(.caption2.monospaced())
                                                .foregroundStyle(Theme.muted)
                                                .lineLimit(1)
                                        }
                                    }

                                    ViewThatFits(in: .horizontal) {
                                        HStack(alignment: .top, spacing: 12) {
                                            SyncConflictValueColumn(title: "This iPhone", value: conflict.local)
                                            SyncConflictValueColumn(title: "Cloud", value: conflict.remote)
                                        }
                                        VStack(alignment: .leading, spacing: 12) {
                                            SyncConflictValueColumn(title: "This iPhone", value: conflict.local)
                                            SyncConflictValueColumn(title: "Cloud", value: conflict.remote)
                                        }
                                    }

                                    HStack(spacing: 10) {
                                        Button {
                                            resolve(conflict, keeping: .remote)
                                        } label: {
                                            Text("Keep Cloud")
                                                .frame(maxWidth: .infinity)
                                        }
                                        .buttonStyle(.bordered)
                                        .disabled(resolvingID != nil)

                                        Button {
                                            resolve(conflict, keeping: .local)
                                        } label: {
                                            Text(resolvingID == conflict.id ? "Saving..." : "Keep This iPhone")
                                                .frame(maxWidth: .infinity)
                                        }
                                        .buttonStyle(.borderedProminent)
                                        .disabled(resolvingID != nil || conflict.local == nil)
                                    }
                                }
                                .padding(.vertical, 6)
                            } footer: {
                                if let expected = conflict.expectedRevision, let actual = conflict.actualRevision {
                                    Text("This iPhone expected revision \(expected); cloud is revision \(actual).")
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Sync Conflicts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func resolve(_ conflict: SyncConflictItem, keeping resolution: SyncConflictResolution) {
        resolvingID = conflict.id
        Task {
            await store.resolveSyncConflict(conflict, keeping: resolution)
            resolvingID = nil
            if store.syncConflicts.isEmpty {
                dismiss()
            }
        }
    }
}

private struct SyncConflictValueColumn: View {
    let title: String
    let value: SyncConflictValue?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
            Text(value?.title ?? "Deleted item")
                .font(.headline)
                .foregroundStyle(Theme.text)
                .lineLimit(2)
            Text(value?.subtitle ?? "No saved copy")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .lineLimit(2)
            Text(revisionText)
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var revisionText: String {
        guard let value else { return "No revision" }
        let revision = value.revision.map { "r\($0)" } ?? "no revision"
        if let updatedAt = value.updatedAt, !updatedAt.isEmpty {
            return "\(revision) - \(updatedAt)"
        }
        return revision
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
                                if !isCancellationError(error) {
                                    errorMessage = error.localizedDescription
                                }
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
                                if !isCancellationError(error) {
                                    errorMessage = error.localizedDescription
                                }
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
