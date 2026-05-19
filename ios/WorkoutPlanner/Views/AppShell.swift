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
    @Binding var page: AppPage
    let onSignOut: () -> Void

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
