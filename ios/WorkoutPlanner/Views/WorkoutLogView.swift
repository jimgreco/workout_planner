import SwiftUI

struct WorkoutLogView: View {
    @EnvironmentObject private var store: WorkoutStore

    private enum FocusedTextField: Hashable {
        case name
        case notes
    }

    @State private var workoutId: String?
    @State private var name = ""
    @State private var date = Date()
    @State private var notes = ""
    @State private var items: [ExerciseItem] = []
    @State private var startTime: String?
    @State private var activeExerciseIndex = 0
    @State private var activeSetIndex = 0
    @State private var isEditing = false
    @State private var isSaving = false
    @State private var showDiscardConfirm = false
    @State private var finishSummary: FinishSummary?
    @State private var restAlert: RestTargetAlert?
    @State private var restAlertTask: Task<Void, Never>?
    @FocusState private var focusedTextField: FocusedTextField?
    @FocusState private var focusedBuilderField: WorkoutBuilderFocusedField?

    private var isActive: Bool { workoutId != nil }
    private var isPlanningMode: Bool { workoutId != nil && startTime == nil && !isEditing }
    private var pageTitle: String {
        isEditing ? "Edit Workout" : startTime == nil ? "Plan Workout" : "Log Workout"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if isActive {
                        activeHeader
                    }
                    if let restAlert {
                        RestTargetBanner(message: restAlert.message)
                    }

                    workoutFields
                    templateMenu

                    Divider().opacity(0.3)

                    Text("Exercises")
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(Theme.text)

                    WorkoutBuilderView(
                        exercises: store.exercises,
                        items: $items,
                        focusedField: $focusedBuilderField,
                        defaultSets: store.settings.defaultSets,
                        defaultReps: store.settings.defaultReps,
                        activeExerciseIndex: activeExerciseIndex,
                        activeSetIndex: activeSetIndex,
                        planningMode: isPlanningMode,
                        onSetCompleted: markSetCompleted,
                        onChanged: builderChanged
                    )

                    Divider().opacity(0.3)

                    VStack(alignment: .leading, spacing: 6) {
                        FormLabel(text: "Session Notes")
                        TextField("How did it go? Any PRs, fatigue notes...", text: $notes, axis: .vertical)
                            .lineLimit(2...5)
                            .focused($focusedTextField, equals: .notes)
                            .fieldStyle()
                            .onChange(of: notes) { _, _ in scheduleSave() }
                    }
                }
                .padding(16)
            }
            .navigationTitle(pageTitle)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedTextField = nil
                        focusedBuilderField = nil
                    }
                }
            }
        }
        .onAppear(perform: loadInitialState)
        .onChange(of: store.pendingTemplate) { _, template in
            guard let template else { return }
            applyTemplate(template, replace: !isActive)
            store.pendingTemplate = nil
        }
        .onChange(of: store.editingLog) { _, log in
            guard let log else { return }
            load(log: log, editing: true)
            store.editingLog = nil
        }
        .onDisappear {
            restAlertTask?.cancel()
        }
        .alert(isEditing ? "Cancel Editing?" : "Discard Workout?", isPresented: $showDiscardConfirm) {
            Button(isEditing ? "Keep Editing" : "Keep Going", role: .cancel) {}
            Button(isEditing ? "Cancel Edit" : "Discard Workout", role: .destructive) {
                Task { await discardWorkout() }
            }
        } message: {
            Text(isEditing ? "Discard your changes and go back?" : isPlanningMode ? "Discard this workout plan?" : "This will delete the in-progress workout. This cannot be undone.")
        }
        .sheet(item: $finishSummary) { summary in
            WorkoutCompleteSheet(summary: summary, workoutName: name) {
                finishSummary = nil
                resetWorkout()
            }
        }
    }

    private var activeHeader: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if isActive, let startTime, !isEditing {
                    TimelineView(.periodic(from: Date(), by: 30)) { _ in
                        Label("In progress · \(formatDuration(startTime: startTime))", systemImage: "clock")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    }
                } else {
                    Label(isEditing ? "Editing saved workout" : "Planning workout", systemImage: isEditing ? "pencil" : "list.clipboard")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 8) {
                if isActive {
                    Button {
                        showDiscardConfirm = true
                    } label: {
                        Label(isEditing ? "Cancel" : isPlanningMode ? "Discard Plan" : "Discard", systemImage: "xmark")
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .buttonStyle(SecondaryButtonStyle(compact: true))
                    .disabled(isSaving)
                }

                if isActive, !items.isEmpty, isPlanningMode {
                    Button {
                        startWorkout()
                    } label: {
                        Label("Start Workout", systemImage: "checkmark")
                    }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else if isActive, !items.isEmpty {
                    Button {
                        Task { await finishWorkout() }
                    } label: {
                        Label(isSaving ? "Saving..." : isEditing ? "Save Changes" : "Finish Workout", systemImage: "checkmark")
                    }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
        }
    }

    private var workoutFields: some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                FormLabel(text: "Workout Name")
                TextField("e.g. Monday Push Day", text: $name)
                    .focused($focusedTextField, equals: .name)
                    .fieldStyle()
                    .onChange(of: name) { _, _ in scheduleSave() }
            }

            VStack(alignment: .leading, spacing: 6) {
                FormLabel(text: "Date")
                DatePicker("", selection: $date, displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fieldStyle()
                    .onChange(of: date) { _, _ in scheduleSave() }
            }
        }
    }

    @ViewBuilder
    private var templateMenu: some View {
        if !store.templates.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                FormLabel(text: isActive ? "Add from Template" : "Start from Template")
                Menu {
                    ForEach(store.templates) { template in
                        Button(template.name) {
                            applyTemplate(template, replace: !isActive)
                        }
                    }
                } label: {
                    Label(isActive ? "Add exercises from template..." : "Select a template...", systemImage: "clipboard")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    private func loadInitialState() {
        if let editing = store.editingLog {
            load(log: editing, editing: true)
            store.editingLog = nil
            return
        }
        if let active = store.activeWorkout(), workoutId == nil {
            load(log: active, editing: false)
        }
        if let template = store.pendingTemplate, workoutId == nil {
            applyTemplate(template, replace: true)
            store.pendingTemplate = nil
        }
    }

    private func load(log: WorkoutLog, editing: Bool) {
        workoutId = log.id
        name = log.name
        date = DateHelpers.date(from: log.date)
        notes = log.notes ?? ""
        items = log.exerciseItems
        startTime = log.startTime
        isEditing = editing
    }

    private func builderChanged() {
        if workoutId == nil, !items.isEmpty {
            workoutId = UUID().uuidString
            Task { await persist(status: "planning") }
        } else {
            scheduleSave()
        }
    }

    private func scheduleSave() {
        guard workoutId != nil else { return }
        Task { await persist(status: currentStatus()) }
    }

    private func startWorkout() {
        guard workoutId != nil else { return }
        promotePlanningRepsToPlaceholders()
        startTime = ISO8601DateFormatter().string(from: Date())
        Task { await persist(status: "active") }
    }

    private func finishWorkout() async {
        guard let workoutId, !isSaving else { return }
        isSaving = true
        defer { isSaving = false }

        do {
            let endTime = isEditing ? nil : ISO8601DateFormatter().string(from: Date())
            var pbExerciseIds: [String] = []

            for item in items {
                let maxWeight = item.sets
                    .compactMap { Double($0.weight ?? "") }
                    .max() ?? 0
                guard maxWeight > 0, var exercise = store.exercise(id: item.exerciseId) else { continue }
                let currentPB = Double(exercise.personalBest?.weight ?? "") ?? 0
                if maxWeight > currentPB {
                    pbExerciseIds.append(item.exerciseId)
                    exercise.personalBest = PersonalBest(weight: cleanWeight(maxWeight), date: DateHelpers.dayString(from: date))
                    try await store.saveExercise(exercise)
                }
            }

            let log = WorkoutLog(
                id: workoutId,
                name: name,
                date: DateHelpers.dayString(from: date),
                notes: notes,
                exerciseItems: items,
                startTime: startTime,
                endTime: isEditing ? store.logs.first(where: { $0.id == workoutId })?.endTime : endTime,
                status: "finished",
                hasPB: !pbExerciseIds.isEmpty,
                pbExerciseIds: pbExerciseIds
            )
            try await store.saveLog(log)

            if isEditing {
                resetWorkout()
            } else {
                finishSummary = FinishSummary(
                    duration: formatDuration(startTime: startTime, endTime: endTime),
                    exerciseCount: items.count,
                    setCount: items.reduce(0) { $0 + $1.sets.count },
                    pbExercises: pbExerciseIds.compactMap { store.exercise(id: $0)?.name }
                )
            }
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }

    private func discardWorkout() async {
        guard let id = workoutId else { return }
        isSaving = true
        defer { isSaving = false }

        do {
            if !isEditing {
                try await store.deleteLog(id)
            }
            resetWorkout()
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }

    private func persist(status: String) async {
        guard let workoutId else { return }
        do {
            let log = WorkoutLog(
                id: workoutId,
                name: name,
                date: DateHelpers.dayString(from: date),
                notes: notes,
                exerciseItems: items,
                startTime: startTime,
                status: status
            )
            try await store.saveLog(log)
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }

    private func currentStatus() -> String {
        if isEditing { return "finished" }
        return startTime == nil ? "planning" : "active"
    }

    private func promotePlanningRepsToPlaceholders() {
        for itemIndex in items.indices {
            for setIndex in items[itemIndex].sets.indices {
                let plannedReps = (items[itemIndex].sets[setIndex].reps ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !plannedReps.isEmpty else { continue }
                if let repsContext = RepsFieldPlaceholder(rawValue: items[itemIndex].sets[setIndex].placeholderReps ?? ""),
                   let mergedPlaceholder = repsContext.rawValue(usingGoal: plannedReps) {
                    items[itemIndex].sets[setIndex].placeholderReps = mergedPlaceholder
                } else {
                    items[itemIndex].sets[setIndex].placeholderReps = plannedReps
                }
                items[itemIndex].sets[setIndex].reps = ""
            }
        }
    }

    private func applyTemplate(_ template: WorkoutTemplate, replace: Bool) {
        let existingIds = Set(replace ? [] : items.map(\.exerciseId))
        let templateItems = template.exerciseItems
            .filter { !existingIds.contains($0.exerciseId) }
            .map { item in prepopulated(item) }

        guard !templateItems.isEmpty else { return }
        if replace {
            name = template.name
            items = templateItems
            workoutId = UUID().uuidString
            startTime = nil
        } else {
            if name.isEmpty { name = template.name }
            items.append(contentsOf: templateItems)
            if workoutId == nil {
                workoutId = UUID().uuidString
            }
        }
        Task { await persist(status: "planning") }
    }

    private func prepopulated(_ item: ExerciseItem) -> ExerciseItem {
        let last = lastFinishedItem(for: item.exerciseId)
        let sets = item.sets.enumerated().map { offset, set in
            let targetReps = set.reps?.isEmpty == false ? set.reps ?? String(store.settings.defaultReps) : String(store.settings.defaultReps)
            if let last, last.sets.indices.contains(offset) {
                let lastReps = last.sets[offset].reps?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                return WorkoutSet(
                    reps: "",
                    weight: "",
                    placeholderReps: lastReps.isEmpty ? targetReps : "\(lastReps) (\(targetReps))",
                    placeholderWeight: last.sets[offset].weight
                )
            }
            return WorkoutSet(reps: "", weight: "", placeholderReps: targetReps, placeholderWeight: "")
        }
        return ExerciseItem(
            exerciseId: item.exerciseId,
            weightType: item.weightType ?? last?.weightType ?? "weight",
            restTargetSeconds: item.restTargetSeconds,
            supersetGroup: item.supersetGroup,
            sets: sets
        )
    }

    private func lastFinishedItem(for exerciseId: String) -> ExerciseItem? {
        let finished = store.logs
            .filter { $0.status == "finished" }
            .sorted { $0.date > $1.date }
        for log in finished {
            if let item = log.exerciseItems.first(where: { $0.exerciseId == exerciseId }) {
                return item
            }
        }
        return nil
    }

    private func markSetCompleted(exerciseIndex: Int, setIndex: Int) {
        guard items.indices.contains(exerciseIndex),
              items[exerciseIndex].sets.indices.contains(setIndex),
              items[exerciseIndex].sets[setIndex].restStartTime == nil,
              items[exerciseIndex].sets[setIndex].restDuration == nil
        else { return }

        let now = Date().timeIntervalSince1970 * 1000
        for exIndex in items.indices {
            for currentSetIndex in items[exIndex].sets.indices {
                if exIndex == exerciseIndex, currentSetIndex == setIndex {
                    items[exIndex].sets[currentSetIndex].restStartTime = now
                } else if let start = items[exIndex].sets[currentSetIndex].restStartTime,
                          items[exIndex].sets[currentSetIndex].restDuration == nil {
                    items[exIndex].sets[currentSetIndex].restDuration = Int((now - start) / 1000)
                    items[exIndex].sets[currentSetIndex].restStartTime = nil
                }
            }
        }

        var nextExercise = exerciseIndex
        var nextSet = setIndex + 1
        if nextSet >= items[exerciseIndex].sets.count {
            nextExercise = exerciseIndex + 1
            nextSet = 0
        }
        if items.indices.contains(nextExercise) {
            activeExerciseIndex = nextExercise
            activeSetIndex = nextSet
        }
        scheduleRestAlert(exerciseIndex: exerciseIndex, setIndex: setIndex, startTime: now)
        scheduleSave()
    }

    private func scheduleRestAlert(exerciseIndex: Int, setIndex: Int, startTime: Double) {
        restAlertTask?.cancel()
        guard items.indices.contains(exerciseIndex),
              items[exerciseIndex].sets.indices.contains(setIndex),
              let targetSeconds = items[exerciseIndex].restTargetSeconds,
              targetSeconds > 0
        else { return }

        let exerciseName = store.exercise(id: items[exerciseIndex].exerciseId)?.name ?? "Exercise"
        restAlertTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(targetSeconds) * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard items.indices.contains(exerciseIndex),
                      items[exerciseIndex].sets.indices.contains(setIndex),
                      items[exerciseIndex].sets[setIndex].restStartTime == startTime,
                      items[exerciseIndex].sets[setIndex].restDuration == nil
                else { return }

                let alert = RestTargetAlert(message: "\(exerciseName) set \(setIndex + 1) rest target reached.")
                restAlert = alert
                Task {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    await MainActor.run {
                        if restAlert?.id == alert.id {
                            restAlert = nil
                        }
                    }
                }
            }
        }
    }

    private func resetWorkout() {
        restAlertTask?.cancel()
        restAlert = nil
        workoutId = nil
        name = ""
        date = Date()
        notes = ""
        items = []
        startTime = nil
        activeExerciseIndex = 0
        activeSetIndex = 0
        isEditing = false
    }

    private func cleanWeight(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
    }
}

struct FinishSummary: Identifiable {
    let id = UUID()
    let duration: String
    let exerciseCount: Int
    let setCount: Int
    let pbExercises: [String]
}

struct RestTargetAlert: Identifiable {
    let id = UUID()
    let message: String
}

private struct RestTargetBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "timer")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(Theme.text)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.accent.opacity(0.09))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.accent.opacity(0.32), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

private struct WorkoutCompleteSheet: View {
    let summary: FinishSummary
    let workoutName: String
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Circle()
                .fill(Theme.surface)
                .frame(width: 80, height: 80)
                .overlay(
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(Theme.accent)
                )

            VStack(spacing: 8) {
                Text("Great job!")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Theme.text)
                Text("\(workoutName) - \(summary.duration)")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.text)
                Text("\(summary.exerciseCount) exercises · \(summary.setCount) total sets")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }

            if !summary.pbExercises.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label("New Personal Bests!", systemImage: "trophy.fill")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.accent)
                    ForEach(summary.pbExercises, id: \.self) { name in
                        Text(name)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.text)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.accent.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                        .stroke(Theme.accent.opacity(0.2), lineWidth: 1)
                )
            }

            Button("Done", action: onDone)
                .buttonStyle(PrimaryButtonStyle())

            Spacer()
        }
        .padding(24)
        .presentationDetents([.medium])
    }
}
