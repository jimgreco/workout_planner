import SwiftUI

struct ExercisesView: View {
    @EnvironmentObject private var store: WorkoutStore
    @State private var search = ""
    @State private var sheet: ExerciseSheet?
    @State private var deleteTarget: Exercise?
    @State private var isSaving = false

    private var filtered: [Exercise] {
        store.exercises
            .filter { exercise in
                search.isEmpty ||
                exercise.name.localizedCaseInsensitiveContains(search) ||
                exercise.muscleGroup.localizedCaseInsensitiveContains(search)
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("Exercises")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Theme.text)
                    Spacer()
                    Button {
                        sheet = .form(Exercise(name: "", muscleGroup: "Other", notes: nil))
                    } label: {
                        Label("Add Exercise", systemImage: "plus")
                    }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                }

                ExerciseSearchBar(text: $search)

                if filtered.isEmpty {
                    EmptyState(
                        icon: "dumbbell",
                        text: search.isEmpty ? "No exercises yet. Add one to get started!" : "No exercises match your search."
                    )
                } else {
                    VStack(spacing: 12) {
                        ForEach(filtered) { exercise in
                            ExerciseRow(
                                exercise: exercise,
                                onPB: { sheet = .personalBest(exercise) },
                                onEdit: { sheet = .form(exercise) },
                                onDelete: { deleteTarget = exercise }
                            )
                        }
                    }
                }
            }
            .padding(16)
        }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case let .form(exercise):
                ExerciseFormSheet(exercise: exercise, isSaving: $isSaving)
            case let .personalBest(exercise):
                PersonalBestSheet(exercise: exercise, isSaving: $isSaving)
            }
        }
        .alert("Delete Exercise", isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                guard let target = deleteTarget else { return }
                Task {
                    do {
                        try await store.deleteExercise(target.id)
                        deleteTarget = nil
                    } catch {
                        store.errorMessage = error.localizedDescription
                    }
                }
            }
        } message: {
            Text("Delete \(deleteTarget?.name ?? "this exercise")? This cannot be undone.")
        }
    }
}

private struct ExerciseSearchBar: View {
    @Binding var text: String
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(isFocused ? Theme.accent : Theme.muted)

            TextField("Search exercises", text: $text)
                .font(.system(size: 16))
                .foregroundStyle(Theme.text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($isFocused)

            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 46)
        .background {
            Capsule()
                .fill(Theme.surface.opacity(isFocused ? 0.92 : 0.76))
        }
        .toolbarGlass(in: Capsule(), tint: isFocused ? Theme.accent.opacity(0.08) : nil)
        .overlay(
            Capsule()
                .stroke(isFocused ? Theme.accent.opacity(0.45) : Theme.border.opacity(0.65), lineWidth: 1)
        )
        .shadow(color: .black.opacity(isFocused ? 0.14 : 0.06), radius: isFocused ? 12 : 6, x: 0, y: 4)
        .animation(.easeOut(duration: 0.16), value: isFocused)
        .animation(.easeOut(duration: 0.16), value: text.isEmpty)
    }
}

private enum ExerciseSheet: Identifiable {
    case form(Exercise)
    case personalBest(Exercise)

    var id: String {
        switch self {
        case let .form(exercise): return "form-\(exercise.id)"
        case let .personalBest(exercise): return "pb-\(exercise.id)"
        }
    }
}

private struct ExerciseRow: View {
    let exercise: Exercise
    let onPB: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(exercise.name)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    Badge(text: exercise.muscleGroup)
                    if let best = exercise.personalBest?.weight, !best.isEmpty {
                        Button(action: onPB) {
                            Badge(text: "\(best) lbs", icon: "star.fill", accent: true)
                        }
                    }
                    if let notes = exercise.notes, !notes.isEmpty {
                        Text(notes)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            HStack(spacing: 8) {
                IconCircleButton(systemName: "star", tint: exercise.personalBest == nil ? Theme.text : Theme.accent, action: onPB)
                IconCircleButton(systemName: "pencil", action: onEdit)
                IconCircleButton(systemName: "trash", tint: Theme.danger, action: onDelete)
            }
        }
        .padding(16)
        .background(Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
    }
}

private struct ExerciseFormSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    @State private var form: Exercise
    @Binding var isSaving: Bool

    init(exercise: Exercise, isSaving: Binding<Bool>) {
        _form = State(initialValue: exercise)
        _isSaving = isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("e.g. Bench Press", text: Binding(
                        get: { form.name },
                        set: { form.name = $0 }
                    ))
                    Picker("Muscle Group", selection: Binding(
                        get: { form.muscleGroup },
                        set: { form.muscleGroup = $0 }
                    )) {
                        ForEach(MuscleGroups.all, id: \.self) { group in
                            Text(group).tag(group)
                        }
                    }
                    TextField("Any notes about this exercise...", text: Binding(
                        get: { form.notes ?? "" },
                        set: { form.notes = $0 }
                    ), axis: .vertical)
                    .lineLimit(2...4)
                }
            }
            .navigationTitle(form.name.isEmpty ? "Add Exercise" : "Edit Exercise")
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
            try await store.saveExercise(form)
            dismiss()
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }
}

private struct PersonalBestSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    @State private var exercise: Exercise
    @State private var weight: String
    @State private var date: Date
    @Binding var isSaving: Bool

    init(exercise: Exercise, isSaving: Binding<Bool>) {
        _exercise = State(initialValue: exercise)
        _weight = State(initialValue: exercise.personalBest?.weight ?? "")
        _date = State(initialValue: exercise.personalBest?.date.map(DateHelpers.date(from:)) ?? Date())
        _isSaving = isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Personal Best") {
                    TextField("e.g. 225", text: $weight)
                        .keyboardType(.decimalPad)
                    DatePicker("Date Achieved", selection: $date, displayedComponents: .date)
                }
                Section {
                    Text("Leave weight empty to clear the personal best. PBs are also tracked automatically when you finish workouts.")
                        .foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle(exercise.name)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving..." : "Save PB") {
                        Task { await save() }
                    }
                    .disabled(isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            if weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                exercise.personalBest = nil
            } else {
                exercise.personalBest = PersonalBest(weight: weight, date: DateHelpers.dayString(from: date))
            }
            try await store.saveExercise(exercise)
            dismiss()
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }
}
