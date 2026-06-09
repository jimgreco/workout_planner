import SwiftUI

private let workoutAutosaveDelayNanoseconds: UInt64 = 800_000_000
private let workoutLiveActivityUpdateDelayNanoseconds: UInt64 = 250_000_000

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
    @State private var saveTask: Task<Void, Never>?
    @State private var saveGeneration = 0
    @State private var hasPendingTextCommit = false
    @State private var hasPendingBuilderCommit = false
    @State private var liveActivityUpdateTask: Task<Void, Never>?
    @State private var liveActivityUpdateGeneration = 0
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
    private var activeProgramWorkouts: [WorkoutProgramStart] {
        store.programs
            .filter { $0.active == true }
            .compactMap { nextProgramWorkout(program: $0) }
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
                    programMenu
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
                        defaultRestTargetSeconds: store.settings.defaultRestTargetSeconds,
                        activeExerciseIndex: activeExerciseIndex,
                        activeSetIndex: activeSetIndex,
                        planningMode: isPlanningMode,
                        onSetCompleted: markSetCompleted,
                        onResetPersonalBest: (!isEditing && startTime != nil) ? resetPersonalBest : nil,
                        onChanged: builderChanged,
                        onTextChanged: builderTextChanged,
                        onEditingDone: commitBuilderFieldsIfNeeded
                    )

                    Divider().opacity(0.3)

                    VStack(alignment: .leading, spacing: 6) {
                        FormLabel(text: "Session Notes")
                        TextField("How did it go? Any PRs, fatigue notes...", text: $notes, axis: .vertical)
                            .lineLimit(2...5)
                            .focused($focusedTextField, equals: .notes)
                            .fieldStyle()
                            .onChange(of: notes) { _, _ in hasPendingTextCommit = true }
                    }
                }
                .padding(16)
            }
            .navigationTitle(pageTitle)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .keyboard) {
                    KeyboardDoneToolbar {
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
            flushScheduledSave()
            updateExternalLiveActivityNow()
        }
        .onChange(of: workoutId) { _, _ in updateExternalLiveActivity() }
        .onChange(of: startTime) { _, _ in updateExternalLiveActivity() }
        .onChange(of: activeExerciseIndex) { _, _ in updateExternalLiveActivity() }
        .onChange(of: activeSetIndex) { _, _ in updateExternalLiveActivity() }
        .onChange(of: store.exercises) { _, _ in updateExternalLiveActivity() }
        .onChange(of: focusedTextField) { oldValue, newValue in
            if oldValue != nil, newValue != oldValue {
                commitTextFieldsIfNeeded()
            }
        }
        .onChange(of: focusedBuilderField) { oldValue, newValue in
            if oldValue != nil, newValue != oldValue {
                commitBuilderFieldsIfNeeded()
            }
            if let newValue {
                clearBuilderFieldForEntry(newValue)
            }
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
            items: $items,
            exercises: store.exercises,
            startTime: startTime,
            activeExerciseIndex: $activeExerciseIndex,
            activeSetIndex: $activeSetIndex,
            focusedField: $focusedBuilderField,
            onSetCompleted: markSetCompleted,
            onEndRest: endRest,
            onExtendRest: extendRest,
            onChanged: liveCardChanged,
            onTextChanged: builderTextChanged
        )
    }

    private var workoutFields: some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                FormLabel(text: "Workout Name")
                TextField("e.g. Monday Push Day", text: $name)
                    .focused($focusedTextField, equals: .name)
                    .fieldStyle()
                    .onChange(of: name) { _, _ in hasPendingTextCommit = true }
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
    private var programMenu: some View {
        if !isActive, !activeProgramWorkouts.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                FormLabel(text: "Start from Active Program")
                Menu {
                    ForEach(activeProgramWorkouts) { workout in
                        Button("\(workout.program.name) - \(displayProgramDate(workout.date)) - \(workout.template.name)") {
                            applyTemplate(workout.template, replace: true)
                        }
                    }
                } label: {
                    Label("Select a program workout...", systemImage: "target")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(SecondaryButtonStyle())
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
        scheduleExternalLiveActivityUpdate()
        if workoutId == nil, !items.isEmpty {
            workoutId = UUID().uuidString
            saveNow(status: "planning")
        } else {
            scheduleSave()
        }
    }

    private func builderTextChanged() {
        if workoutId == nil, !items.isEmpty {
            workoutId = UUID().uuidString
        }
        hasPendingBuilderCommit = true
    }

    private func commitTextFieldsIfNeeded() {
        guard hasPendingTextCommit else { return }
        hasPendingTextCommit = false
        scheduleExternalLiveActivityUpdate()
        scheduleSave()
    }

    private func commitBuilderFieldsIfNeeded() {
        guard hasPendingBuilderCommit else { return }
        hasPendingBuilderCommit = false
        builderChanged()
    }

    private func liveCardChanged() {
        scheduleExternalLiveActivityUpdate()
        scheduleSave()
        rescheduleRestAlertIfNeeded()
    }

    private func scheduleSave() {
        guard let log = logSnapshot(status: currentStatus()) else { return }
        saveTask?.cancel()
        saveGeneration += 1
        let generation = saveGeneration
        saveTask = Task {
            try? await Task.sleep(nanoseconds: workoutAutosaveDelayNanoseconds)
            guard !Task.isCancelled else { return }
            await persist(log)
            await MainActor.run {
                if saveGeneration == generation {
                    saveTask = nil
                }
            }
        }
    }

    private func startWorkout() {
        guard workoutId != nil else { return }
        promotePlanningRepsToPlaceholders()
        startTime = ISO8601DateFormatter().string(from: Date())
        updateExternalLiveActivityNow()
        saveNow(status: "active")
    }

    private func resetPersonalBest(_ exercise: Exercise) {
        guard !isPlanningMode, !isEditing, exercise.personalBest != nil else { return }
        Task {
            do {
                var updated = exercise
                updated.personalBest = nil
                try await store.saveExercise(updated)
            } catch {
                if !isCancellationError(error) {
                    store.errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func finishWorkout() async {
        guard let workoutId, !isSaving else { return }
        commitTextFieldsIfNeeded()
        commitBuilderFieldsIfNeeded()
        cancelScheduledSave()
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
                pbExercises.append("\(exercise.name) - \(personalBestLabel(personalBest, usesTime: exercise.usesTime == true) ?? candidate.weight)")
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
            WorkoutLiveActivityController.shared.end(
                workoutID: workoutId,
                finalState: liveActivityState(isCompleteOverride: true)
            )

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
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func discardWorkout() async {
        guard let id = workoutId else { return }
        hasPendingTextCommit = false
        hasPendingBuilderCommit = false
        cancelScheduledSave()
        isSaving = true
        defer { isSaving = false }

        do {
            if !isEditing {
                WorkoutLiveActivityController.shared.end(workoutID: id)
                try await store.deleteLog(id)
            }
            resetWorkout()
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func saveNow(status: String) {
        cancelScheduledSave()
        hasPendingTextCommit = false
        hasPendingBuilderCommit = false
        guard let log = logSnapshot(status: status) else { return }
        Task { await persist(log) }
    }

    private func flushScheduledSave() {
        commitTextFieldsIfNeeded()
        commitBuilderFieldsIfNeeded()
        guard saveTask != nil else { return }
        saveNow(status: currentStatus())
    }

    private func cancelScheduledSave() {
        saveGeneration += 1
        saveTask?.cancel()
        saveTask = nil
    }

    private func logSnapshot(status: String) -> WorkoutLog? {
        guard let workoutId else { return nil }
        return WorkoutLog(
            id: workoutId,
            name: name,
            date: DateHelpers.dayString(from: date),
            notes: notes,
            exerciseItems: items,
            startTime: startTime,
            status: status
        )
    }

    private func persist(_ log: WorkoutLog) async {
        do {
            try await store.saveLog(log)
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
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
        saveNow(status: "planning")
    }

    private func prepopulated(_ item: ExerciseItem) -> ExerciseItem {
        let last = lastFinishedItem(for: item.exerciseId)
        let sets = item.sets.enumerated().map { offset, set in
            let plannedReps = set.reps?.trimmingCharacters(in: .whitespacesAndNewlines)
            let placeholderReps = set.placeholderReps?.trimmingCharacters(in: .whitespacesAndNewlines)
            let targetReps = plannedReps?.isEmpty == false
                ? plannedReps ?? String(store.settings.defaultReps)
                : (placeholderReps?.isEmpty == false ? placeholderReps ?? String(store.settings.defaultReps) : String(store.settings.defaultReps))
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

    private func nextProgramWorkout(program: TrainingProgram) -> WorkoutProgramStart? {
        guard !program.schedule.isEmpty else { return nil }
        let templatesById = Dictionary(uniqueKeysWithValues: store.templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())

        for offset in 0..<14 {
            guard let date = Calendar.current.date(byAdding: .day, value: offset, to: today) else { continue }
            let weekday = Calendar.current.component(.weekday, from: date) - 1
            let scheduled = program.schedule
                .filter { $0.weekday == weekday }
                .compactMap { templatesById[$0.templateId] }
            for template in scheduled where !programWorkoutHandled(template: template, date: date) {
                return WorkoutProgramStart(program: program, template: template, date: date)
            }
        }
        return nil
    }

    private func programWorkoutHandled(template: WorkoutTemplate, date: Date) -> Bool {
        let day = DateHelpers.dayString(from: date)
        let templateName = template.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return store.logs.contains { log in
            log.date == day
                && (log.status == "finished" || log.status == "skipped")
                && log.name.trimmingCharacters(in: .whitespacesAndNewlines)
                    .caseInsensitiveCompare(templateName) == .orderedSame
        }
    }

    private func displayProgramDate(_ date: Date) -> String {
        let today = Calendar.current.startOfDay(for: Date())
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today) ?? today
        if Calendar.current.isDate(date, inSameDayAs: today) { return "Today" }
        if Calendar.current.isDate(date, inSameDayAs: tomorrow) { return "Tomorrow" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: date)
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
            focusedBuilderField = repsFocusField(itemIndex: nextExercise, setIndex: nextSet)
        }
        scheduleRestAlert(exerciseIndex: exerciseIndex, setIndex: setIndex, startTime: now)
        updateExternalLiveActivityNow()
        saveNow(status: currentStatus())
    }

    private func clearBuilderFieldForEntry(_ field: WorkoutBuilderFocusedField) {
        let itemIndex: Int
        let setIndex: Int
        switch field {
        case let .reps(i, s), let .repsLeft(i, s), let .repsRight(i, s), let .weight(i, s), let .rpe(i, s), let .rir(i, s):
            itemIndex = i
            setIndex = s
        }

        guard items.indices.contains(itemIndex), items[itemIndex].sets.indices.contains(setIndex) else { return }

        switch field {
        case .reps:
            guard items[itemIndex].sets[setIndex].reps?.isEmpty == false else { return }
            items[itemIndex].sets[setIndex].reps = ""
        case .repsLeft:
            guard items[itemIndex].sets[setIndex].repsLeft?.isEmpty == false else { return }
            items[itemIndex].sets[setIndex].repsLeft = ""
        case .repsRight:
            guard items[itemIndex].sets[setIndex].repsRight?.isEmpty == false else { return }
            items[itemIndex].sets[setIndex].repsRight = ""
        case .weight:
            guard items[itemIndex].sets[setIndex].weight?.isEmpty == false else { return }
            items[itemIndex].sets[setIndex].weight = ""
        case .rpe:
            guard items[itemIndex].sets[setIndex].rpe?.isEmpty == false else { return }
            items[itemIndex].sets[setIndex].rpe = ""
        case .rir:
            guard items[itemIndex].sets[setIndex].rir?.isEmpty == false else { return }
            items[itemIndex].sets[setIndex].rir = ""
        }
        hasPendingBuilderCommit = true
    }

    private func repsFocusField(itemIndex: Int, setIndex: Int) -> WorkoutBuilderFocusedField {
        if items.indices.contains(itemIndex),
           let exercise = store.exercise(id: items[itemIndex].exerciseId),
           exercise.isUnilateral == true {
            return .repsLeft(itemIndex: itemIndex, setIndex: setIndex)
        }
        return .reps(itemIndex: itemIndex, setIndex: setIndex)
    }

    private func endRest(exerciseIndex: Int, setIndex: Int) {
        guard items.indices.contains(exerciseIndex),
              items[exerciseIndex].sets.indices.contains(setIndex),
              let start = items[exerciseIndex].sets[setIndex].restStartTime,
              items[exerciseIndex].sets[setIndex].restDuration == nil
        else { return }

        let now = Date().timeIntervalSince1970 * 1000
        items[exerciseIndex].sets[setIndex].restDuration = max(0, Int((now - start) / 1000))
        items[exerciseIndex].sets[setIndex].restStartTime = nil
        restAlertTask?.cancel()
        restAlert = nil
        updateExternalLiveActivityNow()
        saveNow(status: currentStatus())
    }

    private func extendRest(exerciseIndex: Int, setIndex: Int, seconds: Int = 30) {
        guard items.indices.contains(exerciseIndex),
              items[exerciseIndex].sets.indices.contains(setIndex),
              let start = items[exerciseIndex].sets[setIndex].restStartTime,
              items[exerciseIndex].sets[setIndex].restDuration == nil
        else { return }

        let elapsed = max(0, Int((Date().timeIntervalSince1970 * 1000 - start) / 1000))
        let currentTarget = items[exerciseIndex].sets[setIndex].restTargetSeconds ?? items[exerciseIndex].restTargetSeconds ?? 0
        items[exerciseIndex].sets[setIndex].restTargetSeconds = min(3600, max(currentTarget, elapsed) + seconds)
        restAlert = nil
        scheduleRestAlert(exerciseIndex: exerciseIndex, setIndex: setIndex, startTime: start)
        updateExternalLiveActivityNow()
        saveNow(status: currentStatus())
    }

    private func scheduleExternalLiveActivityUpdate() {
        liveActivityUpdateTask?.cancel()
        liveActivityUpdateGeneration += 1
        let generation = liveActivityUpdateGeneration
        liveActivityUpdateTask = Task {
            try? await Task.sleep(nanoseconds: workoutLiveActivityUpdateDelayNanoseconds)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                updateExternalLiveActivity()
                if liveActivityUpdateGeneration == generation {
                    liveActivityUpdateTask = nil
                }
            }
        }
    }

    private func updateExternalLiveActivityNow() {
        liveActivityUpdateGeneration += 1
        liveActivityUpdateTask?.cancel()
        liveActivityUpdateTask = nil
        updateExternalLiveActivity()
    }

    private func updateExternalLiveActivity() {
        guard shouldShowLiveActivityCard else {
            WorkoutLiveActivityController.shared.end(workoutID: workoutId)
            return
        }
        WorkoutLiveActivityController.shared.update(workoutID: workoutId, state: liveActivityState())
    }

    private func liveActivityState(isCompleteOverride: Bool = false) -> WorkoutLiveActivityAttributes.ContentState? {
        guard let context = liveContext,
              let workoutId,
              !workoutId.isEmpty
        else { return nil }
        let resting = liveRestingContext
        let total = liveTotalSets
        let completed = liveCompletedSets
        let startedAt = startTime.flatMap { ISO8601DateFormatter().date(from: $0) }
        let restStartedAt = resting?.set.restStartTime.map { Date(timeIntervalSince1970: $0 / 1000) }
        let restTargetSeconds = resting?.set.restTargetSeconds ?? resting?.item.restTargetSeconds
        let restTargetEnd = restStartedAt.flatMap { start in
            restTargetSeconds.map { start.addingTimeInterval(TimeInterval($0)) }
        }

        return WorkoutLiveActivityAttributes.ContentState(
            workoutName: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Workout" : name,
            exerciseName: context.exercise.name,
            muscleGroup: context.exercise.muscleGroup,
            setLabel: "\(context.setIndex + 1)/\(context.item.sets.count)",
            reps: liveRepsLabel(for: context.set) ?? "-",
            weight: liveWeightLabel(for: context) ?? "",
            setType: setTypeLabel(context.set.setType),
            personalBest: personalBestLabel(context.exercise.personalBest, usesTime: context.exercise.usesTime == true),
            completedSets: completed,
            totalSets: total,
            exerciseCount: items.count,
            startedAt: startedAt,
            restStartedAt: restStartedAt,
            restTargetEnd: restTargetEnd,
            restTargetSeconds: restTargetSeconds,
            restExerciseName: resting?.exercise.name,
            isComplete: isCompleteOverride || (total > 0 && completed >= total)
        )
    }

    private var liveTotalSets: Int {
        items.reduce(0) { $0 + $1.sets.count }
    }

    private var liveCompletedSets: Int {
        items.reduce(0) { count, item in
            count + item.sets.filter { $0.restStartTime != nil || $0.restDuration != nil }.count
        }
    }

    private var liveContext: WorkoutLiveSetContext? {
        if let explicit = liveContext(exerciseIndex: activeExerciseIndex, setIndex: activeSetIndex) {
            return explicit
        }

        for itemIndex in items.indices {
            for setIndex in items[itemIndex].sets.indices {
                if let context = liveContext(exerciseIndex: itemIndex, setIndex: setIndex),
                   context.set.restStartTime == nil,
                   context.set.restDuration == nil {
                    return context
                }
            }
        }
        return liveContext(exerciseIndex: 0, setIndex: 0)
    }

    private var liveRestingContext: WorkoutLiveSetContext? {
        for itemIndex in items.indices {
            for setIndex in items[itemIndex].sets.indices {
                guard let context = liveContext(exerciseIndex: itemIndex, setIndex: setIndex),
                      context.set.restStartTime != nil,
                      context.set.restDuration == nil
                else { continue }
                return context
            }
        }
        return nil
    }

    private func liveContext(exerciseIndex: Int, setIndex: Int) -> WorkoutLiveSetContext? {
        guard items.indices.contains(exerciseIndex),
              items[exerciseIndex].sets.indices.contains(setIndex),
              let exercise = store.exercise(id: items[exerciseIndex].exerciseId)
        else { return nil }

        return WorkoutLiveSetContext(
            exercise: exercise,
            item: items[exerciseIndex],
            set: items[exerciseIndex].sets[setIndex],
            exerciseIndex: exerciseIndex,
            setIndex: setIndex
        )
    }

    private func liveWeightLabel(for context: WorkoutLiveSetContext) -> String? {
        guard context.item.weightType != "none" else { return nil }
        let weight = (context.set.weight?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
            ?? (context.set.placeholderWeight?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
        guard let weight else { return nil }
        if context.item.weightType == "bar_double" { return "\(weight) + bar" }
        return context.item.weightType == "double" ? "\(weight) each" : "\(weight) lb"
    }

    private func liveRepsLabel(for set: WorkoutSet) -> String? {
        let reps = set.reps?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let reps, !reps.isEmpty { return reps }
        let placeholder = set.placeholderReps?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let placeholder, !placeholder.isEmpty else { return nil }
        if let context = RepsFieldPlaceholder(rawValue: placeholder) {
            if let goal = context.goal { return goal }
            return context.last
        }
        return placeholder
    }

    private func scheduleRestAlert(exerciseIndex: Int, setIndex: Int, startTime: Double) {
        restAlertTask?.cancel()
        guard items.indices.contains(exerciseIndex),
              items[exerciseIndex].sets.indices.contains(setIndex),
              let targetSeconds = items[exerciseIndex].sets[setIndex].restTargetSeconds ?? items[exerciseIndex].restTargetSeconds,
              targetSeconds > 0
        else { return }

        let elapsedSeconds = max(0, Int((Date().timeIntervalSince1970 * 1000 - startTime) / 1000))
        let waitSeconds = max(0, targetSeconds - elapsedSeconds)
        let exerciseName = store.exercise(id: items[exerciseIndex].exerciseId)?.name ?? "Exercise"
        restAlertTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(waitSeconds) * 1_000_000_000)
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

    private func rescheduleRestAlertIfNeeded() {
        guard let context = liveRestingContext,
              let startTime = context.set.restStartTime
        else { return }
        scheduleRestAlert(exerciseIndex: context.exerciseIndex, setIndex: context.setIndex, startTime: startTime)
    }

    private func resetWorkout() {
        restAlertTask?.cancel()
        cancelScheduledSave()
        liveActivityUpdateGeneration += 1
        liveActivityUpdateTask?.cancel()
        liveActivityUpdateTask = nil
        restAlert = nil
        WorkoutLiveActivityController.shared.end(workoutID: workoutId)
        hasPendingTextCommit = false
        hasPendingBuilderCommit = false
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

private let liveSetTypeOptions: [(label: String, value: String)] = [
    ("Working", "working"),
    ("Warmup", "warmup"),
    ("Drop", "drop"),
    ("Failure", "failure"),
]

private let liveWeightTypeOptions: [(label: String, value: String)] = [
    ("Weight", "weight"),
    ("2x weight", "double"),
    ("Bar + 2x", "bar_double"),
    ("No weight", "none"),
]

private let liveRestTargetOptions: [(label: String, seconds: Int?)] = [
    ("No target", nil),
    ("0:30", 30),
    ("1:00", 60),
    ("1:30", 90),
    ("2:00", 120),
    ("3:00", 180),
    ("5:00", 300),
]

private struct WorkoutLiveActivityCard: View {
    @Binding var items: [ExerciseItem]
    let exercises: [Exercise]
    let startTime: String?
    @Binding var activeExerciseIndex: Int
    @Binding var activeSetIndex: Int
    @FocusState.Binding var focusedField: WorkoutBuilderFocusedField?
    let onSetCompleted: (Int, Int) -> Void
    let onEndRest: (Int, Int) -> Void
    let onExtendRest: (Int, Int, Int) -> Void
    let onChanged: () -> Void
    let onTextChanged: () -> Void

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
        if let explicit = context(exerciseIndex: activeExerciseIndex, setIndex: activeSetIndex) {
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

    private var canMoveToPreviousSet: Bool {
        flatSetPositions.firstIndex(where: { $0.exerciseIndex == activeExerciseIndex && $0.setIndex == activeSetIndex })
            .map { $0 > 0 } ?? false
    }

    private var canMoveToNextSet: Bool {
        flatSetPositions.firstIndex(where: { $0.exerciseIndex == activeExerciseIndex && $0.setIndex == activeSetIndex })
            .map { $0 < flatSetPositions.count - 1 } ?? false
    }

    private var flatSetPositions: [(exerciseIndex: Int, setIndex: Int)] {
        items.indices.flatMap { exerciseIndex in
            items[exerciseIndex].sets.indices.map { setIndex in
                (exerciseIndex: exerciseIndex, setIndex: setIndex)
            }
        }
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

                if isWorkoutComplete, restingContext == nil {
                    completionSection
                } else if let currentContext,
                          items.indices.contains(currentContext.exerciseIndex),
                          items[currentContext.exerciseIndex].sets.indices.contains(currentContext.setIndex) {
                    currentSetSection(
                        currentContext,
                        set: $items[currentContext.exerciseIndex].sets[currentContext.setIndex],
                        isUpNext: restingContext != nil
                    )
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
        ViewThatFits(in: .horizontal) {
            restContent(context, stacked: false)
            restContent(context, stacked: true)
        }
    }

    private func restContent(_ context: WorkoutLiveSetContext, stacked: Bool) -> some View {
        let title = Text("Resting after \(context.exercise.name)")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.muted)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)

        return Group {
            if stacked {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .center, spacing: 12) {
                        restIcon(context)
                        VStack(alignment: .leading, spacing: 4) {
                            title
                            restClock(context)
                        }
                    }
                    HStack(spacing: 8) {
                        restTargetMenu(context)
                        extendRestButton(context)
                        endRestButton(context)
                    }
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    restIcon(context)
                    VStack(alignment: .leading, spacing: 4) {
                        title
                        restClock(context)
                    }
                    Spacer()
                    restTargetMenu(context)
                    extendRestButton(context)
                    endRestButton(context)
                }
            }
        }
    }

    private func restIcon(_ context: WorkoutLiveSetContext) -> some View {
        Image(systemName: "timer")
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(restTint(for: context))
            .frame(width: 34, height: 34)
            .background(restTint(for: context).opacity(0.12))
            .clipShape(Circle())
    }

    private func restClock(_ context: WorkoutLiveSetContext) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(restTimeText(startTime: context.set.restStartTime, duration: context.set.restDuration, targetSeconds: restTargetSeconds(for: context)))
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundStyle(restTint(for: context))
                .monospacedDigit()

            Text("Set \(context.setIndex + 1)")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.muted)
        }
    }

    private func endRestButton(_ context: WorkoutLiveSetContext) -> some View {
        Button {
            onEndRest(context.exerciseIndex, context.setIndex)
        } label: {
            Image(systemName: "forward.end.fill")
                .font(.system(size: 13, weight: .heavy))
                .frame(width: 34, height: 34)
                .background(Theme.background.opacity(0.78))
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("End rest")
    }

    private func extendRestButton(_ context: WorkoutLiveSetContext) -> some View {
        Button {
            onExtendRest(context.exerciseIndex, context.setIndex, 30)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .heavy))
                Text("30s")
                    .font(.system(size: 12, weight: .heavy))
                    .monospacedDigit()
            }
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 9)
            .frame(height: 30)
            .background(Theme.background.opacity(0.78))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add 30 seconds to rest")
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

    private func currentSetSection(_ context: WorkoutLiveSetContext, set: Binding<WorkoutSet>, isUpNext: Bool) -> some View {
        let showsWeight = context.item.weightType != "none"

        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(isCompleted(context.set) ? "Selected set" : isUpNext ? "Up next" : "Current set")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)

                ViewThatFits(in: .horizontal) {
                    currentSetHeaderContent(context, stacked: false)
                    currentSetHeaderContent(context, stacked: true)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                LazyVGrid(columns: liveFieldColumns(count: showsWeight ? 3 : 2), alignment: .leading, spacing: 8) {
                    WorkoutLiveInput(
                        title: context.exercise.usesTime == true ? "Secs" : "Reps",
                        text: stringBinding(set, \.reps),
                        placeholder: repsLabel(for: context.set) ?? "0",
                        keyboard: .numberPad
                    )
                    .focused($focusedField, equals: .reps(itemIndex: context.exerciseIndex, setIndex: context.setIndex))

                    if showsWeight {
                        WorkoutLiveInput(
                            title: "Weight",
                            text: stringBinding(set, \.weight),
                            placeholder: weightPlaceholder(for: context) ?? "0",
                            keyboard: .decimalPad
                        )
                        .focused($focusedField, equals: .weight(itemIndex: context.exerciseIndex, setIndex: context.setIndex))
                    }

                    weightTypeMenu(context)
                }
                .frame(maxWidth: .infinity)

                LazyVGrid(columns: liveFieldColumns(count: 3), alignment: .leading, spacing: 8) {
                    setTypeMenu(set: set)

                    WorkoutLiveInput(
                        title: "RPE",
                        text: stringBinding(set, \.rpe),
                        placeholder: "-",
                        keyboard: .decimalPad
                    )
                    .focused($focusedField, equals: .rpe(itemIndex: context.exerciseIndex, setIndex: context.setIndex))

                    WorkoutLiveInput(
                        title: "RIR",
                        text: stringBinding(set, \.rir),
                        placeholder: "-",
                        keyboard: .decimalPad
                    )
                    .focused($focusedField, equals: .rir(itemIndex: context.exerciseIndex, setIndex: context.setIndex))
                }
                .frame(maxWidth: .infinity)
            }

            if let personalBest = personalBestLabel(context.exercise.personalBest, usesTime: context.exercise.usesTime == true) {
                Label("PB \(personalBest)", systemImage: "star.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.accent)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                Button {
                    moveSelection(delta: -1)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 15, weight: .heavy))
                        .frame(width: 42, height: 42)
                }
                .buttonStyle(.plain)
                .background(Theme.surface)
                .clipShape(Circle())
                .disabled(!canMoveToPreviousSet)
                .opacity(canMoveToPreviousSet ? 1 : 0.45)
                .accessibilityLabel("Previous set")

                Button {
                    moveSelection(delta: 1)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .heavy))
                        .frame(width: 42, height: 42)
                }
                .buttonStyle(.plain)
                .background(Theme.surface)
                .clipShape(Circle())
                .disabled(!canMoveToNextSet)
                .opacity(canMoveToNextSet ? 1 : 0.45)
                .accessibilityLabel("Next set")

                Button {
                    onSetCompleted(context.exerciseIndex, context.setIndex)
                } label: {
                    Label(isCompleted(context.set) ? "Logged" : "Log Set", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle(compact: true))
                .disabled(isCompleted(context.set))
            }
        }
        .padding(14)
        .background(isUpNext ? Theme.accent.opacity(0.08) : Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(isUpNext ? Theme.accent.opacity(0.45) : Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private func currentSetHeaderContent(_ context: WorkoutLiveSetContext, stacked: Bool) -> some View {
        let badge = Text("\(context.setIndex + 1)/\(context.item.sets.count)")
            .font(.system(size: 14, weight: .heavy, design: .rounded))
            .foregroundStyle(Theme.accent)
            .monospacedDigit()
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Theme.accent.opacity(0.11))
            .clipShape(Capsule())
            .accessibilityLabel("Set \(context.setIndex + 1) of \(context.item.sets.count)")

        let title = Text(context.exercise.name)
            .font(.system(size: 22, weight: .heavy))
            .foregroundStyle(Theme.text)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)

        return Group {
            if stacked {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        badge
                        if !context.exercise.muscleGroup.isEmpty {
                            Badge(text: context.exercise.muscleGroup)
                        }
                    }
                    title
                    restTargetMenu(context)
                }
            } else {
                HStack(alignment: .center, spacing: 8) {
                    badge
                    title.layoutPriority(1)
                    if !context.exercise.muscleGroup.isEmpty {
                        Badge(text: context.exercise.muscleGroup)
                    }
                    Spacer(minLength: 4)
                    restTargetMenu(context)
                }
            }
        }
    }

    private func liveFieldColumns(count: Int) -> [GridItem] {
        Array(
            repeating: GridItem(.flexible(minimum: 0), spacing: 8, alignment: .top),
            count: max(1, count)
        )
    }

    private func setTypeMenu(set: Binding<WorkoutSet>) -> some View {
        Menu {
            ForEach(liveSetTypeOptions, id: \.value) { option in
                Button(option.label) {
                    set.wrappedValue.setType = option.value
                    onChanged()
                }
            }
        } label: {
            WorkoutLiveMenuMetric(title: "Set Type", value: setTypeLabel(set.wrappedValue.setType))
        }
        .buttonStyle(.plain)
    }

    private func weightTypeMenu(_ context: WorkoutLiveSetContext) -> some View {
        Menu {
            ForEach(liveWeightTypeOptions, id: \.value) { option in
                Button(option.label) {
                    guard items.indices.contains(context.exerciseIndex) else { return }
                    items[context.exerciseIndex].weightType = option.value
                    onChanged()
                }
            }
        } label: {
            WorkoutLiveMenuMetric(title: "Load", value: weightTypeLabel(context.item.weightType))
        }
        .buttonStyle(.plain)
    }

    private func restTargetMenu(_ context: WorkoutLiveSetContext) -> some View {
        Menu {
            ForEach(liveRestTargetOptions, id: \.label) { option in
                Button(option.label) {
                    guard items.indices.contains(context.exerciseIndex),
                          items[context.exerciseIndex].sets.indices.contains(context.setIndex)
                    else { return }
                    items[context.exerciseIndex].restTargetSeconds = option.seconds
                    if items[context.exerciseIndex].sets[context.setIndex].restStartTime != nil,
                       items[context.exerciseIndex].sets[context.setIndex].restDuration == nil {
                        items[context.exerciseIndex].sets[context.setIndex].restTargetSeconds = option.seconds
                    }
                    onChanged()
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "timer")
                    .font(.system(size: 11, weight: .bold))
                Text(restTargetLabel(restTargetSeconds(for: context)))
                    .font(.system(size: 12, weight: .heavy))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .heavy))
                    .foregroundStyle(Theme.muted.opacity(0.72))
            }
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 9)
            .frame(height: 30)
            .background(Theme.background.opacity(0.72))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Rest target")
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

    private func weightPlaceholder(for context: WorkoutLiveSetContext) -> String? {
        cleaned(context.set.placeholderWeight)
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

    private func weightTypeLabel(_ type: String?) -> String {
        switch type {
        case "double": return "2x weight"
        case "bar_double": return "Bar + 2x"
        case "none": return "No weight"
        default: return "Weight"
        }
    }

    private func restTargetSeconds(for context: WorkoutLiveSetContext) -> Int? {
        context.set.restTargetSeconds ?? context.item.restTargetSeconds
    }

    private func restTint(for context: WorkoutLiveSetContext) -> Color {
        guard let targetSeconds = restTargetSeconds(for: context),
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

    private func stringBinding(_ set: Binding<WorkoutSet>, _ keyPath: WritableKeyPath<WorkoutSet, String?>) -> Binding<String> {
        Binding(
            get: { set.wrappedValue[keyPath: keyPath] ?? "" },
            set: { value in
                set.wrappedValue[keyPath: keyPath] = value
                onTextChanged()
            }
        )
    }

    private func moveSelection(delta: Int) {
        guard let index = flatSetPositions.firstIndex(where: {
            $0.exerciseIndex == activeExerciseIndex && $0.setIndex == activeSetIndex
        }) else { return }
        let nextIndex = index + delta
        guard flatSetPositions.indices.contains(nextIndex) else { return }
        activeExerciseIndex = flatSetPositions[nextIndex].exerciseIndex
        activeSetIndex = flatSetPositions[nextIndex].setIndex
    }

}

private struct WorkoutLiveSetContext {
    let exercise: Exercise
    let item: ExerciseItem
    let set: WorkoutSet
    let exerciseIndex: Int
    let setIndex: Int
}

private struct WorkoutProgramStart: Identifiable {
    let program: TrainingProgram
    let template: WorkoutTemplate
    let date: Date

    var id: String { "\(program.id)-\(template.id)" }
}

private struct WorkoutLiveMenuMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)

            HStack(spacing: 5) {
                Text(value)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .heavy))
                    .foregroundStyle(Theme.muted.opacity(0.72))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
        .background(Theme.background.opacity(0.68))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

private struct WorkoutLiveInput: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    let keyboard: UIKeyboardType

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)

            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(Theme.text)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.76)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
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
