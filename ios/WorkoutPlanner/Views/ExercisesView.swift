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
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ExerciseSearchBar(text: $search)

                    if filtered.isEmpty {
                        EmptyState(
                            icon: "dumbbell",
                            text: search.isEmpty ? "No exercises yet. Tap + to get started." : "No exercises match your search."
                        )
                    } else {
                        VStack(spacing: 12) {
                            ForEach(filtered) { exercise in
                                ExerciseRow(
                                    exercise: exercise,
                                    onDetail: { sheet = .detail(exercise) },
                                    onPB: { sheet = .personalBest(exercise) },
                                    onEdit: { sheet = .form(exercise) },
                                    onDelete: { deleteTarget = exercise }
                                )
                            }
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, 96)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Exercise Library")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    ToolbarCircleActionButton(systemName: "plus", accessibilityLabel: "Add Exercise") {
                        sheet = .form(Exercise(name: "", muscleGroup: "Other", notes: nil))
                    }
                }
            }
        }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case let .form(exercise):
                ExerciseFormSheet(exercise: exercise, isSaving: $isSaving)
            case let .personalBest(exercise):
                PersonalBestSheet(exercise: exercise, isSaving: $isSaving)
            case let .detail(exercise):
                ExerciseDetailSheet(exercise: exercise)
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
                        if !isCancellationError(error) {
                            store.errorMessage = error.localizedDescription
                        }
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
        .frame(maxWidth: .infinity)
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
    case detail(Exercise)

    var id: String {
        switch self {
        case let .form(exercise): return "form-\(exercise.id)"
        case let .personalBest(exercise): return "pb-\(exercise.id)"
        case let .detail(exercise): return "detail-\(exercise.id)"
        }
    }
}

private struct ExerciseRow: View {
    let exercise: Exercise
    let onDetail: () -> Void
    let onPB: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Text(exercise.name)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .layoutPriority(1)

                actionButtons
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    badges
                    exerciseNotes(lineLimit: 1)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        badges
                    }
                    exerciseNotes(lineLimit: 2)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
    }

    private var actionButtons: some View {
        HStack(spacing: 6) {
            IconCircleButton(systemName: "chart.bar", action: onDetail)
            IconCircleButton(systemName: "star", tint: exercise.personalBest == nil ? Theme.text : Theme.accent, action: onPB)
            IconCircleButton(systemName: "pencil", action: onEdit)
            IconCircleButton(systemName: "trash", tint: Theme.danger, action: onDelete)
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    @ViewBuilder
    private var badges: some View {
        Badge(text: exercise.muscleGroup)
        if let best = personalBestLabel(exercise.personalBest) {
            Button(action: onPB) {
                Badge(text: best, icon: "star.fill", accent: true)
            }
        }
    }

    @ViewBuilder
    private func exerciseNotes(lineLimit: Int) -> some View {
        if let notes = exercise.notes, !notes.isEmpty {
            Text(notes)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .lineLimit(lineLimit)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct ExerciseDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    let exercise: Exercise

    private var summary: ExerciseProgressSummary {
        ExerciseProgressSummary(exercise: exercise, logs: store.logs)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ExerciseDetailMetric(title: "Sessions", value: "\(summary.sessions)")
                        ExerciseDetailMetric(title: "Total Volume", value: formatVolume(summary.totalVolume))
                        ExerciseDetailMetric(title: "Total Sets", value: "\(summary.totalSets)")
                        ExerciseDetailMetric(title: "Best Set", value: summary.bestSet.map { setLabel($0.set, weightType: $0.weightType) } ?? "-")
                    }

                    ProgressPanel(title: "Trend") {
                        ExerciseDetailTrend(history: summary.history)
                    }

                    ProgressPanel(title: "Sessions") {
                        if summary.history.isEmpty {
                            EmptyState(icon: "calendar", text: "No finished workouts include this exercise yet.")
                                .padding(.vertical, -12)
                        } else {
                            VStack(spacing: 14) {
                                ForEach(summary.history) { entry in
                                    ExerciseSessionDetail(entry: entry)
                                }
                            }
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle(exercise.name)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

private struct ExerciseDetailMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
            Text(value)
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(Theme.text)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

private struct ExerciseDetailTrend: View {
    let history: [ExerciseHistoryEntry]

    var body: some View {
        let values = history.reversed().map { $0.volume > 0 ? $0.volume : Double($0.setCount) }
        if values.count < 2 {
            EmptyState(icon: "chart.bar", text: "More sessions needed for a trend.")
                .padding(.vertical, -12)
        } else {
            let maxValue = max(values.max() ?? 1, 1)
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Theme.accent)
                        .frame(maxWidth: .infinity)
                        .frame(height: max(10, CGFloat(value / maxValue) * 128))
                }
            }
            .frame(height: 140)
        }
    }
}

private struct ExerciseSessionDetail: View {
    let entry: ExerciseHistoryEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.logName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.text)
                    Text(DateHelpers.date(from: entry.date).formatted(.dateTime.month(.abbreviated).day().year()))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Text(formatVolume(entry.volume))
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.text)
            }

            FlowLayout(spacing: 6) {
                ForEach(entry.item.sets.indices, id: \.self) { index in
                    Text(setLabel(entry.item.sets[index], weightType: entry.item.weightType))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
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
                Section {
                    TextField("Setup, cues, or range of motion...", text: Binding(
                        get: { form.description ?? "" },
                        set: { form.description = $0 }
                    ), axis: .vertical)
                    .lineLimit(2...5)
                    Toggle("Track left and right reps separately", isOn: Binding(
                        get: { form.isUnilateral == true },
                        set: { form.isUnilateral = $0 }
                    ))
                    Stepper("Default Sets: \(form.defaultSets.map(String.init) ?? "Workout default")", value: Binding(
                        get: { form.defaultSets ?? store.settings.defaultSets },
                        set: { form.defaultSets = $0 }
                    ), in: 1...20)
                    Stepper("Default Reps: \(form.defaultReps.map(String.init) ?? "Workout default")", value: Binding(
                        get: { form.defaultReps ?? store.settings.defaultReps },
                        set: { form.defaultReps = $0 }
                    ), in: 1...100)
                    Button("Use Workout Defaults") {
                        form.defaultSets = nil
                        form.defaultReps = nil
                    }
                } header: {
                    Text("Routine Defaults")
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
            form.name = form.name.trimmingCharacters(in: .whitespacesAndNewlines)
            form.description = form.description?.trimmingCharacters(in: .whitespacesAndNewlines)
            form.notes = form.notes?.trimmingCharacters(in: .whitespacesAndNewlines)
            try await store.saveExercise(form)
            dismiss()
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }
}

private struct PersonalBestSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    @State private var exercise: Exercise
    @State private var weight: String
    @State private var reps: String
    @State private var date: Date
    @Binding var isSaving: Bool

    init(exercise: Exercise, isSaving: Binding<Bool>) {
        _exercise = State(initialValue: exercise)
        _weight = State(initialValue: exercise.personalBest?.weight ?? "")
        _reps = State(initialValue: exercise.personalBest?.reps ?? "")
        _date = State(initialValue: exercise.personalBest?.date.map(DateHelpers.date(from:)) ?? Date())
        _isSaving = isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Personal Best") {
                    TextField("e.g. 225", text: $weight)
                        .keyboardType(.decimalPad)
                    TextField("Reps (optional)", text: $reps)
                        .keyboardType(.numberPad)
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
                let cleanedReps = reps.trimmingCharacters(in: .whitespacesAndNewlines)
                exercise.personalBest = PersonalBest(
                    weight: weight,
                    date: DateHelpers.dayString(from: date),
                    reps: (Double(cleanedReps) ?? 0) > 0 ? cleanedReps : nil
                )
            }
            try await store.saveExercise(exercise)
            dismiss()
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }
}
