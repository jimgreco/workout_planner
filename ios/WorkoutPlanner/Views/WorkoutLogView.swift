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
    private var shouldShowLiveActivityCard: Bool {
        isActive && startTime != nil && !isEditing && !items.isEmpty
    }
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
                    if shouldShowLiveActivityCard {
                        liveActivityCard
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
                        onResetPersonalBest: (!isEditing && startTime != nil) ? resetPersonalBest : nil,
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

    private var liveActivityCard: some View {
        WorkoutLiveActivityCard(
            items: items,
            exercises: store.exercises,
            startTime: startTime,
            activeExerciseIndex: activeExerciseIndex,
            activeSetIndex: activeSetIndex
        )
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
        let nextSet = firstOpenSet(in: log.exerciseItems)
        activeExerciseIndex = nextSet.exerciseIndex
        activeSetIndex = nextSet.setIndex
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

    private func resetPersonalBest(_ exercise: Exercise) {
        guard !isPlanningMode, !isEditing, exercise.personalBest != nil else { return }
        Task {
            do {
                var updated = exercise
                updated.personalBest = nil
                try await store.saveExercise(updated)
            } catch {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func finishWorkout() async {
        guard let workoutId, !isSaving else { return }
        isSaving = true
        defer { isSaving = false }

        do {
            let endTime = isEditing ? nil : ISO8601DateFormatter().string(from: Date())
            var pbExerciseIds: [String] = []
            var pbExercises: [String] = []

            for item in items {
                let candidate = bestPersonalBestCandidate(from: item.sets, weightType: item.weightType)
                guard var exercise = store.exercise(id: item.exerciseId),
                      isPersonalBestImprovement(candidate, over: exercise.personalBest),
                      let candidate
                else { continue }
                let personalBest = personalBestPayload(candidate, date: DateHelpers.dayString(from: date))
                pbExerciseIds.append(item.exerciseId)
                pbExercises.append("\(exercise.name) - \(personalBestLabel(personalBest) ?? candidate.weight)")
                exercise.personalBest = personalBest
                try await store.saveExercise(exercise)
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
                    pbExercises: pbExercises
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

    private func firstOpenSet(in workoutItems: [ExerciseItem]) -> (exerciseIndex: Int, setIndex: Int) {
        for itemIndex in workoutItems.indices {
            for setIndex in workoutItems[itemIndex].sets.indices {
                let set = workoutItems[itemIndex].sets[setIndex]
                if set.restStartTime == nil && set.restDuration == nil {
                    return (itemIndex, setIndex)
                }
            }
        }
        return (0, 0)
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

private struct WorkoutLiveActivityCard: View {
    let items: [ExerciseItem]
    let exercises: [Exercise]
    let startTime: String?
    let activeExerciseIndex: Int
    let activeSetIndex: Int

    private var totalSets: Int {
        items.reduce(0) { $0 + $1.sets.count }
    }

    private var completedSets: Int {
        items.reduce(0) { count, item in
            count + item.sets.filter(isCompleted).count
        }
    }

    private var isWorkoutComplete: Bool {
        totalSets > 0 && completedSets >= totalSets
    }

    private var currentContext: WorkoutLiveSetContext? {
        if let explicit = context(exerciseIndex: activeExerciseIndex, setIndex: activeSetIndex),
           !isCompleted(explicit.set) {
            return explicit
        }

        for itemIndex in items.indices {
            for setIndex in items[itemIndex].sets.indices {
                if let context = context(exerciseIndex: itemIndex, setIndex: setIndex),
                   !isCompleted(context.set) {
                    return context
                }
            }
        }
        return nil
    }

    private var restingContext: WorkoutLiveSetContext? {
        for itemIndex in items.indices {
            for setIndex in items[itemIndex].sets.indices {
                guard let context = context(exerciseIndex: itemIndex, setIndex: setIndex),
                      context.set.restStartTime != nil,
                      context.set.restDuration == nil
                else { continue }
                return context
            }
        }
        return nil
    }

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { _ in
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 10) {
                    Label("Live", systemImage: "bolt.fill")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Theme.accent)

                    Spacer()

                    if let startTime {
                        Label(formatDuration(startTime: startTime), systemImage: "clock")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                            .monospacedDigit()
                    }
                }

                if let restingContext {
                    restSection(restingContext)
                }

                if restingContext != nil {
                    Divider().opacity(0.25)
                }

                if isWorkoutComplete {
                    completionSection
                } else if let currentContext {
                    currentSetSection(currentContext, isUpNext: restingContext != nil)
                }

                ProgressView(value: Double(completedSets), total: Double(max(totalSets, 1)))
                    .tint(isWorkoutComplete ? Theme.success : Theme.accent)

                HStack {
                    Text("\(completedSets) of \(totalSets) sets logged")
                    Spacer()
                    Text("\(items.count) \(items.count == 1 ? "exercise" : "exercises")")
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(
                    colors: [Theme.accent.opacity(0.11), Theme.background],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.accent.opacity(0.28), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .shadow(color: .black.opacity(0.07), radius: 8, x: 0, y: 3)
        }
    }

    private func restSection(_ context: WorkoutLiveSetContext) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "timer")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(restTint(for: context))
                .frame(width: 34, height: 34)
                .background(restTint(for: context).opacity(0.12))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text("Resting after \(context.exercise.name)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(restTimeText(startTime: context.set.restStartTime, duration: context.set.restDuration, targetSeconds: context.item.restTargetSeconds))
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                        .foregroundStyle(restTint(for: context))
                        .monospacedDigit()

                    Text("Set \(context.setIndex + 1)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.muted)
                }
            }

            Spacer()

            if let targetSeconds = context.item.restTargetSeconds, targetSeconds > 0 {
                Text(restTargetLabel(targetSeconds))
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(Theme.text)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(Theme.background.opacity(0.72))
                    .clipShape(Capsule())
            }
        }
    }

    private var completionSection: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(Theme.success)

            VStack(alignment: .leading, spacing: 3) {
                Text("All sets logged")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundStyle(Theme.text)

                Text("Ready to finish when notes look good.")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private func currentSetSection(_ context: WorkoutLiveSetContext, isUpNext: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(isUpNext ? "Up next" : "Current set")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(context.exercise.name)
                        .font(.system(size: 22, weight: .heavy))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)

                    Badge(text: context.exercise.muscleGroup)
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8)], alignment: .leading, spacing: 8) {
                WorkoutLiveMetric(title: "Set", value: "\(context.setIndex + 1) / \(context.item.sets.count)")
                if let reps = repsLabel(for: context.set) {
                    WorkoutLiveMetric(title: "Reps", value: reps)
                }
                if let weight = weightLabel(for: context) {
                    WorkoutLiveMetric(title: "Weight", value: weight)
                }
                WorkoutLiveMetric(title: "Type", value: setTypeLabel(context.set.setType))
                if let effort = effortLabel(for: context.set) {
                    WorkoutLiveMetric(title: "Effort", value: effort)
                }
            }

            if let personalBest = personalBestLabel(context.exercise.personalBest) {
                Label("PB \(personalBest)", systemImage: "star.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
        }
    }

    private func context(exerciseIndex: Int, setIndex: Int) -> WorkoutLiveSetContext? {
        guard items.indices.contains(exerciseIndex),
              items[exerciseIndex].sets.indices.contains(setIndex),
              let exercise = exercises.first(where: { $0.id == items[exerciseIndex].exerciseId })
        else { return nil }

        return WorkoutLiveSetContext(
            exercise: exercise,
            item: items[exerciseIndex],
            set: items[exerciseIndex].sets[setIndex],
            exerciseIndex: exerciseIndex,
            setIndex: setIndex
        )
    }

    private func isCompleted(_ set: WorkoutSet) -> Bool {
        set.restStartTime != nil || set.restDuration != nil
    }

    private func repsLabel(for set: WorkoutSet) -> String? {
        let reps = cleaned(set.reps)
        if let reps { return reps }
        guard let placeholder = cleaned(set.placeholderReps) else { return nil }
        if let context = RepsFieldPlaceholder(rawValue: placeholder) {
            if let goal = context.goal { return goal }
            return context.last
        }
        return placeholder
    }

    private func weightLabel(for context: WorkoutLiveSetContext) -> String? {
        guard context.item.weightType != "none" else { return nil }
        guard let weight = cleaned(context.set.weight) ?? cleaned(context.set.placeholderWeight) else { return nil }
        if context.item.weightType == "bar_double" { return "\(weight) lb each + bar" }
        return context.item.weightType == "double" ? "\(weight) lb each" : "\(weight) lb"
    }

    private func effortLabel(for set: WorkoutSet) -> String? {
        let effort = [
            cleaned(set.rpe).map { "RPE \($0)" },
            cleaned(set.rir).map { "RIR \($0)" },
        ].compactMap { $0 }.joined(separator: " · ")
        return effort.isEmpty ? nil : effort
    }

    private func restTint(for context: WorkoutLiveSetContext) -> Color {
        guard let targetSeconds = context.item.restTargetSeconds,
              targetSeconds > 0,
              let startTime = context.set.restStartTime
        else { return Theme.success }

        let elapsed = max(0, Int((Date().timeIntervalSince1970 * 1000 - startTime) / 1000))
        return elapsed >= targetSeconds ? Theme.danger : Theme.accent
    }

    private func cleaned(_ value: String?) -> String? {
        let text = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? nil : text
    }
}

private struct WorkoutLiveSetContext {
    let exercise: Exercise
    let item: ExerciseItem
    let set: WorkoutSet
    let exerciseIndex: Int
    let setIndex: Int
}

private struct WorkoutLiveMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)

            Text(value)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.76)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.background.opacity(0.68))
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
