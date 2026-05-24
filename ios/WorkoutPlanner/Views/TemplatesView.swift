import SwiftUI

struct TemplatesView: View {
    @EnvironmentObject private var store: WorkoutStore
    @Binding var selectedPage: AppPage
    @State private var sheet: TemplateSheet?
    @State private var deleteTarget: WorkoutTemplate?
    @State private var deleteProgramTarget: TrainingProgram?
    @State private var isSaving = false

    private var programCountLabel: String {
        store.programs.count == 1 ? "1 program" : "\(store.programs.count) programs"
    }

    private var routineCountLabel: String {
        store.templates.count == 1 ? "1 routine" : "\(store.templates.count) routines"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 10) {
                        ProgramSectionHeader(
                            title: "Programs",
                            subtitle: programCountLabel
                        )
                        ProgramSummaryCard(
                            program: ProgramPlanner.activeProgram(from: store.programs),
                            templates: store.templates,
                            logs: store.logs,
                            onEdit: { program in sheet = .program(program) },
                            onDelete: { program in deleteProgramTarget = program },
                            onStart: { template in
                                store.setStartTemplate(template)
                                selectedPage = .log
                            }
                        )
                    }

                    Divider()

                    VStack(alignment: .leading, spacing: 10) {
                        ProgramSectionHeader(
                            title: "Routines",
                            subtitle: routineCountLabel
                        )

                        if store.templates.isEmpty {
                            VStack(spacing: 12) {
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
                }
                .padding(16)
            }
            .navigationTitle("Program")
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
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 42, height: 42)
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
                        store.errorMessage = error.localizedDescription
                    }
                }
            }
        } message: {
            Text("Delete \(deleteProgramTarget?.name ?? "this program")? Routines and logs stay untouched.")
        }
    }

    private func createStarterTemplates() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            for template in StarterTemplates.makeTemplates(exercises: store.exercises, settings: store.settings) {
                try await store.saveTemplate(template)
            }
        } catch {
            store.errorMessage = error.localizedDescription
        }
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

    static func makeTemplates(exercises: [Exercise], settings: WorkoutSettings) -> [WorkoutTemplate] {
        var exercisesByName: [String: Exercise] = [:]
        for exercise in exercises where exercisesByName[exercise.name.lowercased()] == nil {
            exercisesByName[exercise.name.lowercased()] = exercise
        }
        return templates.compactMap { starter in
            let items = starter.exerciseNames.compactMap { exercisesByName[$0.lowercased()] }.map { exercise in
                ExerciseItem(exerciseId: exercise.id, sets: defaultSets(settings))
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

    var id: String {
        switch self {
        case let .form(template): return "form-\(template.id)"
        case let .view(template): return "view-\(template.id)"
        case .settings: return "settings"
        case let .program(program): return "program-\(program.id)"
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
    case missed
}

private struct PlannedProgramDay: Identifiable {
    let weekday: ProgramWeekday
    let date: Date
    let templates: [WorkoutTemplate]
    let completedCount: Int
    let status: ProgramDayStatus

    var id: Int { weekday.value }
}

private struct NextProgramWorkout {
    let date: Date
    let template: WorkoutTemplate
    let position: Int
    let total: Int
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
        programs.first { $0.active == true } ?? programs.first
    }

    static func nextWorkout(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog]) -> NextProgramWorkout? {
        guard let program, !program.schedule.isEmpty else { return nil }
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())

        for offset in 0..<14 {
            guard let date = Calendar.current.date(byAdding: .day, value: offset, to: today) else { continue }
            let weekday = Calendar.current.component(.weekday, from: date) - 1
            let scheduled = scheduledTemplates(for: weekday, program: program, templatesById: templatesById)
            for (index, template) in scheduled.enumerated() where !completedOn(logs: logs, template: template, date: date) {
                return NextProgramWorkout(date: date, template: template, position: index + 1, total: scheduled.count)
            }
        }
        return nil
    }

    static func weekPlan(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog]) -> [PlannedProgramDay] {
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())
        let sundayOffset = 1 - Calendar.current.component(.weekday, from: today)
        let weekStart = Calendar.current.date(byAdding: .day, value: sundayOffset, to: today) ?? today

        return weekdays.compactMap { weekday in
            guard let date = Calendar.current.date(byAdding: .day, value: weekday.value, to: weekStart) else { return nil }
            let scheduled = program.map { scheduledTemplates(for: weekday.value, program: $0, templatesById: templatesById) } ?? []
            let completedCount = scheduled.filter { completedOn(logs: logs, template: $0, date: date) }.count
            let isDone = !scheduled.isEmpty && completedCount == scheduled.count
            let isPast = date < today
            let status: ProgramDayStatus
            if scheduled.isEmpty {
                status = .rest
            } else if isDone {
                status = .done
            } else if isPast {
                status = .missed
            } else {
                status = .planned
            }
            return PlannedProgramDay(weekday: weekday, date: date, templates: scheduled, completedCount: completedCount, status: status)
        }
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

    private static func scheduledTemplates(for weekday: Int, program: TrainingProgram, templatesById: [String: WorkoutTemplate]) -> [WorkoutTemplate] {
        program.schedule
            .filter { $0.weekday == weekday }
            .compactMap { templatesById[$0.templateId] }
    }
}

private struct ProgramSectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
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

    private var nextWorkout: NextProgramWorkout? {
        ProgramPlanner.nextWorkout(program: program, templates: templates, logs: logs)
    }

    private var week: [PlannedProgramDay] {
        ProgramPlanner.weekPlan(program: program, templates: templates, logs: logs)
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
                    HStack(spacing: 12) {
                        Image(systemName: "target")
                            .foregroundStyle(Theme.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Next")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(Theme.muted)
                                .textCase(.uppercase)
                            Text(nextWorkout.map { workout in
                                let progress = workout.total > 1 ? " (\(workout.position) of \(workout.total))" : ""
                                return "\(ProgramPlanner.displayDate(workout.date)) - \(workout.template.name)\(progress)"
                            } ?? "No scheduled workout")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                        }
                        Spacer()
                        Button {
                            if let template = nextWorkout?.template {
                                onStart(template)
                            }
                        } label: {
                            Label("Start", systemImage: "play.fill")
                                .lineLimit(1)
                        }
                        .buttonStyle(PrimaryButtonStyle(compact: true))
                        .disabled(nextWorkout == nil)
                    }
                    .padding(12)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(week) { day in
                                ProgramDayChip(day: day)
                            }
                        }
                    }

                    if let rule = program.progressionRule, !rule.isEmpty {
                        Label(rule, systemImage: "calendar.badge.clock")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
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

private struct ProgramDayChip: View {
    let day: PlannedProgramDay

    private var borderColor: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.45)
        case .missed: return Theme.warning.opacity(0.55)
        case .planned, .rest: return Theme.border
        }
    }

    private var backgroundColor: Color {
        switch day.status {
        case .done: return Theme.success.opacity(0.08)
        case .missed: return Theme.warning.opacity(0.08)
        case .planned, .rest: return Theme.background
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(day.weekday.label)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
                Spacer()
                if day.status == .done {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.success)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                if day.templates.isEmpty {
                    Text("Rest")
                        .foregroundStyle(Theme.muted)
                } else {
                    Text(day.templates[0].name)
                        .foregroundStyle(Theme.text)
                    if day.templates.count > 1 {
                        Text("+\(day.templates.count - 1) more")
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .font(.system(size: 12, weight: .semibold))
            .lineLimit(1)

            if day.templates.count > 1 {
                Text("\(day.completedCount)/\(day.templates.count)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
        }
        .frame(width: 96, height: 74, alignment: .topLeading)
        .padding(8)
        .background(backgroundColor)
        .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(borderColor, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
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

    private enum FocusedTextField: Hashable {
        case name
        case description
    }

    @State private var form: WorkoutTemplate
    @Binding var isSaving: Bool
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
                        defaultReps: store.settings.defaultReps
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
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedTextField = nil
                        focusedBuilderField = nil
                    }
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
                                ForEach(templates) { template in
                                    Toggle(template.name, isOn: scheduleToggleBinding(for: weekday.value, templateId: template.id))
                                        .font(.system(size: 14))
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } header: {
                    Text("Weekly Schedule")
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
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedField = nil
                    }
                }
            }
        }
    }

    private func scheduleToggleBinding(for weekday: Int, templateId: String) -> Binding<Bool> {
        Binding(
            get: {
                form.schedule.contains { $0.weekday == weekday && $0.templateId == templateId }
            },
            set: { isScheduled in
                form.schedule.removeAll { $0.weekday == weekday && $0.templateId == templateId }
                if isScheduled {
                    form.schedule.append(ProgramScheduleItem(weekday: weekday, templateId: templateId))
                }
                form.schedule = cleanedSchedule(form.schedule)
            }
        )
    }

    private func scheduleSummary(for weekday: Int) -> String {
        let count = form.schedule.filter { $0.weekday == weekday && !$0.templateId.isEmpty }.count
        if count == 0 { return "Rest" }
        return count == 1 ? "1 routine" : "\(count) routines"
    }

    private func cleanedSchedule(_ schedule: [ProgramScheduleItem]) -> [ProgramScheduleItem] {
        var seen = Set<String>()
        return schedule.enumerated().compactMap { index, item -> (Int, ProgramScheduleItem)? in
            guard !item.templateId.isEmpty else { return nil }
            let key = "\(item.weekday):\(item.templateId)"
            guard seen.insert(key).inserted else { return nil }
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

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            var cleaned = form
            cleaned.name = cleaned.name.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned.description = cleaned.description?.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned.progressionRule = cleaned.progressionRule?.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned.schedule = cleanedSchedule(cleaned.schedule)
            try await store.saveProgram(cleaned)
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
                    Text("These values are used when adding a new exercise to a workout or routine.")
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
