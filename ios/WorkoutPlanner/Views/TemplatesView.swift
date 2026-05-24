import SwiftUI

struct TemplatesView: View {
    @EnvironmentObject private var store: WorkoutStore
    @Binding var selectedPage: AppPage
    @State private var sheet: TemplateSheet?
    @State private var deleteTarget: WorkoutTemplate?
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if store.templates.isEmpty {
                        EmptyState(icon: "square.grid.2x2", text: "No templates yet. Tap + to save your favorite workouts.")
                    } else {
                        VStack(spacing: 12) {
                            ForEach(store.templates) { template in
                                TemplateCard(
                                    template: template,
                                    exercises: store.exercises,
                                    onView: { sheet = .view(template) },
                                    onStart: {
                                        store.setStartTemplate(template)
                                        selectedPage = .log
                                    },
                                    onEdit: { sheet = .form(template) },
                                    onDelete: { deleteTarget = template }
                                )
                            }
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle("Workouts")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    ToolbarCircleActionButton(
                        systemName: "gearshape",
                        accessibilityLabel: "Workout Defaults",
                        tint: Theme.text
                    ) {
                        sheet = .settings
                    }

                    ToolbarCircleActionButton(systemName: "plus", accessibilityLabel: "New Workout") {
                        sheet = .form(WorkoutTemplate(name: ""))
                    }
                }
            }
        }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case let .form(template):
                TemplateFormSheet(template: template, isSaving: $isSaving)
            case let .view(template):
                TemplateViewSheet(template: template) {
                    store.setStartTemplate(template)
                    selectedPage = .log
                }
            case .settings:
                TemplateSettingsSheet(isSaving: $isSaving)
            }
        }
        .alert("Delete Template", isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                guard let target = deleteTarget else { return }
                Task {
                    do {
                        try await store.deleteTemplate(target.id)
                        deleteTarget = nil
                    } catch {
                        store.errorMessage = error.localizedDescription
                    }
                }
            }
        } message: {
            Text("Delete \(deleteTarget?.name ?? "this template")? This cannot be undone.")
        }
    }
}

private enum TemplateSheet: Identifiable {
    case form(WorkoutTemplate)
    case view(WorkoutTemplate)
    case settings

    var id: String {
        switch self {
        case let .form(template): return "form-\(template.id)"
        case let .view(template): return "view-\(template.id)"
        case .settings: return "settings"
        }
    }
}

private struct TemplateCard: View {
    let template: WorkoutTemplate
    let exercises: [Exercise]
    let onView: () -> Void
    let onStart: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(template.name)
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                        if let description = template.description, !description.isEmpty {
                            Text(description)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Spacer()

                    HStack(spacing: 8) {
                        IconCircleButton(systemName: "pencil", action: onEdit)
                        IconCircleButton(systemName: "trash", tint: Theme.danger, action: onDelete)
                    }
                }

                FlowLayout(spacing: 6) {
                    let itemBadges = template.exerciseItems.compactMap { item -> String? in
                        guard let exercise = exercises.first(where: { $0.id == item.exerciseId }) else { return nil }
                        return "\(exercise.name) • \(item.sets.count) \(item.sets.count == 1 ? "set" : "sets")"
                    }

                    if itemBadges.isEmpty {
                        Text("No exercises added")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    } else {
                        ForEach(itemBadges, id: \.self) { label in
                            Badge(text: label)
                        }
                    }
                }

                HStack(spacing: 10) {
                    Button(action: onView) {
                        Label("View", systemImage: "eye")
                            .frame(maxWidth: .infinity)
                            .lineLimit(1)
                            .minimumScaleFactor(0.9)
                    }
                    .buttonStyle(SecondaryButtonStyle(compact: true))

                    Button(action: onStart) {
                        Label("Start", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                            .lineLimit(1)
                            .minimumScaleFactor(0.9)
                    }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                }
            }
        }
    }
}

private struct TemplateFormSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    @State private var form: WorkoutTemplate
    @Binding var isSaving: Bool

    init(template: WorkoutTemplate, isSaving: Binding<Bool>) {
        _form = State(initialValue: template)
        _isSaving = isSaving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        FormLabel(text: "Template Name *")
                        TextField("e.g. Push Day, Leg Day...", text: $form.name)
                            .fieldStyle()
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        FormLabel(text: "Description")
                        TextField("Brief description...", text: Binding(
                            get: { form.description ?? "" },
                            set: { form.description = $0 }
                        ))
                        .fieldStyle()
                    }

                    Divider()

                    Text("Exercises")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.text)

                    WorkoutBuilderView(
                        exercises: store.exercises,
                        items: $form.exerciseItems,
                        showWeight: false,
                        defaultSets: store.settings.defaultSets,
                        defaultReps: store.settings.defaultReps
                    )
                }
                .padding(16)
            }
            .navigationTitle(form.name.isEmpty ? "New Template" : "Edit Template")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(form.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.saveTemplate(form)
            dismiss()
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }
}

private struct TemplateViewSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    let template: WorkoutTemplate
    let onStart: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let description = template.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                    }
                    WorkoutBuilderView(
                        exercises: store.exercises,
                        items: .constant(template.exerciseItems),
                        readOnly: true,
                        showWeight: false
                    )
                }
                .padding(16)
            }
            .navigationTitle(template.name)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") {
                        dismiss()
                        onStart()
                    }
                }
            }
        }
    }
}

private struct TemplateSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    @State private var form: WorkoutSettings
    @State private var saved = false
    @Binding var isSaving: Bool

    init(isSaving: Binding<Bool>) {
        _form = State(initialValue: .defaults)
        _isSaving = isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Stepper("Default Sets: \(form.defaultSets)", value: $form.defaultSets, in: 1...20)
                    Stepper("Default Reps: \(form.defaultReps)", value: $form.defaultReps, in: 1...100)
                } footer: {
                    Text("These values are used when adding a new exercise to a workout or template.")
                }
            }
            .navigationTitle("Workout Defaults")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saved ? "Saved" : isSaving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(isSaving || form == store.settings)
                }
            }
            .onAppear {
                form = store.settings
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.saveSettings(form)
            saved = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                saved = false
            }
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    init(spacing: CGFloat = 8) {
        self.spacing = spacing
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > width, currentX > 0 {
                maxWidth = max(maxWidth, currentX - spacing)
                currentX = 0
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        maxWidth = max(maxWidth, currentX - spacing)
        return CGSize(width: width == 0 ? maxWidth : width, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX, currentX > bounds.minX {
                currentX = bounds.minX
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: ProposedViewSize(size))
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
