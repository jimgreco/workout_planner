import SwiftUI

enum AppPage: String, CaseIterable, Identifiable {
    case log
    case history
    case templates
    case exercises

    var id: String { rawValue }

    var label: String {
        switch self {
        case .log: return "Burn!"
        case .history: return "History"
        case .templates: return "Workouts"
        case .exercises: return "Exercises"
        }
    }

    var symbol: String {
        switch self {
        case .log: return "dumbbell.fill"
        case .history: return "calendar"
        case .templates: return "list.clipboard"
        case .exercises: return "figure.strengthtraining.traditional"
        }
    }
}

struct AppShell: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var store: WorkoutStore
    @State private var page: AppPage = .log

    var body: some View {
        VStack(spacing: 0) {
            TopNav(page: $page) {
                auth.signOut()
                store.reset()
                page = .log
            }

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
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Theme.background)
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
}

private struct TopNav: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var store: WorkoutStore
    @Binding var page: AppPage
    let onSignOut: () -> Void
    @State private var showingFeedback = false
    @State private var confirmingDelete = false
    @State private var accountBusy = false
    @State private var exportFile: ExportFile?

    var body: some View {
        HStack(spacing: 10) {
            ToolbarIconButton(systemName: "flame.fill", tint: Theme.accent) {
                page = .log
            }

            HStack(spacing: 4) {
                ForEach(AppPage.allCases) { item in
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

            Menu {
                if let user = auth.user {
                    Text(user.name)
                    if !user.email.isEmpty {
                        Text(user.email)
                    }
                    Divider()
                }

                Text(AppConfiguration.buildLabel)
                Divider()
                Button {
                    Task { await exportAccountData() }
                } label: {
                    Label("Export data", systemImage: "square.and.arrow.down")
                }
                Button {
                    showingFeedback = true
                } label: {
                    Label("Send feedback", systemImage: "message")
                }
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    Label("Delete account", systemImage: "exclamationmark.triangle")
                }
                Divider()
                Button(role: .destructive, action: onSignOut) {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            } label: {
                AvatarView(urlString: auth.user?.picture)
            }
            .buttonStyle(.plain)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
            .toolbarGlass(in: Circle())
            .accessibilityLabel("Account")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(minHeight: 64)
        .background(.bar)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.border.opacity(0.65))
                .frame(height: 1)
        }
        .sheet(isPresented: $showingFeedback) {
            FeedbackSheet(isSending: $accountBusy) { message in
                try await store.submitFeedback(message)
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

private struct ToolbarIconButton: View {
    let systemName: String
    var tint: Color = Theme.text
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .toolbarGlass(in: Circle())
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

private struct AvatarView: View {
    let urlString: String?

    var body: some View {
        Group {
            if let urlString, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Theme.surface2
                }
            } else {
                Theme.surface2
                    .overlay(Image(systemName: "person.fill").foregroundStyle(Theme.muted))
            }
        }
        .frame(width: 28, height: 28)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.border, lineWidth: 1))
    }
}
