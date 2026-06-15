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
    @State private var readiness = 0
    @State private var items: [ExerciseItem] = []
    @State private var startTime: String?
    @State private var activeExerciseIndex = 0
    @State private var activeSetIndex = 0
    @State private var isEditing = false
    @State private var isSaving = false
    @State private var showDiscardConfirm = false
    @State private var finishSummary: FinishSummary?
    @State private var editingExercise: Exercise?
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
    @FocusState private var focusedLiveActivityField: WorkoutBuilderFocusedField?

    private var isActive: Bool { workoutId != nil }
    private var isPlanningMode: Bool { workoutId != nil && startTime == nil && !isEditing }
    private var shouldShowLiveActivityCard: Bool {
        isActive && startTime != nil && !isEditing && !items.isEmpty
    }
    private var pageTitle: String {
        isEditing ? "Edit Workout" : startTime == nil ? "Plan Workout" : "Log Workout"
    }
    private var hasStartingPointOptions: Bool {
        (!isActive && !activeProgramWorkouts.isEmpty) || !store.templates.isEmpty
    }
    private var activeProgramWorkouts: [WorkoutProgramStart] {
        store.programs
            .filter { $0.active == true }
            .compactMap { nextProgramWorkout(program: $0) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
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
                    if hasStartingPointOptions {
                        startingPointSection
                    }
                    exercisesSection
                    notesSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            .background(Theme.background)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(pageTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .keyboard) {
                    KeyboardDoneToolbar {
                        focusedTextField = nil
                        focusedBuilderField = nil
                        focusedLiveActivityField = nil
                    }
                }
            }
        }
        .onAppear(perform: loadInitialState)
        .onChange(of: store.pendingWorkoutStart) { _, start in
            guard let start else { return }
            applyTemplate(start.template, replace: !isActive, program: start.program)
            store.pendingWorkoutStart = nil
        }
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
                focusedLiveActivityField = nil
                clearBuilderFieldForEntry(newValue)
            }
        }
        .onChange(of: focusedLiveActivityField) { oldValue, newValue in
            if oldValue != nil, newValue != oldValue {
                commitBuilderFieldsIfNeeded()
            }
            if newValue != nil {
                focusedBuilderField = nil
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
        .sheet(item: $editingExercise) { exercise in
            ExerciseFormSheet(exercise: exercise, isSaving: $isSaving)
        }
    }

    private var activeHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    if isActive, let startTime, !isEditing {
                        TimelineView(.periodic(from: Date(), by: 30)) { _ in
                            Label("In progress · \(formatDuration(startTime: startTime))", systemImage: "clock")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.muted)
                        }
                    } else {
                        Label(isEditing ? "Editing saved workout" : "Planning workout", systemImage: isEditing ? "pencil" : "list.clipboard")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                    }
                }

                Spacer()

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
            }

            HStack(spacing: 10) {
                Spacer(minLength: 0)
                if isActive, !items.isEmpty, isPlanningMode {
                    Button {
                        startWorkout()
                    } label: {
                        Label("Start Workout", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else if isActive, !items.isEmpty {
                    Button {
                        Task { await finishWorkout() }
                    } label: {
                        Label(isSaving ? "Saving..." : isEditing ? "Save Changes" : "Finish Workout", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
        }
        .padding(14)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private var liveActivityCard: some View {
        WorkoutLiveActivityCard(
            items: $items,
            exercises: store.exercises,
            startTime: startTime,
            advancedMode: store.settings.advancedMode,
            logs: store.logs,
            activeExerciseIndex: $activeExerciseIndex,
            activeSetIndex: $activeSetIndex,
            focusedField: $focusedLiveActivityField,
            onSetCompleted: markSetCompleted,
            onEndRest: endRest,
            onExtendRest: extendRest,
            onChanged: liveCardChanged,
            onTextChanged: builderTextChanged,
            onEditExercise: { exercise in editingExercise = exercise }
        )
    }

    private var workoutFields: some View {
        VStack(alignment: .leading, spacing: 12) {
            WorkoutSectionHeader(title: "Workout Setup", systemImage: "square.and.pencil")

            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 7) {
                    FormLabel(text: "Name")
                    HStack(spacing: 10) {
                        Image(systemName: "pencil")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                        TextField("e.g. Monday Push Day", text: $name)
                            .focused($focusedTextField, equals: .name)
                            .font(.system(size: 16, weight: .medium))
                            .onChange(of: name) { _, _ in hasPendingTextCommit = true }
                    }
                    .controlFieldStyle()
                }

                VStack(alignment: .leading, spacing: 7) {
                    FormLabel(text: "Date")
                    HStack(spacing: 10) {
                        Image(systemName: "calendar")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                        DatePicker("", selection: $date, displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .labelsHidden()
                            .onChange(of: date) { _, _ in scheduleSave() }
                        Spacer(minLength: 0)
                    }
                    .controlFieldStyle()
                }

                readinessSelector
            }
            .padding(12)
            .background(Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        }
    }

    @ViewBuilder
    private var startingPointSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            WorkoutSectionHeader(title: isActive ? "Add From Template" : "Starting Point", systemImage: "rectangle.stack")

            VStack(spacing: 8) {
                if !isActive, !activeProgramWorkouts.isEmpty {
                    programMenu
                }
                if !store.templates.isEmpty {
                    templateMenu
                }
            }
        }
    }

    @ViewBuilder
    private var programMenu: some View {
        Menu {
            ForEach(activeProgramWorkouts) { workout in
                Button("\(workout.program.name) - \(displayProgramDate(workout.date)) - \(workout.template.name)") {
                    applyTemplate(workout.template, replace: true, program: workout.program)
                }
            }
        } label: {
            SourceMenuRow(
                systemImage: "target",
                title: "Active Program",
                subtitle: "Select a program workout"
            )
        }
    }

    @ViewBuilder
    private var templateMenu: some View {
        Menu {
            ForEach(store.templates) { template in
                Button(template.name) {
                    applyTemplate(template, replace: !isActive)
                }
            }
        } label: {
            SourceMenuRow(
                systemImage: "clipboard",
                title: isActive ? "Template" : "Saved Template",
                subtitle: isActive ? "Add exercises from template" : "Select a template"
            )
        }
    }

    private var readinessSelector: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                FormLabel(text: "Readiness")
                Spacer()
                Text(readinessText(readiness))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(readiness > 0 ? Theme.accent : Theme.muted)
            }

            HStack(spacing: 6) {
                ForEach(1...5, id: \.self) { value in
                    Button {
                        readiness = readiness == value ? 0 : value
                        scheduleSave()
                    } label: {
                        Text("\(value)")
                            .font(.system(size: 14, weight: .heavy))
                            .foregroundStyle(readiness == value ? .white : Theme.text)
                            .frame(maxWidth: .infinity)
                            .frame(height: 34)
                            .background(readiness == value ? Theme.accent : Theme.background)
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                                    .stroke(readiness == value ? Theme.accent : Theme.border, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Readiness \(value)")
                }
            }
        }
    }

    private var exercisesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                WorkoutSectionHeader(title: "Exercises", systemImage: "dumbbell")
                Spacer()
                if !items.isEmpty {
                    Text("\(items.count)")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(Theme.accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.accent.opacity(0.1))
                        .clipShape(Capsule())
                        .accessibilityLabel("\(items.count) exercises")
                }
            }

            WorkoutBuilderView(
                exercises: store.exercises,
                items: $items,
                focusedField: $focusedBuilderField,
                defaultSets: store.settings.defaultSets,
                defaultReps: store.settings.defaultReps,
                defaultRestTargetSeconds: store.settings.defaultRestTargetSeconds,
                advancedMode: store.settings.advancedMode,
                lastWeightTypeByExerciseId: lastWeightTypesByExerciseId(from: store.logs),
                logs: store.logs,
                activeExerciseIndex: activeExerciseIndex,
                activeSetIndex: activeSetIndex,
                planningMode: isPlanningMode,
                onSetCompleted: markSetCompleted,
                onResetPersonalBest: (!isEditing && startTime != nil) ? resetPersonalBest : nil,
                onEditExercise: { exercise in editingExercise = exercise },
                onChanged: builderChanged,
                onTextChanged: builderTextChanged,
                onEditingDone: commitBuilderFieldsIfNeeded
            )
        }
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            WorkoutSectionHeader(title: "Session Notes", systemImage: "note.text")
            TextField("How did it go? Any PRs, fatigue notes...", text: $notes, axis: .vertical)
                .lineLimit(3...6)
                .focused($focusedTextField, equals: .notes)
                .fieldStyle()
                .onChange(of: notes) { _, _ in hasPendingTextCommit = true }
        }
    }

    private func readinessText(_ value: Int) -> String {
        switch value {
        case 1: return "Low"
        case 2: return "Fair"
        case 3: return "Okay"
        case 4: return "Good"
        case 5: return "High"
        default: return "Not set"
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
        if let start = store.pendingWorkoutStart, workoutId == nil {
            applyTemplate(start.template, replace: true, program: start.program)
            store.pendingWorkoutStart = nil
            return
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
        readiness = log.readiness ?? 0
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
                readiness: readiness > 0 ? readiness : nil,
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
            readiness: readiness > 0 ? readiness : nil,
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

    private func applyTemplate(_ template: WorkoutTemplate, replace: Bool, program: TrainingProgram? = nil) {
        let existingIds = Set(replace ? [] : items.map(\.exerciseId))
        let templateItems = template.exerciseItems
            .filter { !existingIds.contains($0.exerciseId) }
            .map { item in prepopulated(item, program: program) }

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

    private func prepopulated(_ item: ExerciseItem, program: TrainingProgram? = nil) -> ExerciseItem {
        let last = lastFinishedItem(for: item.exerciseId)
        let isUnilateral = store.exercise(id: item.exerciseId)?.isUnilateral == true
        let hitTarget = program != nil ? exerciseHitTarget(templateSets: item.sets, lastSets: last?.sets ?? []) : false
        let hitCap = program != nil ? exerciseHitRepCap(templateSets: item.sets, lastSets: last?.sets ?? [], cap: Double(program?.progression?.maxReps ?? 12)) : false
        let preferredWeightType = last?.weightType ?? item.weightType ?? "weight"
        let sets = item.sets.enumerated().map { offset, set in
            let targetReps = plannedRepText(set, fallback: String(store.settings.defaultReps))
            let targetLeft = plannedSideRepText(set, side: .left, fallback: targetReps)
            let targetRight = plannedSideRepText(set, side: .right, fallback: targetReps)
            let targets = programTargets(for: set, lastSet: last?.sets.indices.contains(offset) == true ? last?.sets[offset] : nil, program: program, hitTarget: hitTarget, hitCap: hitCap)
            let progressedReps = program == nil ? "" : (programRepRangeGoal(for: program) ?? targets.reps)
            let targetPlaceholder = progressedReps.isEmpty ? targetReps : progressedReps
            let targetLeftPlaceholder = progressedReps.isEmpty ? targetLeft : progressedReps
            let targetRightPlaceholder = progressedReps.isEmpty ? targetRight : progressedReps
            if let last, last.sets.indices.contains(offset) {
                let lastReps = last.sets[offset].reps?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let lastLeft = last.sets[offset].repsLeft?.trimmingCharacters(in: .whitespacesAndNewlines) ?? lastReps
                let lastRight = last.sets[offset].repsRight?.trimmingCharacters(in: .whitespacesAndNewlines) ?? lastReps
                let placeholderWeight = program == nil || targets.weight.isEmpty ? last.sets[offset].weight : targets.weight
                let placeholderWeightType = last.weightType ?? preferredWeightType
                return WorkoutSet(
                    reps: "",
                    repsLeft: isUnilateral ? "" : nil,
                    repsRight: isUnilateral ? "" : nil,
                    weight: "",
                    placeholderReps: lastReps.isEmpty ? targetPlaceholder : "\(lastReps) (\(targetPlaceholder))",
                    placeholderRepsLeft: isUnilateral ? (lastLeft.isEmpty ? targetLeftPlaceholder : "\(lastLeft) (\(targetLeftPlaceholder))") : nil,
                    placeholderRepsRight: isUnilateral ? (lastRight.isEmpty ? targetRightPlaceholder : "\(lastRight) (\(targetRightPlaceholder))") : nil,
                    placeholderWeight: placeholderWeight,
                    placeholderWeightType: placeholderWeightType
                )
            }
            return WorkoutSet(
                reps: "",
                repsLeft: isUnilateral ? "" : nil,
                repsRight: isUnilateral ? "" : nil,
                weight: "",
                placeholderReps: targetPlaceholder,
                placeholderRepsLeft: isUnilateral ? targetLeftPlaceholder : nil,
                placeholderRepsRight: isUnilateral ? targetRightPlaceholder : nil,
                placeholderWeight: targets.weight,
                placeholderWeightType: preferredWeightType
            )
        }
        return ExerciseItem(
            exerciseId: item.exerciseId,
            weightType: preferredWeightType,
            restTargetSeconds: item.restTargetSeconds,
            supersetGroup: item.supersetGroup,
            description: item.description,
            useIndividualReps: item.useIndividualReps,
            sets: sets
        )
    }

    private func numeric(_ value: String?) -> Double {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let number = Double(trimmed) { return number }
        let prefix = trimmed.prefix { character in
            character.isNumber || character == "."
        }
        return Double(prefix) ?? 0
    }

    private enum RepSide {
        case left
        case right
    }

    private func firstFilled(_ values: [String?]) -> String? {
        values
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    private func plannedRepText(_ set: WorkoutSet, fallback: String) -> String {
        firstFilled([
            set.placeholderReps,
            set.placeholderRepsLeft,
            set.repsLeft,
            set.placeholderRepsRight,
            set.repsRight,
            set.reps,
            fallback
        ]) ?? fallback
    }

    private func plannedSideRepText(_ set: WorkoutSet, side: RepSide, fallback: String) -> String {
        if let common = firstFilled([set.placeholderReps]) {
            return common
        }
        switch side {
        case .left:
            return firstFilled([set.placeholderRepsLeft, set.repsLeft, set.reps, fallback]) ?? fallback
        case .right:
            return firstFilled([set.placeholderRepsRight, set.repsRight, set.reps, fallback]) ?? fallback
        }
    }

    private func repValue(_ set: WorkoutSet?) -> Double {
        max(numeric(set?.reps), numeric(set?.repsLeft), numeric(set?.repsRight))
    }

    private func plannedRepValue(_ set: WorkoutSet) -> Double {
        let planned = numeric(plannedRepText(set, fallback: String(store.settings.defaultReps)))
        return planned > 0 ? planned : Double(store.settings.defaultReps)
    }

    private func exerciseHitTarget(templateSets: [WorkoutSet], lastSets: [WorkoutSet]) -> Bool {
        guard lastSets.count >= templateSets.count else { return false }
        return templateSets.indices.allSatisfy { index in
            repValue(lastSets[index]) >= plannedRepValue(templateSets[index])
        }
    }

    private func exerciseHitRepCap(templateSets: [WorkoutSet], lastSets: [WorkoutSet], cap: Double) -> Bool {
        guard lastSets.count >= templateSets.count else { return false }
        return templateSets.indices.allSatisfy { index in
            repValue(lastSets[index]) >= cap
        }
    }

    private func activeDeload(for program: TrainingProgram?) -> ProgramDeloadRule? {
        guard let deload = program?.deload,
              deload.type == "every_n_weeks"
        else { return nil }
        let calendar = Calendar.current
        let everyWeeks = max(2, deload.everyWeeks ?? 4)
        let currentWeek = workoutStartOfWeek(date)
        let startWeek = workoutStartOfWeek(DateHelpers.date(from: deload.startDate ?? DateHelpers.todayString()))
        let weeks = calendar.dateComponents([.weekOfYear], from: startWeek, to: currentWeek).weekOfYear ?? 0
        return weeks >= 0 && weeks % everyWeeks == 0 ? deload : nil
    }

    private func workoutStartOfWeek(_ value: Date) -> Date {
        let startOfDay = Calendar.current.startOfDay(for: value)
        let weekdayOffset = Calendar.current.component(.weekday, from: startOfDay) - 1
        return Calendar.current.date(byAdding: .day, value: -weekdayOffset, to: startOfDay) ?? startOfDay
    }

    private func programRepRangeGoal(for program: TrainingProgram?) -> String? {
        guard let progression = program?.progression,
              progression.type == "double_progression"
        else { return nil }

        var minReps = Double(progression.minReps ?? 8)
        var maxReps = Double(max(progression.maxReps ?? 12, progression.minReps ?? 8))
        if let deload = activeDeload(for: program) {
            let percent = Double(deload.repPercent ?? 100) / 100
            minReps = max(1, (minReps * percent).rounded())
            maxReps = max(minReps, (maxReps * percent).rounded())
        }
        return "\(formatProgressionNumber(minReps))-\(formatProgressionNumber(maxReps))"
    }

    private func programTargets(
        for set: WorkoutSet,
        lastSet: WorkoutSet?,
        program: TrainingProgram?,
        hitTarget: Bool,
        hitCap: Bool
    ) -> (reps: String, weight: String) {
        let progression = program?.progression
        let deload = activeDeload(for: program)
        var targetReps = plannedRepValue(set)
        var targetWeight = numeric(lastSet?.weight)

        if let progression, progression.type != "none", hitTarget {
            let repIncrement = Double(progression.repIncrement ?? 1)
            let weightIncrement = progression.weightIncrement ?? 5
            switch progression.type {
            case "double_progression":
                let minReps = Double(progression.minReps ?? 8)
                let maxReps = Double(progression.maxReps ?? 12)
                if hitCap {
                    targetReps = minReps
                    if targetWeight > 0 { targetWeight += weightIncrement }
                } else {
                    targetReps = min(maxReps, max(targetReps, repValue(lastSet)) + repIncrement)
                }
            case "linear_reps":
                targetReps = max(targetReps, repValue(lastSet)) + repIncrement
            case "linear_weight":
                if targetWeight > 0 { targetWeight += weightIncrement }
            default:
                break
            }
        }

        if let deload {
            targetReps = max(1, (targetReps * Double(deload.repPercent ?? 100) / 100).rounded())
            if targetWeight > 0 {
                targetWeight *= Double(deload.loadPercent ?? 100) / 100
            }
        }

        return (
            reps: formatProgressionNumber(targetReps),
            weight: targetWeight > 0 ? formatProgressionNumber(targetWeight) : ""
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
              items[exerciseIndex].sets.indices.contains(setIndex)
        else { return }

        if items[exerciseIndex].sets[setIndex].restStartTime != nil || items[exerciseIndex].sets[setIndex].restDuration != nil {
            items[exerciseIndex].sets[setIndex].restStartTime = nil
            items[exerciseIndex].sets[setIndex].restDuration = nil
            activeExerciseIndex = exerciseIndex
            activeSetIndex = setIndex
            restAlertTask?.cancel()
            restAlert = nil
            updateExternalLiveActivityNow()
            saveNow(status: currentStatus())
            return
        }

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
            focusLiveActivityReps(itemIndex: nextExercise, setIndex: nextSet)
        }
        scheduleRestAlert(exerciseIndex: exerciseIndex, setIndex: setIndex, startTime: now)
        updateExternalLiveActivityNow()
        saveNow(status: currentStatus())
    }

    private func focusLiveActivityReps(itemIndex: Int, setIndex: Int) {
        let nextField = repsFocusField(itemIndex: itemIndex, setIndex: setIndex)
        focusedTextField = nil
        focusedBuilderField = nil
        focusedLiveActivityField = nil

        Task { @MainActor in
            await Task.yield()
            guard shouldShowLiveActivityCard,
                  activeExerciseIndex == itemIndex,
                  activeSetIndex == setIndex,
                  items.indices.contains(itemIndex),
                  items[itemIndex].sets.indices.contains(setIndex)
            else { return }
            focusedLiveActivityField = nextField
        }
    }

    private func clearBuilderFieldForEntry(_ field: WorkoutBuilderFocusedField) {
        let itemIndex: Int
        let setIndex: Int
        switch field {
        case let .reps(i, s), let .repsMin(i, s), let .repsMax(i, s), let .repsLeft(i, s), let .repsRight(i, s), let .weight(i, s), let .rpe(i, s), let .rir(i, s):
            itemIndex = i
            setIndex = s
        }

        guard items.indices.contains(itemIndex), items[itemIndex].sets.indices.contains(setIndex) else { return }

        switch field {
        case .reps, .repsMin, .repsMax:
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
        let weightIncreaseContext = resting ?? context

        return WorkoutLiveActivityAttributes.ContentState(
            workoutName: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Workout" : name,
            exerciseName: context.exercise.name,
            muscleGroup: context.exercise.muscleGroup,
            setLabel: "\(context.setIndex + 1)/\(context.item.sets.count)",
            reps: liveRepsLabel(for: context.set) ?? "-",
            weight: liveWeightLabel(for: context) ?? "",
            setType: store.settings.advancedMode ? setTypeLabel(context.set.setType) : "",
            personalBest: personalBestLabel(context.exercise.personalBest, usesTime: context.exercise.usesTime == true),
            needsWeightIncrease: routineExerciseNeedsWeightIncrease(weightIncreaseContext.item, logs: store.logs),
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
        let left = liveRepText(value: set.repsLeft, placeholder: set.placeholderRepsLeft ?? set.placeholderReps)
        let right = liveRepText(value: set.repsRight, placeholder: set.placeholderRepsRight ?? set.placeholderReps)
        if left != nil || right != nil {
            let leftText = left ?? right ?? "-"
            let rightText = right ?? left ?? "-"
            return leftText == rightText ? leftText : "\(leftText)/\(rightText)"
        }
        return liveRepText(value: set.reps, placeholder: set.placeholderReps)
    }

    private func liveRepText(value: String?, placeholder: String?) -> String? {
        let reps = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let reps, !reps.isEmpty { return reps }
        let placeholder = placeholder?.trimmingCharacters(in: .whitespacesAndNewlines)
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
        readiness = 0
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

private let livePrimaryTileHeight: CGFloat = 58
private let liveCaptionTileHeight: CGFloat = 72
private let liveSecondaryTileHeight: CGFloat = 54
private let liveGridSpacing: CGFloat = 6

private struct WorkoutLiveActivityCard: View {
    @Binding var items: [ExerciseItem]
    let exercises: [Exercise]
    let startTime: String?
    let advancedMode: Bool
    let logs: [WorkoutLog]
    @Binding var activeExerciseIndex: Int
    @Binding var activeSetIndex: Int
    @FocusState.Binding var focusedField: WorkoutBuilderFocusedField?
    let onSetCompleted: (Int, Int) -> Void
    let onEndRest: (Int, Int) -> Void
    let onExtendRest: (Int, Int, Int) -> Void
    let onChanged: () -> Void
    let onTextChanged: () -> Void
    let onEditExercise: (Exercise) -> Void

    private var totalSets: Int {
        items.reduce(0) { $0 + $1.sets.count }
    }

    private var completedSets: Int {
        items.reduce(0) { count, item in
            count + item.sets.filter(isCompleted).count
        }
    }

    private var completedExercises: Int {
        items.filter { item in
            !item.sets.isEmpty && item.sets.allSatisfy(isCompleted)
        }.count
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
            VStack(alignment: .leading, spacing: 10) {
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

                Text("\(completedSets)/\(totalSets) sets, \(completedExercises)/\(items.count) \(items.count == 1 ? "exercise" : "exercises") complete")
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(14)
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
        let usesSideReps = context.exercise.isUnilateral == true
        let weightCaption = calculatedWeightCaption(weight: set.wrappedValue.weight, weightType: context.item.weightType)
        let primaryTileHeight = weightCaption == nil ? livePrimaryTileHeight : liveCaptionTileHeight
        let primaryFieldCount = (usesSideReps ? 2 : 1) + (showsWeight ? 2 : 1)

        return VStack(alignment: .leading, spacing: 8) {
            currentSetHeader(context, isUpNext: isUpNext)

            VStack(alignment: .leading, spacing: liveGridSpacing) {
                LazyVGrid(columns: liveFieldColumns(count: primaryFieldCount), alignment: .leading, spacing: liveGridSpacing) {
                    if usesSideReps {
                        WorkoutLiveInput(
                            title: "Left",
                            text: stringBinding(set, \.repsLeft),
                            placeholder: sideRepsLabel(for: context.set, left: true) ?? "0",
                            keyboard: .numberPad,
                            reservesCaptionSpace: weightCaption != nil,
                            height: primaryTileHeight
                        )
                        .focused($focusedField, equals: .repsLeft(itemIndex: context.exerciseIndex, setIndex: context.setIndex))

                        WorkoutLiveInput(
                            title: "Right",
                            text: stringBinding(set, \.repsRight),
                            placeholder: sideRepsLabel(for: context.set, left: false) ?? "0",
                            keyboard: .numberPad,
                            reservesCaptionSpace: weightCaption != nil,
                            height: primaryTileHeight
                        )
                        .focused($focusedField, equals: .repsRight(itemIndex: context.exerciseIndex, setIndex: context.setIndex))
                    } else {
                        WorkoutLiveInput(
                            title: context.exercise.usesTime == true ? "Secs" : "Reps",
                            text: stringBinding(set, \.reps),
                            placeholder: repsLabel(for: context.set) ?? "0",
                            keyboard: .numberPad,
                            reservesCaptionSpace: weightCaption != nil,
                            height: primaryTileHeight
                        )
                        .focused($focusedField, equals: .reps(itemIndex: context.exerciseIndex, setIndex: context.setIndex))
                    }

                    if showsWeight {
                        WorkoutLiveInput(
                            title: "Weight",
                            text: stringBinding(set, \.weight),
                            placeholder: weightPlaceholder(for: context) ?? "0",
                            keyboard: .decimalPad,
                            caption: weightCaption,
                            height: primaryTileHeight
                        )
                        .focused($focusedField, equals: .weight(itemIndex: context.exerciseIndex, setIndex: context.setIndex))
                    }

                    weightTypeMenu(context, height: primaryTileHeight, reservesCaptionSpace: weightCaption != nil)
                }
                .frame(maxWidth: .infinity)

                if advancedMode {
                    LazyVGrid(columns: liveFieldColumns(count: 3), alignment: .leading, spacing: liveGridSpacing) {
                        setTypeMenu(set: set, height: liveSecondaryTileHeight)

                        WorkoutLiveInput(
                            title: "RPE",
                            text: stringBinding(set, \.rpe),
                            placeholder: "-",
                            keyboard: .decimalPad,
                            height: liveSecondaryTileHeight
                        )
                        .focused($focusedField, equals: .rpe(itemIndex: context.exerciseIndex, setIndex: context.setIndex))

                        WorkoutLiveInput(
                            title: "RIR",
                            text: stringBinding(set, \.rir),
                            placeholder: "-",
                            keyboard: .decimalPad,
                            height: liveSecondaryTileHeight
                        )
                        .focused($focusedField, equals: .rir(itemIndex: context.exerciseIndex, setIndex: context.setIndex))
                    }
                    .frame(maxWidth: .infinity)
                }
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
                        .frame(width: 38, height: 38)
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
                        .frame(width: 38, height: 38)
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
            }
        }
        .padding(12)
        .background(isUpNext ? Theme.accent.opacity(0.08) : Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(isUpNext ? Theme.accent.opacity(0.45) : Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private func currentSetHeader(_ context: WorkoutLiveSetContext, isUpNext: Bool) -> some View {
        let badge = Text("\(context.setIndex + 1)/\(context.item.sets.count)")
            .font(.system(size: 14, weight: .heavy, design: .rounded))
            .foregroundStyle(Theme.accent)
            .monospacedDigit()
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.accent.opacity(0.11))
            .clipShape(Capsule())
            .accessibilityLabel("Set \(context.setIndex + 1) of \(context.item.sets.count)")

        let title = Text(context.exercise.name)
            .font(.system(size: 20, weight: .heavy))
            .foregroundStyle(Theme.text)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
        let needsWeightIncrease = routineExerciseNeedsWeightIncrease(context.item, logs: logs)

        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .center, spacing: 6) {
                        Text(isCompleted(context.set) ? "Selected" : isUpNext ? "Up next" : "Current")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(Theme.muted)
                            .textCase(.uppercase)
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)

                        badge
                    }

                    if !context.exercise.muscleGroup.isEmpty || needsWeightIncrease {
                        HStack(alignment: .center, spacing: 6) {
                            if !context.exercise.muscleGroup.isEmpty {
                                Badge(text: context.exercise.muscleGroup)
                            }

                            if needsWeightIncrease {
                                Badge(text: "Add weight", icon: "arrow.up.circle.fill", accent: true)
                                    .accessibilityLabel("\(context.exercise.name): increase weight next time")
                            }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .layoutPriority(1)

                Spacer(minLength: 0)

                HStack(spacing: 8) {
                    Button {
                        onEditExercise(context.exercise)
                    } label: {
                        Image(systemName: "pencil")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.text)
                            .frame(width: 28, height: 28)
                            .background(Theme.background)
                            .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit \(context.exercise.name)")

                    restTargetMenu(context)
                }
                .fixedSize(horizontal: true, vertical: false)
            }

            title
        }
    }

    private func liveFieldColumns(count: Int) -> [GridItem] {
        Array(
            repeating: GridItem(.flexible(minimum: 0), spacing: liveGridSpacing, alignment: .top),
            count: max(1, count)
        )
    }

    private func setTypeMenu(set: Binding<WorkoutSet>, height: CGFloat) -> some View {
        Menu {
            ForEach(liveSetTypeOptions, id: \.value) { option in
                Button(option.label) {
                    set.wrappedValue.setType = option.value
                    onChanged()
                }
            }
        } label: {
            WorkoutLiveMenuMetric(title: "Set Type", value: setTypeLabel(set.wrappedValue.setType), height: height)
        }
        .buttonStyle(.plain)
    }

    private func weightTypeMenu(_ context: WorkoutLiveSetContext, height: CGFloat = livePrimaryTileHeight, reservesCaptionSpace: Bool = false) -> some View {
        Menu {
            ForEach(liveWeightTypeOptions, id: \.value) { option in
                Button(option.label) {
                    updateWeightType(option.value, for: context)
                    onChanged()
                }
            }
        } label: {
            WorkoutLiveMenuMetric(title: "Load", value: weightTypeLabel(context.item.weightType), height: height, reservesCaptionSpace: reservesCaptionSpace)
        }
        .buttonStyle(.plain)
    }

    private func updateWeightType(_ weightType: String, for context: WorkoutLiveSetContext) {
        guard items.indices.contains(context.exerciseIndex) else { return }
        let previousWeightType = items[context.exerciseIndex].weightType ?? "weight"
        if previousWeightType != weightType {
            for setIndex in items[context.exerciseIndex].sets.indices {
                let placeholder = items[context.exerciseIndex].sets[setIndex].placeholderWeight?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !placeholder.isEmpty, items[context.exerciseIndex].sets[setIndex].placeholderWeightType == nil {
                    items[context.exerciseIndex].sets[setIndex].placeholderWeightType = previousWeightType
                }
            }
        }
        items[context.exerciseIndex].weightType = weightType
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
                    .fixedSize(horizontal: true, vertical: false)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .heavy))
                    .foregroundStyle(Theme.muted.opacity(0.72))
            }
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 9)
            .frame(minWidth: 70, minHeight: 30)
            .fixedSize(horizontal: true, vertical: false)
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
        return repsPlaceholderLabel(cleaned(set.placeholderReps))
    }

    private func sideRepsLabel(for set: WorkoutSet, left: Bool) -> String? {
        let reps = cleaned(left ? set.repsLeft : set.repsRight)
        if let reps { return reps }
        return repsPlaceholderLabel(cleaned(left ? set.placeholderRepsLeft : set.placeholderRepsRight) ?? cleaned(set.placeholderReps))
            ?? cleaned(set.reps)
    }

    private func repsPlaceholderLabel(_ placeholder: String?) -> String? {
        guard let placeholder else { return nil }
        if let context = RepsFieldPlaceholder(rawValue: placeholder) {
            if let goal = context.goal { return goal }
            return context.last
        }
        return placeholder
    }

    private func weightPlaceholder(for context: WorkoutLiveSetContext) -> String? {
        contextualWeightPlaceholder(
            weight: context.set.placeholderWeight,
            sourceWeightType: context.set.placeholderWeightType ?? context.item.weightType,
            targetWeightType: context.item.weightType
        )
    }

    private func weightLabel(for context: WorkoutLiveSetContext) -> String? {
        guard context.item.weightType != "none" else { return nil }
        guard let weight = cleaned(context.set.weight) ?? weightPlaceholder(for: context) else { return nil }
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

private struct WorkoutSectionHeader: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(Theme.accent)
                .frame(width: 20, height: 20)
                .background(Theme.accent.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            Text(title)
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(Theme.text)
        }
    }
}

private struct SourceMenuRow: View {
    let systemImage: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.accent)
                .frame(width: 30, height: 30)
                .background(Theme.accent.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                Text(subtitle)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.down")
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(Theme.muted)
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

private struct ControlFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Theme.background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

private extension View {
    func controlFieldStyle() -> some View {
        modifier(ControlFieldStyle())
    }
}

private struct WorkoutLiveMenuMetric: View {
    let title: String
    let value: String
    let height: CGFloat
    var reservesCaptionSpace = false

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
            .frame(height: 22, alignment: .leading)

            if reservesCaptionSpace {
                Color.clear
                    .frame(height: 12)
                    .allowsHitTesting(false)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: height, alignment: .center)
        .frame(maxWidth: .infinity)
        .background(Theme.background.opacity(0.68))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

private struct WorkoutLiveInput: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    let keyboard: UIKeyboardType
    var caption: String? = nil
    var reservesCaptionSpace = false
    let height: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
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
                .frame(height: 22, alignment: .leading)

            if let caption {
                Text(caption)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .monospacedDigit()
                    .frame(height: 12, alignment: .leading)
            } else if reservesCaptionSpace {
                Color.clear
                    .frame(height: 12)
                    .allowsHitTesting(false)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: height, alignment: .center)
        .frame(maxWidth: .infinity)
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
