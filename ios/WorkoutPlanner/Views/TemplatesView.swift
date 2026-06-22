import SwiftUI

private enum ProgramTab: String, CaseIterable, Identifiable {
    case program = "Program"
    case routines = "Routines"
    case exercises = "Exercises"

    var id: String { rawValue }
}

struct TemplatesView: View {
    @EnvironmentObject private var store: WorkoutStore
    @Binding var selectedPage: AppPage
    @State private var sheet: TemplateSheet?
    @State private var deleteTarget: WorkoutTemplate?
    @State private var deleteProgramTarget: TrainingProgram?
    @State private var isSaving = false
    @State private var selectedTab: ProgramTab = .program

    private var programCountLabel: String {
        store.programs.count == 1 ? "1 program" : "\(store.programs.count) programs"
    }

    private var routineCountLabel: String {
        store.templates.count == 1 ? "1 routine" : "\(store.templates.count) routines"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Program view", selection: $selectedTab) {
                        ForEach(ProgramTab.allCases) { tab in
                            Text(tab.rawValue).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)

                    selectedTabContent
                }
                .padding(16)
                .padding(.bottom, 96)
            }
            .navigationTitle("Program")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    ToolbarCircleActionButton(
                        systemName: "gearshape",
                        accessibilityLabel: "Workout Defaults",
                        tint: Theme.text
                    ) {
                        sheet = .settings
                    }

                    Menu {
                        Button {
                            sheet = .program(TrainingProgram(name: ""))
                        } label: {
                            Label("New Program", systemImage: "calendar.badge.plus")
                        }

                        Button {
                            sheet = .form(WorkoutTemplate(name: ""))
                        } label: {
                            Label("New Routine", systemImage: "square.grid.2x2")
                        }

                        Button {
                            sheet = .exercise(Exercise(name: "", muscleGroup: "Other", notes: nil))
                        } label: {
                            Label("New Exercise", systemImage: "plus")
                        }
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 34, height: 34)
                            .contentShape(Circle())
                            .toolbarGlass(in: Circle(), tint: Theme.accent.opacity(0.08))
                    }
                    .accessibilityLabel("Add")
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
            case let .program(program):
                ProgramFormSheet(program: program, templates: store.templates, isSaving: $isSaving)
            case let .exercise(exercise):
                ExerciseFormSheet(exercise: exercise, isSaving: $isSaving)
            case .programTimeline:
                if let program = ProgramPlanner.activeProgram(from: store.programs) {
                    ProgramTimelineSheet(
                        days: ProgramPlanner.upcomingSchedule(program: program, templates: store.templates, logs: store.logs),
                        isSaving: $isSaving,
                        onInsertRest: { day in
                            Task { await insertRollingRestDay(day) }
                        },
                        onMove: { source, destination in
                            Task { await reorderRollingTimeline(fromOffsets: source, toOffset: destination) }
                        }
                    )
                }
            case let .programDay(weekday):
                if let program = ProgramPlanner.activeProgram(from: store.programs),
                   let day = ProgramPlanner.weekPlan(program: program, templates: store.templates, logs: store.logs)
                    .first(where: { $0.weekday.value == weekday }) {
                    ProgramDayPlannerSheet(
                        program: program,
                        day: day,
                        week: ProgramPlanner.weekPlan(program: program, templates: store.templates, logs: store.logs),
                        templates: store.templates,
                        isSaving: $isSaving,
                        onStart: { template in
                            store.setStartTemplate(template, program: program)
                            selectedPage = .log
                        },
                        onSkip: { day in
                            Task { await skip(day) }
                        },
                        onSetRoutine: { day, templateId in
                            Task { await setProgramRoutine(program, weekday: day.weekday.value, templateId: templateId) }
                        },
                        onMoveOrSwap: { day, targetWeekday in
                            Task { await moveProgramDay(program, from: day.weekday.value, to: targetWeekday) }
                        }
                    )
                }
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
                        if !isCancellationError(error) {
                            store.errorMessage = error.localizedDescription
                        }
                    }
                }
            }
        } message: {
            Text("Delete \(deleteTarget?.name ?? "this routine")? This cannot be undone.")
        }
        .alert("Delete Program", isPresented: Binding(
            get: { deleteProgramTarget != nil },
            set: { if !$0 { deleteProgramTarget = nil } }
        )) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                guard let target = deleteProgramTarget else { return }
                Task {
                    do {
                        try await store.deleteProgram(target.id)
                        deleteProgramTarget = nil
                    } catch {
                        if !isCancellationError(error) {
                            store.errorMessage = error.localizedDescription
                        }
                    }
                }
            }
        } message: {
            Text("Delete \(deleteProgramTarget?.name ?? "this program")? Routines and logs stay untouched.")
        }
    }

    @ViewBuilder
    private var selectedTabContent: some View {
        switch selectedTab {
        case .program:
            programTab
        case .routines:
            routinesTab
        case .exercises:
            ExerciseLibrarySection()
        }
    }

    private var programTab: some View {
        let activeProgram = ProgramPlanner.activeProgram(from: store.programs)

        return VStack(alignment: .leading, spacing: 10) {
            ProgramSectionHeader(
                title: "Programs",
                subtitle: programCountLabel
            )
            ProgramSummaryCard(
                program: activeProgram,
                templates: store.templates,
                logs: store.logs,
                onEdit: { program in sheet = .program(program) },
                onDelete: { program in deleteProgramTarget = program },
                onStart: { template in
                    store.setStartTemplate(template, program: activeProgram)
                    selectedPage = .log
                },
                onSkip: { workout in
                    Task { await skip(workout) }
                },
                onEditTimeline: {
                    sheet = .programTimeline
                },
                onSelectDay: { day in
                    sheet = .programDay(day.weekday.value)
                }
            )
            ProgramList(
                programs: store.programs,
                onEdit: { program in sheet = .program(program) },
                onDelete: { program in deleteProgramTarget = program }
            )
        }
    }

    private var routinesTab: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProgramSectionHeader(
                title: "Routines",
                subtitle: routineCountLabel
            )

            if store.templates.isEmpty {
                VStack(spacing: 10) {
                    EmptyState(icon: "square.grid.2x2", text: "No routines yet. Tap + to save your favorite workouts.")

                    Button {
                        Task { await createStarterTemplates() }
                    } label: {
                        Label("Add Starter Routines", systemImage: "plus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isSaving || store.exercises.isEmpty)
                }
            } else {
                VStack(spacing: 10) {
                    ForEach(store.templates) { template in
                        TemplateCard(
                            template: template,
                            exercises: store.exercises,
                            logs: store.logs,
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
    }

    private func createStarterTemplates() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let lastWeightTypes = lastWeightTypesByExerciseId(from: store.logs)
            for template in StarterTemplates.makeTemplates(exercises: store.exercises, settings: store.settings, lastWeightTypeByExerciseId: lastWeightTypes) {
                try await store.saveTemplate(template)
            }
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func skip(_ workout: NextProgramWorkout) async {
        await skip(template: workout.template, date: workout.date)
    }

    private func skip(_ day: PlannedProgramDay) async {
        guard let template = day.templates.first else { return }
        await skip(template: template, date: day.date)
    }

    private func skip(template: WorkoutTemplate, date: Date) async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.saveLog(WorkoutLog(
                name: template.name,
                date: DateHelpers.dayString(from: date),
                notes: "Skipped from program",
                exerciseItems: [],
                status: "skipped"
            ))
            if let activeProgram = ProgramPlanner.activeProgram(from: store.programs) {
                let updatedProgram = programWithActivity(
                    activeProgram,
                    type: "skip",
                    title: "Skipped \(template.name)",
                    detail: ProgramPlanner.displayDate(date)
                )
                try await store.saveProgram(updatedProgram)
            }
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func setProgramRoutine(_ program: TrainingProgram, weekday: Int, templateId: String) async {
        guard !isSaving else { return }
        let currentTemplateId = ProgramPlanner.scheduleItem(in: program.schedule, weekday: weekday)?.templateId ?? ""
        guard currentTemplateId != templateId else { return }
        let weekdayLabel = ProgramPlanner.weekday(for: weekday)
        let templateName = store.templates.first { $0.id == templateId }?.name
        isSaving = true
        defer { isSaving = false }
        do {
            var updated = programWithActivity(
                program,
                type: "schedule_edit",
                title: templateId.isEmpty ? "Set \(weekdayLabel.long) as rest" : "Set \(weekdayLabel.long)",
                detail: templateId.isEmpty ? "Rest" : (templateName ?? "Routine")
            )
            updated.schedule = ProgramPlanner.setSchedule(program.schedule, weekday: weekday, templateId: templateId)
            try await store.saveProgram(updated)
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func moveProgramDay(_ program: TrainingProgram, from sourceWeekday: Int, to targetWeekday: Int) async {
        guard !isSaving, sourceWeekday != targetWeekday else { return }
        let sourceItem = ProgramPlanner.scheduleItem(in: program.schedule, weekday: sourceWeekday)
        let targetItem = ProgramPlanner.scheduleItem(in: program.schedule, weekday: targetWeekday)
        guard sourceItem != nil || targetItem != nil else { return }

        let sourceLabel = ProgramPlanner.weekday(for: sourceWeekday)
        let targetLabel = ProgramPlanner.weekday(for: targetWeekday)
        let sourceTemplate = store.templates.first { $0.id == sourceItem?.templateId }
        let targetTemplate = store.templates.first { $0.id == targetItem?.templateId }
        let isSwap = sourceItem != nil && targetItem != nil

        isSaving = true
        defer { isSaving = false }
        do {
            var updated = programWithActivity(
                program,
                type: isSwap ? "swap" : "move",
                title: isSwap
                    ? "Swapped \(sourceLabel.label) and \(targetLabel.label)"
                    : "Moved \(sourceTemplate?.name ?? targetTemplate?.name ?? "Routine")",
                detail: isSwap
                    ? "\(sourceTemplate?.name ?? "Rest") <-> \(targetTemplate?.name ?? "Rest")"
                    : sourceItem != nil
                        ? "\(sourceLabel.long) -> \(targetLabel.long)"
                        : "\(targetLabel.long) -> \(sourceLabel.long)"
            )
            updated.schedule = ProgramPlanner.moveOrSwapSchedule(program.schedule, sourceWeekday: sourceWeekday, targetWeekday: targetWeekday)
            try await store.saveProgram(updated)
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func insertRollingRestDay(_ day: UpcomingProgramDay) async {
        guard !isSaving,
              let program = ProgramPlanner.activeProgram(from: store.programs)
        else { return }
        let days = ProgramPlanner.upcomingSchedule(program: program, templates: store.templates, logs: store.logs)
        guard let index = days.firstIndex(where: { $0.id == day.id }) else { return }
        let contents = days.map(ProgramTimelineContent.init(day:))
        let shifted = Array((contents[..<index] + [ProgramTimelineContent.rest] + contents[index...]).prefix(days.count))

        await saveRollingTimeline(
            program,
            type: "rest_insert",
            title: "Inserted rest day",
            detail: ProgramPlanner.displayDate(day.date),
            days: days,
            contents: shifted
        )
    }

    private func reorderRollingTimeline(fromOffsets source: IndexSet, toOffset destination: Int) async {
        guard !isSaving,
              let sourceIndex = source.first,
              let program = ProgramPlanner.activeProgram(from: store.programs)
        else { return }
        let days = ProgramPlanner.upcomingSchedule(program: program, templates: store.templates, logs: store.logs)
        guard days.indices.contains(sourceIndex), destination >= 0, destination <= days.count else { return }

        var contents = days.map(ProgramTimelineContent.init(day:))
        let moved = contents[sourceIndex]
        contents.move(fromOffsets: source, toOffset: destination)

        let targetIndex = min(max(destination > sourceIndex ? destination - 1 : destination, 0), max(days.count - 1, 0))
        await saveRollingTimeline(
            program,
            type: "timeline_reorder",
            title: "Moved \(moved.templateName.isEmpty ? "rest day" : moved.templateName)",
            detail: "\(ProgramPlanner.displayDate(days[sourceIndex].date)) -> \(ProgramPlanner.displayDate(days[targetIndex].date))",
            days: days,
            contents: contents
        )
    }

    private func saveRollingTimeline(_ program: TrainingProgram, type: String, title: String, detail: String, days: [UpcomingProgramDay], contents: [ProgramTimelineContent]) async {
        guard !isSaving, days.count == contents.count else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let entries = zip(days, contents).map { day, content in
                ProgramTimelineItem(
                    date: day.id,
                    templateId: content.templateId.isEmpty ? nil : content.templateId,
                    notes: nil
                )
            }
            var updated = programWithActivity(program, type: type, title: title, detail: detail)
            updated.timeline = mergeProgramTimeline(program.timeline, entries: entries)
            try await store.saveProgram(updated)
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func mergeProgramTimeline(_ existing: [ProgramTimelineItem]?, entries: [ProgramTimelineItem]) -> [ProgramTimelineItem] {
        let changedDates = Set(entries.map(\.date))
        return cleanProgramTimeline((existing ?? []).filter { !changedDates.contains($0.date) } + entries)
    }

    private func cleanProgramTimeline(_ timeline: [ProgramTimelineItem]) -> [ProgramTimelineItem] {
        var seenDates = Set<String>()
        let cleaned = timeline.compactMap { item -> ProgramTimelineItem? in
            let date = item.date
            guard DateHelpers.apiDay.date(from: date) != nil, seenDates.insert(date).inserted else { return nil }
            let templateId = item.templateId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let notes = item.notes?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return ProgramTimelineItem(
                date: date,
                templateId: templateId.isEmpty ? nil : templateId,
                notes: notes.isEmpty ? nil : notes
            )
        }
        .sorted { $0.date < $1.date }

        return Array(cleaned.suffix(70))
    }

    private func programWithActivity(_ program: TrainingProgram, type: String, title: String, detail: String? = nil) -> TrainingProgram {
        var updated = program
        let entry = ProgramActivity(type: type, title: title, detail: detail)
        updated.activity = ([entry] + (program.activity ?? [])).prefix(30).map { $0 }
        return updated
    }

}

private enum StarterTemplates {
    private struct Starter {
        let name: String
        let description: String
        let exerciseNames: [String]
    }

    private static let templates = [
        Starter(name: "Push Starter", description: "Chest, shoulders, and triceps", exerciseNames: ["Bench Press", "Overhead Press", "Tricep Pushdown"]),
        Starter(name: "Pull Starter", description: "Back and biceps", exerciseNames: ["Lat Pulldown", "Seated Cable Row", "Dumbbell Curl"]),
        Starter(name: "Legs Starter", description: "Quads, hamstrings, and calves", exerciseNames: ["Barbell Squat", "Romanian Deadlift", "Standing Calf Raise"]),
    ]

    static func makeTemplates(exercises: [Exercise], settings: WorkoutSettings, lastWeightTypeByExerciseId: [String: String] = [:]) -> [WorkoutTemplate] {
        var exercisesByName: [String: Exercise] = [:]
        for exercise in exercises where exercisesByName[exercise.name.lowercased()] == nil {
            exercisesByName[exercise.name.lowercased()] = exercise
        }
        return templates.compactMap { starter in
            let items = starter.exerciseNames.compactMap { exercisesByName[$0.lowercased()] }.map { exercise in
                ExerciseItem(
                    exerciseId: exercise.id,
                    weightType: lastWeightTypeByExerciseId[exercise.id] ?? "weight",
                    sets: defaultSets(settings)
                )
            }
            guard !items.isEmpty else { return nil }
            return WorkoutTemplate(name: starter.name, description: starter.description, exerciseItems: items)
        }
    }

    private static func defaultSets(_ settings: WorkoutSettings) -> [WorkoutSet] {
        Array(repeating: WorkoutSet(reps: String(settings.defaultReps), weight: ""), count: settings.defaultSets)
    }
}

private enum TemplateSheet: Identifiable {
    case form(WorkoutTemplate)
    case view(WorkoutTemplate)
    case settings
    case program(TrainingProgram)
    case exercise(Exercise)
    case programTimeline
    case programDay(Int)

    var id: String {
        switch self {
        case let .form(template): return "form-\(template.id)"
        case let .view(template): return "view-\(template.id)"
        case .settings: return "settings"
        case let .program(program): return "program-\(program.id)"
        case let .exercise(exercise): return "exercise-\(exercise.id)"
        case .programTimeline: return "program-timeline"
        case let .programDay(weekday): return "program-day-\(weekday)"
        }
    }
}

private struct ProgramWeekday: Identifiable {
    let value: Int
    let label: String
    let long: String

    var id: Int { value }
}

private enum ProgramDayStatus {
    case rest
    case planned
    case done
    case skipped
    case missed
}

private struct PlannedProgramDay: Identifiable {
    let weekday: ProgramWeekday
    let date: Date
    let templates: [WorkoutTemplate]
    let completedCount: Int
    let skippedCount: Int
    let status: ProgramDayStatus

    var id: Int { weekday.value }
}

private struct UpcomingProgramDay: Identifiable {
    let date: Date
    let templateId: String
    let templates: [WorkoutTemplate]
    let completedCount: Int
    let skippedCount: Int
    let status: ProgramDayStatus

    var id: String { DateHelpers.dayString(from: date) }
}

private struct ProgramTimelineContent {
    let templateId: String
    let templateName: String

    static let rest = ProgramTimelineContent(templateId: "", templateName: "")

    init(templateId: String, templateName: String) {
        self.templateId = templateId
        self.templateName = templateName
    }

    init(day: UpcomingProgramDay) {
        templateId = day.templateId
        templateName = day.templates.first?.name ?? ""
    }
}

private struct NextProgramWorkout {
    let date: Date
    let weekday: Int
    let template: WorkoutTemplate
    let position: Int
    let total: Int
}

private struct ProgramDeloadWeekInfo {
    let isDeload: Bool
    let nextDate: Date
    let weekNumber: Int
    let instruction: String
}

private struct ProgramAdherenceSummary {
    let weeks: Int
    let scheduled: Int
    let completed: Int
    let skipped: Int
    let missed: Int
    let remainingToday: Int

    var completionRate: Int {
        guard scheduled > 0 else { return 0 }
        return Int((Double(completed) / Double(scheduled) * 100).rounded())
    }
}

private enum ProgramPlanner {
    static let weekdays = [
        ProgramWeekday(value: 0, label: "Sun", long: "Sunday"),
        ProgramWeekday(value: 1, label: "Mon", long: "Monday"),
        ProgramWeekday(value: 2, label: "Tue", long: "Tuesday"),
        ProgramWeekday(value: 3, label: "Wed", long: "Wednesday"),
        ProgramWeekday(value: 4, label: "Thu", long: "Thursday"),
        ProgramWeekday(value: 5, label: "Fri", long: "Friday"),
        ProgramWeekday(value: 6, label: "Sat", long: "Saturday"),
    ]

    static func activeProgram(from programs: [TrainingProgram]) -> TrainingProgram? {
        programs.first { $0.active == true }
    }

    static func nextWorkout(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog]) -> NextProgramWorkout? {
        guard let program, !program.schedule.isEmpty || program.timeline?.isEmpty == false else { return nil }
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())

        for offset in 0..<28 {
            guard let date = Calendar.current.date(byAdding: .day, value: offset, to: today) else { continue }
            let weekday = Calendar.current.component(.weekday, from: date) - 1
            let scheduled = scheduledTemplates(on: date, program: program, templatesById: templatesById)
            for (index, template) in scheduled.enumerated() where !handledOn(logs: logs, template: template, date: date) {
                return NextProgramWorkout(date: date, weekday: weekday, template: template, position: index + 1, total: scheduled.count)
            }
        }
        return nil
    }

    static func weekday(for value: Int) -> ProgramWeekday {
        weekdays.first { $0.value == ((value % 7) + 7) % 7 } ?? weekdays[0]
    }

    static func scheduleItem(in schedule: [ProgramScheduleItem], weekday: Int) -> ProgramScheduleItem? {
        schedule.first { $0.weekday == weekday && !$0.templateId.isEmpty }
    }

    static func setSchedule(_ schedule: [ProgramScheduleItem], weekday: Int, templateId: String) -> [ProgramScheduleItem] {
        var next = schedule.filter { $0.weekday != weekday && !$0.templateId.isEmpty }
        if !templateId.isEmpty {
            next.append(ProgramScheduleItem(weekday: weekday, templateId: templateId))
        }
        return next.sorted { $0.weekday < $1.weekday }
    }

    static func moveOrSwapSchedule(_ schedule: [ProgramScheduleItem], sourceWeekday: Int, targetWeekday: Int) -> [ProgramScheduleItem] {
        guard sourceWeekday != targetWeekday else { return schedule.sorted { $0.weekday < $1.weekday } }

        var byDay: [Int: ProgramScheduleItem] = [:]
        for item in schedule where !item.templateId.isEmpty {
            let weekday = ((item.weekday % 7) + 7) % 7
            guard byDay[weekday] == nil else { continue }
            var copy = item
            copy.weekday = weekday
            byDay[weekday] = copy
        }

        let source = byDay[sourceWeekday]
        let target = byDay[targetWeekday]
        guard source != nil || target != nil else {
            return byDay.values.sorted { $0.weekday < $1.weekday }
        }

        byDay[sourceWeekday] = nil
        byDay[targetWeekday] = nil
        if var source {
            source.weekday = targetWeekday
            byDay[targetWeekday] = source
        }
        if var target {
            target.weekday = sourceWeekday
            byDay[sourceWeekday] = target
        }

        return byDay.values.sorted { $0.weekday < $1.weekday }
    }

    static func upcomingSchedule(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog], days: Int = 21) -> [UpcomingProgramDay] {
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())

        return (0..<days).compactMap { offset in
            guard let date = Calendar.current.date(byAdding: .day, value: offset, to: today) else { return nil }
            let templateIds = program.map { scheduledTemplateIds(on: date, program: $0) } ?? []
            let scheduled = templateIds.compactMap { templatesById[$0] }
            let scheduledTemplateId = scheduled.first?.id ?? ""
            let completedCount = scheduled.filter { completedOn(logs: logs, template: $0, date: date) }.count
            let skippedCount = scheduled.filter { skippedOn(logs: logs, template: $0, date: date) }.count
            let handledCount = completedCount + skippedCount
            let isPast = date < today
            let status: ProgramDayStatus

            if scheduled.isEmpty {
                status = .rest
            } else if completedCount == scheduled.count {
                status = .done
            } else if handledCount == scheduled.count {
                status = .skipped
            } else if isPast {
                status = .missed
            } else {
                status = .planned
            }

            return UpcomingProgramDay(
                date: date,
                templateId: scheduledTemplateId,
                templates: scheduled,
                completedCount: completedCount,
                skippedCount: skippedCount,
                status: status
            )
        }
    }

    static func weekPlan(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog]) -> [PlannedProgramDay] {
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())
        let sundayOffset = 1 - Calendar.current.component(.weekday, from: today)
        let weekStart = Calendar.current.date(byAdding: .day, value: sundayOffset, to: today) ?? today

        return weekdays.compactMap { weekday in
            guard let date = Calendar.current.date(byAdding: .day, value: weekday.value, to: weekStart) else { return nil }
            let scheduled = program.map { scheduledTemplates(on: date, program: $0, templatesById: templatesById) } ?? []
            let completedCount = scheduled.filter { completedOn(logs: logs, template: $0, date: date) }.count
            let skippedCount = scheduled.filter { skippedOn(logs: logs, template: $0, date: date) }.count
            let handledCount = completedCount + skippedCount
            let isDone = !scheduled.isEmpty && completedCount == scheduled.count
            let isPast = date < today
            let status: ProgramDayStatus
            if scheduled.isEmpty {
                status = .rest
            } else if isDone {
                status = .done
            } else if handledCount == scheduled.count {
                status = .skipped
            } else if isPast {
                status = .missed
            } else {
                status = .planned
            }
            return PlannedProgramDay(weekday: weekday, date: date, templates: scheduled, completedCount: completedCount, skippedCount: skippedCount, status: status)
        }
    }

    static func deloadInfo(program: TrainingProgram?, date: Date = Date()) -> ProgramDeloadWeekInfo? {
        guard let deload = program?.deload,
              deload.type != "none",
              let instruction = deloadInstruction(deload)
        else { return nil }

        let everyWeeks = max(2, deload.everyWeeks ?? 4)
        let currentWeekStart = startOfWeek(date)
        let startWeek = startOfWeek(DateHelpers.date(from: deload.startDate ?? DateHelpers.todayString()))
        let weeksSinceStart = max(0, Calendar.current.dateComponents([.weekOfYear], from: startWeek, to: currentWeekStart).weekOfYear ?? 0)
        let weekNumber = weeksSinceStart + 1
        let isDeload = weekNumber % everyWeeks == 0
        let weeksUntilNext = isDeload ? everyWeeks : everyWeeks - (weekNumber % everyWeeks)
        let nextDate = Calendar.current.date(byAdding: .weekOfYear, value: weeksUntilNext, to: currentWeekStart) ?? currentWeekStart

        return ProgramDeloadWeekInfo(isDeload: isDeload, nextDate: nextDate, weekNumber: weekNumber, instruction: instruction)
    }

    static func adherenceSummary(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog], weeks: Int = 4) -> ProgramAdherenceSummary {
        guard let program, !program.schedule.isEmpty || program.timeline?.isEmpty == false else {
            return ProgramAdherenceSummary(weeks: weeks, scheduled: 0, completed: 0, skipped: 0, missed: 0, remainingToday: 0)
        }

        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())
        let start = Calendar.current.date(byAdding: .day, value: -((weeks * 7) - 1), to: today) ?? today
        var scheduledCount = 0
        var completedCount = 0
        var skippedCount = 0
        var missedCount = 0
        var remainingTodayCount = 0

        var date = start
        while date <= today {
            let scheduled = scheduledTemplates(on: date, program: program, templatesById: templatesById)
            for template in scheduled {
                scheduledCount += 1
                if completedOn(logs: logs, template: template, date: date) {
                    completedCount += 1
                } else if skippedOn(logs: logs, template: template, date: date) {
                    skippedCount += 1
                } else if date < today {
                    missedCount += 1
                } else {
                    remainingTodayCount += 1
                }
            }
            date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? today.addingTimeInterval(24 * 60 * 60)
        }

        return ProgramAdherenceSummary(
            weeks: weeks,
            scheduled: scheduledCount,
            completed: completedCount,
            skipped: skippedCount,
            missed: missedCount,
            remainingToday: remainingTodayCount
        )
    }

    static func displayDate(_ date: Date) -> String {
        let today = Calendar.current.startOfDay(for: Date())
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today) ?? today
        if Calendar.current.isDate(date, inSameDayAs: today) { return "Today" }
        if Calendar.current.isDate(date, inSameDayAs: tomorrow) { return "Tomorrow" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: date)
    }

    private static func completedOn(logs: [WorkoutLog], template: WorkoutTemplate, date: Date) -> Bool {
        let day = DateHelpers.dayString(from: date)
        return logs.contains { log in
            log.date == day
                && log.status == "finished"
                && log.name.trimmingCharacters(in: .whitespacesAndNewlines)
                    .caseInsensitiveCompare(template.name.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
        }
    }

    private static func skippedOn(logs: [WorkoutLog], template: WorkoutTemplate, date: Date) -> Bool {
        let day = DateHelpers.dayString(from: date)
        return logs.contains { log in
            log.date == day
                && log.status == "skipped"
                && log.name.trimmingCharacters(in: .whitespacesAndNewlines)
                    .caseInsensitiveCompare(template.name.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
        }
    }

    private static func handledOn(logs: [WorkoutLog], template: WorkoutTemplate, date: Date) -> Bool {
        completedOn(logs: logs, template: template, date: date) || skippedOn(logs: logs, template: template, date: date)
    }

    private static func startOfWeek(_ date: Date) -> Date {
        let startOfDay = Calendar.current.startOfDay(for: date)
        let weekdayOffset = Calendar.current.component(.weekday, from: startOfDay) - 1
        return Calendar.current.date(byAdding: .day, value: -weekdayOffset, to: startOfDay) ?? startOfDay
    }

    private static func scheduledTemplates(for weekday: Int, program: TrainingProgram, templatesById: [String: WorkoutTemplate]) -> [WorkoutTemplate] {
        scheduledTemplateIds(for: weekday, program: program).compactMap { templatesById[$0] }
    }

    private static func scheduledTemplates(on date: Date, program: TrainingProgram, templatesById: [String: WorkoutTemplate]) -> [WorkoutTemplate] {
        scheduledTemplateIds(on: date, program: program).compactMap { templatesById[$0] }
    }

    private static func scheduledTemplateIds(for weekday: Int, program: TrainingProgram) -> [String] {
        guard let item = program.schedule.first(where: { $0.weekday == weekday && !$0.templateId.isEmpty }) else { return [] }
        return [item.templateId]
    }

    private static func scheduledTemplateIds(on date: Date, program: TrainingProgram) -> [String] {
        let day = DateHelpers.dayString(from: date)
        if let timelineItem = program.timeline?.first(where: { $0.date == day }) {
            guard let templateId = timelineItem.templateId, !templateId.isEmpty else { return [] }
            return [templateId]
        }
        let weekday = Calendar.current.component(.weekday, from: date) - 1
        return scheduledTemplateIds(for: weekday, program: program)
    }
}

struct ProgramSectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(Theme.text)
            Text(subtitle)
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
            Spacer(minLength: 0)
        }
        .padding(.top, 2)
    }
}

private struct ProgramList: View {
    let programs: [TrainingProgram]
    let onEdit: (TrainingProgram) -> Void
    let onDelete: (TrainingProgram) -> Void

    var body: some View {
        if !programs.isEmpty {
            VStack(spacing: 10) {
                ForEach(programs) { program in
                    Card {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(program.name.isEmpty ? "Untitled program" : program.name)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(program.active == true ? Theme.text : Theme.muted)
                                Text("\(program.schedule.count) scheduled \(program.schedule.count == 1 ? "day" : "days")")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)

                            Text(program.active == true ? "Active" : "Inactive")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(program.active == true ? Theme.success : Theme.muted)
                                .textCase(.uppercase)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 5)
                                .background((program.active == true ? Theme.success : Theme.muted).opacity(0.1), in: Capsule())

                            IconCircleButton(systemName: "pencil") { onEdit(program) }
                            IconCircleButton(systemName: "trash", tint: Theme.danger) { onDelete(program) }
                        }
                    }
                    .opacity(program.active == true ? 1 : 0.72)
                }
            }
        }
    }
}

private struct ProgramSummaryCard: View {
    let program: TrainingProgram?
    let templates: [WorkoutTemplate]
    let logs: [WorkoutLog]
    let onEdit: (TrainingProgram) -> Void
    let onDelete: (TrainingProgram) -> Void
    let onStart: (WorkoutTemplate) -> Void
    let onSkip: (NextProgramWorkout) -> Void
    let onEditTimeline: () -> Void
    let onSelectDay: (PlannedProgramDay) -> Void

    private var nextWorkout: NextProgramWorkout? {
        ProgramPlanner.nextWorkout(program: program, templates: templates, logs: logs)
    }

    private var week: [PlannedProgramDay] {
        ProgramPlanner.weekPlan(program: program, templates: templates, logs: logs)
    }

    private var upcoming: [UpcomingProgramDay] {
        ProgramPlanner.upcomingSchedule(program: program, templates: templates, logs: logs)
    }

    private var deload: ProgramDeloadWeekInfo? {
        ProgramPlanner.deloadInfo(program: program)
    }

    private var adherence: ProgramAdherenceSummary {
        ProgramPlanner.adherenceSummary(program: program, templates: templates, logs: logs)
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Program")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Theme.muted)
                            .textCase(.uppercase)
                        Text(program?.name.isEmpty == false ? program?.name ?? "" : "No active program")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(Theme.text)
                        if let description = program?.description, !description.isEmpty {
                            Text(description)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 8) {
                        if let program {
                            IconCircleButton(systemName: "pencil") { onEdit(program) }
                            IconCircleButton(systemName: "trash", tint: Theme.danger) { onDelete(program) }
                        }
                    }
                }

                if let program {
                    ProgramNextWorkoutPanel(
                        nextWorkout: nextWorkout,
                        onStart: onStart,
                        onSkip: onSkip
                    )

                    ProgramWeekGrid(week: week, onSelectDay: onSelectDay)

                    ProgramUpcomingList(days: upcoming, onEditTimeline: onEditTimeline)

                    if adherence.scheduled > 0 {
                        ProgramAdherenceRow(summary: adherence)
                    }

                    if let deload {
                        Label(
                            deload.isDeload
                                ? "Deload week: use \(deload.instruction)"
                                : "Next deload \(ProgramPlanner.displayDate(deload.nextDate)): use \(deload.instruction)",
                            systemImage: "arrow.triangle.2.circlepath"
                        )
                        .font(.system(size: 13, weight: deload.isDeload ? .semibold : .regular))
                        .foregroundStyle(deload.isDeload ? Theme.text : Theme.muted)
                    }

                    if let summary = progressionSummary(program.progression) {
                        Label(summary, systemImage: "target")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    }

                    if let rule = program.progressionRule, !rule.isEmpty {
                        Label(rule, systemImage: "calendar.badge.clock")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    }

                    if let activity = program.activity, !activity.isEmpty {
                        ProgramActivityList(activity: Array(activity.prefix(5)))
                    }
                } else {
                    Label("Schedule routines by weekday, then start the next planned workout from here.", systemImage: "calendar")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
            }
        }
    }
}

private struct ProgramNextWorkoutPanel: View {
    let nextWorkout: NextProgramWorkout?
    let onStart: (WorkoutTemplate) -> Void
    let onSkip: (NextProgramWorkout) -> Void

    private var title: String {
        guard let nextWorkout else { return "No scheduled workout" }
        let progress = nextWorkout.total > 1 ? " (\(nextWorkout.position) of \(nextWorkout.total))" : ""
        return "\(ProgramPlanner.displayDate(nextWorkout.date)) - \(nextWorkout.template.name)\(progress)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "target")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading, spacing: 3) {
                    Text("Next")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.muted)
                        .textCase(.uppercase)
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: 10) {
                Button {
                    if let nextWorkout {
                        onSkip(nextWorkout)
                    }
                } label: {
                    Label("Skip", systemImage: "forward.end.fill")
                        .frame(maxWidth: .infinity)
                        .lineLimit(1)
                        .minimumScaleFactor(0.9)
                }
                .buttonStyle(SecondaryButtonStyle(compact: true))
                .disabled(nextWorkout == nil)

                Button {
                    if let template = nextWorkout?.template {
                        onStart(template)
                    }
                } label: {
                    Label("Start", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                        .lineLimit(1)
                        .minimumScaleFactor(0.9)
                }
                .buttonStyle(PrimaryButtonStyle(compact: true))
                .disabled(nextWorkout == nil)
            }
        }
        .padding(12)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

private struct ProgramWeekGrid: View {
    let week: [PlannedProgramDay]
    let onSelectDay: (PlannedProgramDay) -> Void

    private let columns = [
        GridItem(.adaptive(minimum: 78), spacing: 8, alignment: .top)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("This Week")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.text)
                Spacer()
                Text("Current week")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)
            }

            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                ForEach(week) { day in
                    ProgramDayChip(day: day) {
                        onSelectDay(day)
                    }
                }
            }
        }
    }
}

private struct ProgramUpcomingList: View {
    let days: [UpcomingProgramDay]
    let onEditTimeline: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Timeline")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.text)
                Spacer()
                Text("Next 3 weeks")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)
                IconCircleButton(
                    systemName: "arrow.up.arrow.down",
                    size: 28,
                    iconSize: 12,
                    action: onEditTimeline
                )
                .accessibilityLabel("Edit timeline")
            }

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(days) { day in
                        ProgramUpcomingRow(day: day)
                    }
                }
            }
            .frame(maxHeight: 260)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Program timeline")
    }
}

private struct ProgramTimelineSheet: View {
    @Environment(\.dismiss) private var dismiss

    let days: [UpcomingProgramDay]
    @Binding var isSaving: Bool
    let onInsertRest: (UpcomingProgramDay) -> Void
    let onMove: (IndexSet, Int) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(days) { day in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ProgramPlanner.displayDate(day.date))
                                .font(.system(size: 13, weight: .heavy))
                                .foregroundStyle(Theme.text)
                            Text(summary(for: day))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        Button {
                            onInsertRest(day)
                        } label: {
                            Label("Rest", systemImage: "plus")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isSaving)
                        .accessibilityLabel("Insert rest day on \(ProgramPlanner.displayDate(day.date))")
                    }
                    .padding(.vertical, 3)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button {
                            onInsertRest(day)
                        } label: {
                            Label("Rest", systemImage: "plus")
                        }
                        .tint(Theme.accent)
                        .disabled(isSaving)
                    }
                }
                .onMove { source, destination in
                    guard !isSaving else { return }
                    onMove(source, destination)
                }
            }
            .navigationTitle("Timeline")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    EditButton()
                        .disabled(isSaving)
                }
            }
        }
    }

    private func summary(for day: UpcomingProgramDay) -> String {
        guard !day.templates.isEmpty else { return "Rest" }
        return day.templates.map(\.name).joined(separator: ", ")
    }
}

private struct ProgramUpcomingRow: View {
    let day: UpcomingProgramDay

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(ProgramPlanner.displayDate(day.date))
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.text)
                Text(summary)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(statusLabel)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(statusColor)
                .textCase(.uppercase)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(statusBackground)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(statusBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private var summary: String {
        guard !day.templates.isEmpty else { return "Rest" }
        return day.templates.map(\.name).joined(separator: ", ")
    }

    private var statusLabel: String {
        switch day.status {
        case .rest: return "Rest"
        case .planned: return "Planned"
        case .done: return "Done"
        case .skipped: return "Skipped"
        case .missed: return "Missed"
        }
    }

    private var statusColor: Color {
        switch day.status {
        case .done: return Theme.success
        case .skipped: return Theme.accent
        case .missed: return Theme.warning
        case .planned: return Theme.text
        case .rest: return Theme.muted
        }
    }

    private var statusBorder: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.45)
        case .skipped: return Theme.accent.opacity(0.45)
        case .missed: return Theme.warning.opacity(0.55)
        case .planned, .rest: return Theme.border
        }
    }

    private var statusBackground: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.08)
        case .skipped: return Theme.accent.opacity(0.08)
        case .missed: return Theme.warning.opacity(0.08)
        case .planned, .rest: return Theme.background
        }
    }
}

private struct ProgramActivityList: View {
    let activity: [ProgramActivity]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Activity")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Theme.text)
                Spacer()
                Text("Recent changes")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)
            }

            VStack(spacing: 6) {
                ForEach(activity) { entry in
                    ProgramActivityRow(entry: entry)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Program activity")
    }
}

private struct ProgramActivityRow: View {
    let entry: ProgramActivity

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.title)
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if let detail = entry.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let dateLabel = activityDateLabel(entry.date) {
                Text(dateLabel)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private func activityDateLabel(_ value: String) -> String? {
        guard let date = ISO8601DateFormatter().date(from: value) else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, h:mm a"
        return formatter.string(from: date)
    }
}

private struct ProgramAdherenceRow: View {
    let summary: ProgramAdherenceSummary

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                metric("\(summary.completionRate)%", "\(summary.weeks)-week")
                metric("\(summary.completed)", "Done")
                metric("\(summary.skipped)", "Skipped")
                metric("\(summary.missed)", "Missed")
                if summary.remainingToday > 0 {
                    metric("\(summary.remainingToday)", "Today")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(Theme.text)
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
        }
        .frame(minWidth: 52, alignment: .leading)
    }
}

private struct ProgramDayChip: View {
    let day: PlannedProgramDay
    let action: () -> Void

    private var borderColor: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.45)
        case .skipped: return Theme.accent.opacity(0.45)
        case .missed: return Theme.warning.opacity(0.55)
        case .planned, .rest: return Theme.border
        }
    }

    private var backgroundColor: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.08)
        case .skipped: return Theme.accent.opacity(0.08)
        case .missed: return Theme.warning.opacity(0.08)
        case .planned, .rest: return Theme.background
        }
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 4) {
                    Text(day.weekday.label)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(minWidth: 24, alignment: .leading)
                    Spacer()
                    if day.status == .done {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.success)
                    } else if day.status == .skipped {
                        Image(systemName: "forward.end.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Theme.accent)
                    }
                    Image(systemName: "ellipsis")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.muted)
                }
                VStack(alignment: .leading, spacing: 2) {
                    if day.templates.isEmpty {
                        Text("Rest")
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    } else {
                        Text(day.templates[0].name)
                            .foregroundStyle(Theme.text)
                            .lineLimit(2)
                            .minimumScaleFactor(0.85)
                            .fixedSize(horizontal: false, vertical: true)
                        if day.templates.count > 1 {
                            Text("+\(day.templates.count - 1) more")
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                    }
                }
                .font(.system(size: 12, weight: .semibold))

                if day.templates.count > 1 || day.skippedCount > 0 {
                    let handledCount = day.completedCount + day.skippedCount
                    Text(day.skippedCount > 0 ? "\(handledCount)/\(day.templates.count) handled" : "\(day.completedCount)/\(day.templates.count)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 70, alignment: .topLeading)
            .padding(7)
            .background(backgroundColor)
            .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(borderColor, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(day.weekday.long), \(summary), \(statusLabel)")
    }

    private var summary: String {
        day.templates.first?.name ?? "Rest"
    }

    private var statusLabel: String {
        switch day.status {
        case .done: return "Done"
        case .skipped: return "Skipped"
        case .missed: return "Missed"
        case .planned: return "Planned"
        case .rest: return "Rest"
        }
    }
}

private struct ProgramDayPlannerSheet: View {
    @Environment(\.dismiss) private var dismiss

    let program: TrainingProgram
    let day: PlannedProgramDay
    let week: [PlannedProgramDay]
    let templates: [WorkoutTemplate]
    @Binding var isSaving: Bool
    let onStart: (WorkoutTemplate) -> Void
    let onSkip: (PlannedProgramDay) -> Void
    let onSetRoutine: (PlannedProgramDay, String) -> Void
    let onMoveOrSwap: (PlannedProgramDay, Int) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    private var currentTemplateId: String {
        ProgramPlanner.scheduleItem(in: program.schedule, weekday: day.weekday.value)?.templateId ?? ""
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    currentDayPanel

                    HStack(spacing: 10) {
                        Button {
                            if let template = day.templates.first {
                                onStart(template)
                                dismiss()
                            }
                        } label: {
                            Label("Start", systemImage: "play.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(day.templates.isEmpty || isSaving)

                        Button {
                            onSkip(day)
                            dismiss()
                        } label: {
                            Label("Skip", systemImage: "forward.end.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(day.templates.isEmpty || isSaving)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Routine")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(Theme.text)

                        Menu {
                            Button {
                                onSetRoutine(day, "")
                                dismiss()
                            } label: {
                                Label("Rest Day", systemImage: "moon")
                            }

                            ForEach(templates) { template in
                                Button {
                                    onSetRoutine(day, template.id)
                                    dismiss()
                                } label: {
                                    Label(template.name, systemImage: template.id == currentTemplateId ? "checkmark" : "square.grid.2x2")
                                }
                            }
                        } label: {
                            Label(currentTemplateId.isEmpty ? "Set Routine" : "Change Routine", systemImage: "calendar.badge.plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(isSaving || templates.isEmpty)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Move / Swap")
                                .font(.system(size: 13, weight: .heavy))
                                .foregroundStyle(Theme.text)
                            Spacer()
                            Image(systemName: "arrow.left.arrow.right")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.muted)
                        }

                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(ProgramPlanner.weekdays.filter { $0.value != day.weekday.value }) { weekday in
                                let target = week.first { $0.weekday.value == weekday.value }
                                let targetName = target?.templates.first?.name ?? "Rest"
                                let targetHasRoutine = target?.templates.isEmpty == false
                                Button {
                                    onMoveOrSwap(day, weekday.value)
                                    dismiss()
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(weekday.label)
                                            .font(.system(size: 11, weight: .heavy))
                                            .foregroundStyle(Theme.muted)
                                            .textCase(.uppercase)
                                        Text(targetName)
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(Theme.text)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.8)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 8)
                                    .background(Theme.background)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                                            .stroke(Theme.border, lineWidth: 1)
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .disabled(isSaving || (day.templates.isEmpty && !targetHasRoutine))
                            }
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle("\(day.weekday.long) Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var currentDayPanel: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(ProgramPlanner.displayDate(day.date))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)
                Text(day.templates.first?.name ?? "Rest")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(statusLabel)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(statusColor)
                .textCase(.uppercase)
        }
        .padding(12)
        .background(statusBackground)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(statusBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private var statusLabel: String {
        switch day.status {
        case .done: return "Done"
        case .skipped: return "Skipped"
        case .missed: return "Missed"
        case .planned: return "Planned"
        case .rest: return "Rest"
        }
    }

    private var statusColor: Color {
        switch day.status {
        case .done: return Theme.success
        case .skipped: return Theme.accent
        case .missed: return Theme.warning
        case .planned: return Theme.text
        case .rest: return Theme.muted
        }
    }

    private var statusBorder: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.45)
        case .skipped: return Theme.accent.opacity(0.45)
        case .missed: return Theme.warning.opacity(0.55)
        case .planned, .rest: return Theme.border
        }
    }

    private var statusBackground: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.08)
        case .skipped: return Theme.accent.opacity(0.08)
        case .missed: return Theme.warning.opacity(0.08)
        case .planned, .rest: return Theme.surface
        }
    }
}

private struct TemplateCard: View {
    let template: WorkoutTemplate
    let exercises: [Exercise]
    let logs: [WorkoutLog]
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
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        if let description = template.description, !description.isEmpty {
                            Text(description)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 8) {
                        IconCircleButton(systemName: "pencil", action: onEdit)
                        IconCircleButton(systemName: "trash", tint: Theme.danger, action: onDelete)
                    }
                    .fixedSize(horizontal: true, vertical: false)
                }

                FlowLayout(spacing: 6) {
                    let visibleItems = template.exerciseItems.compactMap { item -> (item: ExerciseItem, exercise: Exercise)? in
                        guard let exercise = exercises.first(where: { $0.id == item.exerciseId }) else { return nil }
                        return (item, exercise)
                    }

                    if visibleItems.isEmpty {
                        Text("No exercises added")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    } else {
                        ForEach(visibleItems.indices, id: \.self) { index in
                            let entry = visibleItems[index]
                            let prefix = entry.item.supersetGroup?.isEmpty == false ? "SS \(entry.item.supersetGroup!) · " : ""
                            let label = "\(prefix)\(entry.exercise.name) • \(entry.item.sets.count) \(entry.item.sets.count == 1 ? "set" : "sets")"
                            HStack(spacing: 5) {
                                Badge(text: label)
                                if routineExerciseNeedsWeightIncrease(entry.item, logs: logs) {
                                    Badge(text: "Add weight", icon: "arrow.up.circle.fill", accent: true)
                                        .accessibilityLabel("\(entry.exercise.name): increase weight next time")
                                }
                            }
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

    private enum FocusedTextField: Hashable {
        case name
        case description
    }

    @State private var form: WorkoutTemplate
    @Binding var isSaving: Bool
    @State private var editingExercise: Exercise?
    @FocusState private var focusedTextField: FocusedTextField?
    @FocusState private var focusedBuilderField: WorkoutBuilderFocusedField?

    init(template: WorkoutTemplate, isSaving: Binding<Bool>) {
        _form = State(initialValue: template)
        _isSaving = isSaving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        FormLabel(text: "Routine Name *")
                        TextField("e.g. Push Day, Leg Day...", text: $form.name)
                            .focused($focusedTextField, equals: .name)
                            .fieldStyle()
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        FormLabel(text: "Description")
                        TextField("Brief description...", text: Binding(
                            get: { form.description ?? "" },
                            set: { form.description = $0 }
                        ))
                        .focused($focusedTextField, equals: .description)
                        .fieldStyle()
                    }

                    Divider()

                    Text("Exercises")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.text)

                    WorkoutBuilderView(
                        exercises: store.exercises,
                        items: $form.exerciseItems,
                        focusedField: $focusedBuilderField,
                        showWeight: false,
                        defaultSets: store.settings.defaultSets,
                        defaultReps: store.settings.defaultReps,
                        defaultRestTargetSeconds: store.settings.defaultRestTargetSeconds,
                        advancedMode: store.settings.advancedMode,
                        lastWeightTypeByExerciseId: lastWeightTypesByExerciseId(from: store.logs),
                        logs: store.logs,
                        planningMode: true,
                        onEditExercise: { exercise in editingExercise = exercise }
                    )
                }
                .padding(16)
            }
            .navigationTitle(form.name.isEmpty ? "New Routine" : "Edit Routine")
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
                ToolbarItem(placement: .keyboard) {
                    KeyboardDoneToolbar {
                        focusedTextField = nil
                        focusedBuilderField = nil
                    }
                }
            }
        }
        .sheet(item: $editingExercise) { exercise in
            ExerciseFormSheet(exercise: exercise, isSaving: $isSaving)
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.saveTemplate(form)
            dismiss()
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }
}

private struct ProgramFormSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore

    let templates: [WorkoutTemplate]
    @State private var form: TrainingProgram
    @Binding var isSaving: Bool
    @FocusState private var focusedField: FocusedField?

    private enum FocusedField: Hashable {
        case name
        case description
        case progression
    }

    init(program: TrainingProgram, templates: [WorkoutTemplate], isSaving: Binding<Bool>) {
        self.templates = templates
        _form = State(initialValue: program)
        _isSaving = isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("e.g. 3 Day Strength", text: $form.name)
                        .focused($focusedField, equals: .name)
                    TextField("Block focus, phase, or goal", text: Binding(
                        get: { form.description ?? "" },
                        set: { form.description = $0 }
                    ))
                    .focused($focusedField, equals: .description)
                    Toggle("Active Program", isOn: Binding(
                        get: { form.active ?? false },
                        set: { form.active = $0 }
                    ))
                } header: {
                    Text("Program")
                }

                Section {
                    ForEach(ProgramPlanner.weekdays) { weekday in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(weekday.long)
                                    .font(.system(size: 15, weight: .semibold))
                                Spacer()
                                Text(scheduleSummary(for: weekday.value))
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.muted)
                            }

                            if templates.isEmpty {
                                Text("Create a routine first.")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.muted)
                            } else {
                                Picker("Routine", selection: scheduleSelectionBinding(for: weekday.value)) {
                                    Text("Rest day").tag("")
                                    ForEach(templates) { template in
                                        Text(template.name).tag(template.id)
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } header: {
                    Text("Weekly Schedule")
                }

                Section {
                    Picker("Rule", selection: progressionTypeBinding) {
                        Text("Reps, then weight").tag("double_progression")
                        Text("Add weight").tag("linear_weight")
                        Text("Add reps").tag("linear_reps")
                        Text("No structured rule").tag("none")
                    }

                    if currentProgression.type == "double_progression" {
                        Stepper("Min reps: \(currentProgression.minReps ?? 8)", value: progressionIntBinding(\.minReps, fallback: 8), in: 1...100)
                        Stepper("Max reps: \(currentProgression.maxReps ?? 12)", value: progressionIntBinding(\.maxReps, fallback: 12), in: 1...100)
                    }

                    if currentProgression.type == "double_progression" || currentProgression.type == "linear_reps" {
                        Stepper("Rep increment: \(currentProgression.repIncrement ?? 1)", value: progressionIntBinding(\.repIncrement, fallback: 1), in: 1...20)
                    }

                    if currentProgression.type == "double_progression" || currentProgression.type == "linear_weight" {
                        Stepper("Weight increment: \(formatProgressionNumber(currentProgression.weightIncrement ?? 5)) lb", value: progressionDoubleBinding(\.weightIncrement, fallback: 5), in: 0.25...200, step: 0.25)
                    }

                    if let summary = progressionSummary(form.progression) {
                        Text(summary)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.text)
                    }
                } header: {
                    Text("Progression Rule")
                }

                Section {
                    Picker("Rule", selection: deloadTypeBinding) {
                        Text("No structured deload").tag("none")
                        Text("Every N weeks").tag("every_n_weeks")
                    }

                    if currentDeload.type == "every_n_weeks" {
                        Stepper("Every \(currentDeload.everyWeeks ?? 4) weeks", value: deloadIntBinding(\.everyWeeks, fallback: 4), in: 2...12)
                        Stepper("Load: \(currentDeload.loadPercent ?? 85)%", value: deloadIntBinding(\.loadPercent, fallback: 85), in: 40...100)
                        Stepper("Reps: \(currentDeload.repPercent ?? 100)%", value: deloadIntBinding(\.repPercent, fallback: 100), in: 40...100)
                        DatePicker("Start", selection: deloadStartDateBinding, displayedComponents: .date)
                    }

                    if let summary = deloadSummary(form.deload) {
                        Text(summary)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.text)
                    }
                } header: {
                    Text("Deload Rule")
                }

                Section {
                    TextEditor(text: Binding(
                        get: { form.progressionRule ?? "" },
                        set: { form.progressionRule = $0 }
                    ))
                    .focused($focusedField, equals: .progression)
                    .frame(minHeight: 100)
                } header: {
                    Text("Progression Notes")
                }
            }
            .navigationTitle(form.name.isEmpty ? "New Program" : "Edit Program")
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
                ToolbarItem(placement: .keyboard) {
                    KeyboardDoneToolbar {
                        focusedField = nil
                    }
                }
            }
        }
    }

    private var currentProgression: ProgramProgressionRule {
        form.progression ?? ProgramProgressionRule(type: "none")
    }

    private var currentDeload: ProgramDeloadRule {
        form.deload ?? ProgramDeloadRule(type: "none")
    }

    private var progressionTypeBinding: Binding<String> {
        Binding(
            get: { currentProgression.type },
            set: { type in
                form.progression = ProgramProgressionRule(type: type)
            }
        )
    }

    private var deloadTypeBinding: Binding<String> {
        Binding(
            get: { currentDeload.type },
            set: { type in
                var rule = currentDeload
                rule.type = type
                if type == "every_n_weeks" {
                    rule.everyWeeks = rule.everyWeeks ?? 4
                    rule.loadPercent = rule.loadPercent ?? 85
                    rule.repPercent = rule.repPercent ?? 100
                    rule.startDate = rule.startDate ?? DateHelpers.todayString()
                }
                form.deload = rule
            }
        )
    }

    private var deloadStartDateBinding: Binding<Date> {
        Binding(
            get: { DateHelpers.date(from: currentDeload.startDate ?? DateHelpers.todayString()) },
            set: { date in
                var rule = currentDeload
                if rule.type == "none" { rule.type = "every_n_weeks" }
                rule.startDate = DateHelpers.dayString(from: date)
                form.deload = rule
            }
        )
    }

    private func progressionIntBinding(_ keyPath: WritableKeyPath<ProgramProgressionRule, Int?>, fallback: Int) -> Binding<Int> {
        Binding(
            get: { currentProgression[keyPath: keyPath] ?? fallback },
            set: { value in
                var rule = currentProgression
                if rule.type == "none" { rule.type = "double_progression" }
                rule[keyPath: keyPath] = value
                form.progression = rule
            }
        )
    }

    private func progressionDoubleBinding(_ keyPath: WritableKeyPath<ProgramProgressionRule, Double?>, fallback: Double) -> Binding<Double> {
        Binding(
            get: { currentProgression[keyPath: keyPath] ?? fallback },
            set: { value in
                var rule = currentProgression
                if rule.type == "none" { rule.type = "double_progression" }
                rule[keyPath: keyPath] = value
                form.progression = rule
            }
        )
    }

    private func deloadIntBinding(_ keyPath: WritableKeyPath<ProgramDeloadRule, Int?>, fallback: Int) -> Binding<Int> {
        Binding(
            get: { currentDeload[keyPath: keyPath] ?? fallback },
            set: { value in
                var rule = currentDeload
                if rule.type == "none" { rule.type = "every_n_weeks" }
                rule[keyPath: keyPath] = value
                form.deload = rule
            }
        )
    }

    private func scheduleSelectionBinding(for weekday: Int) -> Binding<String> {
        Binding(
            get: {
                form.schedule.first { $0.weekday == weekday }?.templateId ?? ""
            },
            set: { templateId in
                form.schedule.removeAll { $0.weekday == weekday }
                if !templateId.isEmpty {
                    form.schedule.append(ProgramScheduleItem(weekday: weekday, templateId: templateId))
                }
                form.schedule = cleanedSchedule(form.schedule)
            }
        )
    }

    private func scheduleSummary(for weekday: Int) -> String {
        guard let templateId = form.schedule.first(where: { $0.weekday == weekday && !$0.templateId.isEmpty })?.templateId else {
            return "Rest"
        }
        return templates.first(where: { $0.id == templateId })?.name ?? "1 routine"
    }

    private func cleanedSchedule(_ schedule: [ProgramScheduleItem]) -> [ProgramScheduleItem] {
        var seenWeekdays = Set<Int>()
        return schedule.enumerated().compactMap { index, item -> (Int, ProgramScheduleItem)? in
            guard !item.templateId.isEmpty else { return nil }
            guard seenWeekdays.insert(item.weekday).inserted else { return nil }
            return (index, item)
        }
        .sorted { left, right in
            if left.1.weekday == right.1.weekday {
                return left.0 < right.0
            }
            return left.1.weekday < right.1.weekday
        }
        .map { $0.1 }
    }

    private func cleanedProgression(_ progression: ProgramProgressionRule?) -> ProgramProgressionRule? {
        guard var rule = progression, rule.type != "none" else { return nil }
        if rule.type == "double_progression" {
            rule.minReps = max(1, min(rule.minReps ?? 8, 100))
            rule.maxReps = max(rule.minReps ?? 8, min(rule.maxReps ?? 12, 100))
        } else {
            rule.minReps = nil
            rule.maxReps = nil
        }
        if rule.type == "double_progression" || rule.type == "linear_reps" {
            rule.repIncrement = max(1, min(rule.repIncrement ?? 1, 20))
        } else {
            rule.repIncrement = nil
        }
        if rule.type == "double_progression" || rule.type == "linear_weight" {
            rule.weightIncrement = max(0.25, min(rule.weightIncrement ?? 5, 200))
        } else {
            rule.weightIncrement = nil
        }
        return rule
    }

    private func cleanedDeload(_ deload: ProgramDeloadRule?) -> ProgramDeloadRule? {
        guard var rule = deload, rule.type != "none" else { return nil }
        rule.type = "every_n_weeks"
        rule.everyWeeks = max(2, min(rule.everyWeeks ?? 4, 12))
        rule.loadPercent = max(40, min(rule.loadPercent ?? 85, 100))
        rule.repPercent = max(40, min(rule.repPercent ?? 100, 100))
        rule.startDate = DateHelpers.dayString(from: DateHelpers.date(from: rule.startDate ?? DateHelpers.todayString()))
        return rule
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            var cleaned = form
            cleaned.name = cleaned.name.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned.description = cleaned.description?.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned.progressionRule = cleaned.progressionRule?.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned.progression = cleanedProgression(cleaned.progression)
            cleaned.deload = cleanedDeload(cleaned.deload)
            cleaned.schedule = cleanedSchedule(cleaned.schedule)
            try await store.saveProgram(cleaned)
            dismiss()
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
        }
    }
}

private struct TemplateViewSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: WorkoutStore
    let template: WorkoutTemplate
    let onStart: () -> Void
    @FocusState private var focusedBuilderField: WorkoutBuilderFocusedField?

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
                        focusedField: $focusedBuilderField,
                        readOnly: true,
                        showWeight: false,
                        logs: store.logs
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
                    Picker("Default Rest", selection: Binding(
                        get: { form.defaultRestTargetSeconds ?? 0 },
                        set: { form.defaultRestTargetSeconds = $0 }
                    )) {
                        Text("No target").tag(0)
                        Text("0:30").tag(30)
                        Text("1:00").tag(60)
                        Text("1:30").tag(90)
                        Text("2:00").tag(120)
                        Text("3:00").tag(180)
                        Text("5:00").tag(300)
                    }
                } footer: {
                    Text("These values are used when adding a new exercise to a workout or routine.")
                }
                Section {
                    Toggle("Advanced Mode", isOn: $form.advancedMode)
                        .tint(Theme.accent)
                } footer: {
                    Text("Shows set type, RPE, and RIR controls while logging workouts.")
                }
            }
            .navigationTitle("Workout Defaults")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving..." : "Save") {
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
            dismiss()
        } catch {
            if !isCancellationError(error) {
                store.errorMessage = error.localizedDescription
            }
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
