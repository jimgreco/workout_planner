import Foundation

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

struct UserProfile: Codable, Equatable {
    var sub: String
    var name: String
    var email: String
    var picture: String?
}

struct PersonalBest: Codable, Equatable {
    var weight: String
    var date: String?
    var reps: String?

    init(weight: String, date: String? = nil, reps: String? = nil) {
        self.weight = weight
        self.date = date
        self.reps = reps
    }
}

struct Exercise: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var muscleGroup: String
    var notes: String?
    var description: String?
    var isUnilateral: Bool?
    var usesTime: Bool?
    var defaultSets: Int?
    var defaultReps: Int?
    var personalBest: PersonalBest?
    var updatedAt: String?
    var revision: Int?

    init(
        id: String = UUID().uuidString,
        name: String,
        muscleGroup: String = "Other",
        notes: String? = nil,
        description: String? = nil,
        isUnilateral: Bool? = nil,
        usesTime: Bool? = nil,
        defaultSets: Int? = nil,
        defaultReps: Int? = nil,
        personalBest: PersonalBest? = nil,
        updatedAt: String? = nil,
        revision: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.muscleGroup = muscleGroup
        self.notes = notes
        self.description = description
        self.isUnilateral = isUnilateral
        self.usesTime = usesTime
        self.defaultSets = defaultSets
        self.defaultReps = defaultReps
        self.personalBest = personalBest
        self.updatedAt = updatedAt
        self.revision = revision
    }
}

struct WorkoutSet: Codable, Equatable {
    var reps: String?
    var repsLeft: String?
    var repsRight: String?
    var weight: String?
    var placeholderReps: String?
    var placeholderRepsLeft: String?
    var placeholderRepsRight: String?
    var placeholderWeight: String?
    var placeholderWeightType: String?
    var restStartTime: Double?
    var restDuration: Int?
    var restTargetSeconds: Int?
    var rpe: String?
    var rir: String?
    var setType: String?

    init(
        reps: String? = "",
        repsLeft: String? = nil,
        repsRight: String? = nil,
        weight: String? = "",
        placeholderReps: String? = nil,
        placeholderRepsLeft: String? = nil,
        placeholderRepsRight: String? = nil,
        placeholderWeight: String? = nil,
        placeholderWeightType: String? = nil,
        restStartTime: Double? = nil,
        restDuration: Int? = nil,
        restTargetSeconds: Int? = nil,
        rpe: String? = nil,
        rir: String? = nil,
        setType: String? = nil
    ) {
        self.reps = reps
        self.repsLeft = repsLeft
        self.repsRight = repsRight
        self.weight = weight
        self.placeholderReps = placeholderReps
        self.placeholderRepsLeft = placeholderRepsLeft
        self.placeholderRepsRight = placeholderRepsRight
        self.placeholderWeight = placeholderWeight
        self.placeholderWeightType = placeholderWeightType
        self.restStartTime = restStartTime
        self.restDuration = restDuration
        self.restTargetSeconds = restTargetSeconds
        self.rpe = rpe
        self.rir = rir
        self.setType = setType
    }
}

struct ExerciseItem: Codable, Identifiable, Equatable {
    var id: String { exerciseId }
    var exerciseId: String
    var weightType: String?
    var restTargetSeconds: Int?
    var supersetGroup: String?
    var description: String?
    var useIndividualReps: Bool?
    var sets: [WorkoutSet]

    init(exerciseId: String, weightType: String? = "weight", restTargetSeconds: Int? = nil, supersetGroup: String? = nil, description: String? = nil, useIndividualReps: Bool? = nil, sets: [WorkoutSet]) {
        self.exerciseId = exerciseId
        self.weightType = weightType
        self.restTargetSeconds = restTargetSeconds
        self.supersetGroup = supersetGroup
        self.description = description
        self.useIndividualReps = useIndividualReps
        self.sets = sets
    }
}

struct WorkoutTemplate: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var description: String?
    var exerciseItems: [ExerciseItem]
    var updatedAt: String?
    var revision: Int?

    init(
        id: String = UUID().uuidString,
        name: String,
        description: String? = "",
        exerciseItems: [ExerciseItem] = [],
        updatedAt: String? = nil,
        revision: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.exerciseItems = exerciseItems
        self.updatedAt = updatedAt
        self.revision = revision
    }
}

struct ProgramScheduleItem: Codable, Identifiable, Equatable {
    var id: String
    var templateId: String?
    var notes: String?

    init(id: String = UUID().uuidString, templateId: String? = nil, notes: String? = nil) {
        self.id = id
        self.templateId = templateId?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        self.notes = notes?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case templateId
        case notes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? UUID().uuidString
        templateId = try container.decodeIfPresent(String.self, forKey: .templateId)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        notes = try container.decodeIfPresent(String.self, forKey: .notes)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }
}

struct ProgramProgressionRule: Codable, Equatable {
    var type: String
    var minReps: Int?
    var maxReps: Int?
    var repIncrement: Int?
    var weightIncrement: Double?

    init(
        type: String = "double_progression",
        minReps: Int? = 8,
        maxReps: Int? = 12,
        repIncrement: Int? = 1,
        weightIncrement: Double? = 5
    ) {
        self.type = type
        self.minReps = minReps
        self.maxReps = maxReps
        self.repIncrement = repIncrement
        self.weightIncrement = weightIncrement
    }
}

struct ProgramDeloadRule: Codable, Equatable {
    var type: String
    var everyWeeks: Int?
    var loadPercent: Int?
    var repPercent: Int?
    var startDate: String?

    init(
        type: String = "none",
        everyWeeks: Int? = 4,
        loadPercent: Int? = 85,
        repPercent: Int? = 100,
        startDate: String? = nil
    ) {
        self.type = type
        self.everyWeeks = everyWeeks
        self.loadPercent = loadPercent
        self.repPercent = repPercent
        self.startDate = startDate ?? DateHelpers.todayString()
    }
}

struct ProgramActivity: Codable, Identifiable, Equatable {
    var id: String
    var type: String
    var date: String
    var title: String
    var detail: String?

    init(
        id: String = UUID().uuidString,
        type: String,
        date: String = ISO8601DateFormatter().string(from: Date()),
        title: String,
        detail: String? = nil
    ) {
        self.id = id
        self.type = type
        self.date = date
        self.title = title
        self.detail = detail
    }
}

struct TrainingProgram: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var description: String?
    var schedule: [ProgramScheduleItem]
    var startDate: String
    var insertedRestDays: [String]
    var active: Bool?
    var progression: ProgramProgressionRule?
    var deload: ProgramDeloadRule?
    var progressionRule: String?
    var activity: [ProgramActivity]?
    var updatedAt: String?
    var revision: Int?

    init(
        id: String = UUID().uuidString,
        name: String,
        description: String? = "",
        schedule: [ProgramScheduleItem] = [],
        startDate: String = DateHelpers.todayString(),
        insertedRestDays: [String] = [],
        active: Bool? = true,
        progression: ProgramProgressionRule? = ProgramProgressionRule(),
        deload: ProgramDeloadRule? = nil,
        progressionRule: String? = "",
        activity: [ProgramActivity]? = nil,
        updatedAt: String? = nil,
        revision: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.schedule = schedule
        self.startDate = startDate
        self.insertedRestDays = insertedRestDays
        self.active = active
        self.progression = progression
        self.deload = deload
        self.progressionRule = progressionRule
        self.activity = activity
        self.updatedAt = updatedAt
        self.revision = revision
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case description
        case schedule
        case startDate
        case insertedRestDays
        case active
        case progression
        case deload
        case progressionRule
        case activity
        case updatedAt
        case revision
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description)
        schedule = try container.decodeIfPresent([ProgramScheduleItem].self, forKey: .schedule) ?? []
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate) ?? DateHelpers.todayString()
        insertedRestDays = (try container.decodeIfPresent([String].self, forKey: .insertedRestDays) ?? []).sorted()
        active = try container.decodeIfPresent(Bool.self, forKey: .active)
        progression = try container.decodeIfPresent(ProgramProgressionRule.self, forKey: .progression)
        deload = try container.decodeIfPresent(ProgramDeloadRule.self, forKey: .deload)
        progressionRule = try container.decodeIfPresent(String.self, forKey: .progressionRule)
        activity = try container.decodeIfPresent([ProgramActivity].self, forKey: .activity)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        revision = try container.decodeIfPresent(Int.self, forKey: .revision)
    }
}

struct WorkoutLog: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var date: String
    var notes: String?
    var readiness: Int?
    var exerciseItems: [ExerciseItem]
    var startTime: String?
    var endTime: String?
    var status: String?
    var hasPB: Bool?
    var pbExerciseIds: [String]?
    var updatedAt: String?
    var revision: Int?

    init(
        id: String = UUID().uuidString,
        name: String,
        date: String,
        notes: String? = "",
        readiness: Int? = nil,
        exerciseItems: [ExerciseItem] = [],
        startTime: String? = nil,
        endTime: String? = nil,
        status: String? = nil,
        hasPB: Bool? = nil,
        pbExerciseIds: [String]? = nil,
        updatedAt: String? = nil,
        revision: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.date = date
        self.notes = notes
        self.readiness = readiness
        self.exerciseItems = exerciseItems
        self.startTime = startTime
        self.endTime = endTime
        self.status = status
        self.hasPB = hasPB
        self.pbExerciseIds = pbExerciseIds
        self.updatedAt = updatedAt
        self.revision = revision
    }
}

struct WorkoutSettings: Codable, Equatable {
    var defaultSets: Int
    var defaultReps: Int
    var defaultRestTargetSeconds: Int?
    var advancedMode: Bool

    static let defaults = WorkoutSettings(defaultSets: 4, defaultReps: 8, defaultRestTargetSeconds: 0, advancedMode: false)

    init(defaultSets: Int, defaultReps: Int, defaultRestTargetSeconds: Int? = 0, advancedMode: Bool = false) {
        self.defaultSets = defaultSets
        self.defaultReps = defaultReps
        self.defaultRestTargetSeconds = defaultRestTargetSeconds
        self.advancedMode = advancedMode
    }

    enum CodingKeys: String, CodingKey {
        case defaultSets
        case defaultReps
        case defaultRestTargetSeconds
        case advancedMode
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        defaultSets = try container.decodeIfPresent(Int.self, forKey: .defaultSets) ?? 4
        defaultReps = try container.decodeIfPresent(Int.self, forKey: .defaultReps) ?? 8
        defaultRestTargetSeconds = try container.decodeIfPresent(Int.self, forKey: .defaultRestTargetSeconds) ?? 0
        advancedMode = try container.decodeIfPresent(Bool.self, forKey: .advancedMode) ?? false
    }
}

private let workoutWeightTypes: Set<String> = ["weight", "double", "bar_double", "none"]

private func workoutLogSortKey(_ log: WorkoutLog) -> String {
    log.endTime ?? log.startTime ?? "\(log.date)T00:00:00"
}

func lastWeightTypesByExerciseId(from logs: [WorkoutLog]) -> [String: String] {
    var result: [String: String] = [:]
    let finishedLogs = logs
        .filter { $0.status == "finished" }
        .sorted { workoutLogSortKey($0) > workoutLogSortKey($1) }

    for log in finishedLogs {
        for item in log.exerciseItems where result[item.exerciseId] == nil {
            let weightType = item.weightType ?? "weight"
            guard workoutWeightTypes.contains(weightType) else { continue }
            result[item.exerciseId] = weightType
        }
    }

    return result
}

private func workoutCleanedText(_ value: String?) -> String {
    value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
}

private func workoutRepTargetText(_ value: String?) -> String {
    let text = workoutCleanedText(value)
    guard !text.isEmpty else { return "" }
    if let open = text.firstIndex(of: "("),
       let close = text.lastIndex(of: ")"),
       open < close {
        let goal = text[text.index(after: open)..<close].trimmingCharacters(in: .whitespacesAndNewlines)
        if !goal.isEmpty { return goal }
    }
    return text
}

private func workoutRepRangeMax(_ value: String?) -> Double? {
    let text = workoutRepTargetText(value)
    let parts = text
        .split(maxSplits: 1, omittingEmptySubsequences: false) { $0 == "-" || $0 == "–" }
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    guard parts.count == 2, !parts[1].isEmpty else { return nil }
    return Double(parts[1])
}

private func workoutRepNumber(_ value: String?) -> Double? {
    let text = workoutCleanedText(value)
    let prefix = text.prefix { character in
        character.isNumber || character == "."
    }
    guard !prefix.isEmpty else { return nil }
    return Double(prefix)
}

private func workoutFirstRepRangeMax(_ values: [String?]) -> Double? {
    for value in values {
        if let max = workoutRepRangeMax(value) { return max }
    }
    return nil
}

private func workoutLastFinishedItem(exerciseId: String, logs: [WorkoutLog]) -> ExerciseItem? {
    let finishedLogs = logs
        .filter { $0.status == "finished" }
        .sorted { workoutLogSortKey($0) > workoutLogSortKey($1) }

    for log in finishedLogs {
        if let item = log.exerciseItems.first(where: { $0.exerciseId == exerciseId }) {
            return item
        }
    }
    return nil
}

private func workoutLoggedRepValue(_ set: WorkoutSet) -> Double {
    max(workoutRepNumber(set.reps) ?? 0, workoutRepNumber(set.repsLeft) ?? 0, workoutRepNumber(set.repsRight) ?? 0)
}

private func workoutLoggedSideRepValue(_ set: WorkoutSet, left: Bool) -> Double {
    workoutRepNumber(left ? set.repsLeft : set.repsRight) ?? workoutRepNumber(set.reps) ?? 0
}

private func workoutRoutineLastSetRepCaps(_ set: WorkoutSet) -> (common: Double?, left: Double?, right: Double?) {
    (
        common: workoutFirstRepRangeMax([set.placeholderReps, set.reps]),
        left: workoutFirstRepRangeMax([set.placeholderRepsLeft, set.repsLeft]),
        right: workoutFirstRepRangeMax([set.placeholderRepsRight, set.repsRight])
    )
}

func routineExerciseNeedsWeightIncrease(_ item: ExerciseItem, logs: [WorkoutLog]) -> Bool {
    guard item.weightType != "none",
          !item.exerciseId.isEmpty,
          let targetSet = item.sets.last
    else { return false }

    let caps = workoutRoutineLastSetRepCaps(targetSet)
    guard caps.common != nil || caps.left != nil || caps.right != nil else { return false }
    guard let lastItem = workoutLastFinishedItem(exerciseId: item.exerciseId, logs: logs),
          lastItem.weightType != "none",
          lastItem.sets.count >= item.sets.count
    else { return false }

    let loggedSet = lastItem.sets[item.sets.count - 1]
    if let common = caps.common {
        return workoutLoggedRepValue(loggedSet) >= common
    }

    var checks: [Bool] = []
    if let left = caps.left {
        checks.append(workoutLoggedSideRepValue(loggedSet, left: true) >= left)
    }
    if let right = caps.right {
        checks.append(workoutLoggedSideRepValue(loggedSet, left: false) >= right)
    }
    return !checks.isEmpty && checks.allSatisfy { $0 }
}

enum SyncConflictResource: String, Codable, CaseIterable {
    case exercises
    case templates
    case logs
    case programs

    var label: String {
        switch self {
        case .exercises: return "Exercise"
        case .templates: return "Routine"
        case .logs: return "Workout"
        case .programs: return "Program"
        }
    }
}

enum SyncConflictOperation: String, Codable {
    case put
    case delete
}

enum SyncConflictResolution {
    case local
    case remote
}

struct SyncConflictValue: Codable, Equatable {
    var exercise: Exercise? = nil
    var template: WorkoutTemplate? = nil
    var log: WorkoutLog? = nil
    var program: TrainingProgram? = nil

    var title: String {
        if let exercise { return exercise.name }
        if let template { return template.name }
        if let log { return log.name.isEmpty ? "Workout \(log.date)" : log.name }
        if let program { return program.name }
        return "Deleted item"
    }

    var subtitle: String {
        if let exercise { return exercise.muscleGroup }
        if let template { return "\(template.exerciseItems.count) exercises" }
        if let log { return "\(log.date) - \(log.status ?? "active")" }
        if let program {
            let active = program.active == true ? "active" : "inactive"
            return "\(program.schedule.count) cycle days - \(active)"
        }
        return "No cloud copy"
    }

    var revision: Int? {
        exercise?.revision ?? template?.revision ?? log?.revision ?? program?.revision
    }

    var updatedAt: String? {
        exercise?.updatedAt ?? template?.updatedAt ?? log?.updatedAt ?? program?.updatedAt
    }

    static func exercise(_ exercise: Exercise) -> SyncConflictValue {
        SyncConflictValue(exercise: exercise)
    }

    static func template(_ template: WorkoutTemplate) -> SyncConflictValue {
        SyncConflictValue(template: template)
    }

    static func log(_ log: WorkoutLog) -> SyncConflictValue {
        SyncConflictValue(log: log)
    }

    static func program(_ program: TrainingProgram) -> SyncConflictValue {
        SyncConflictValue(program: program)
    }
}

struct SyncConflictItem: Codable, Identifiable, Equatable {
    var resource: SyncConflictResource
    var operation: SyncConflictOperation
    var itemId: String
    var local: SyncConflictValue?
    var remote: SyncConflictValue?
    var expectedRevision: Int?
    var actualRevision: Int?
    var requestId: String?
    var createdAt: String

    var id: String { "\(resource.rawValue):\(itemId)" }
}

enum ForgeImportMode: String, Codable, CaseIterable, Identifiable {
    case merge
    case emptyOnly

    var id: String { rawValue }

    var label: String {
        switch self {
        case .merge: return "Merge"
        case .emptyOnly: return "Empty Account"
        }
    }
}

struct ForgeExportPayload: Codable, Equatable {
    var exportedAt: String?
    var exercises: [Exercise]?
    var templates: [WorkoutTemplate]?
    var logs: [WorkoutLog]?
    var programs: [TrainingProgram]?
    var settings: WorkoutSettings?
}

struct ForgeImportRequest: Encodable {
    var mode: ForgeImportMode
    var data: ForgeExportPayload
}

struct ForgeImportCounts: Codable, Equatable {
    var exercises: Int
    var templates: Int
    var logs: Int
    var programs: Int
    var settings: Bool?
}

struct ForgeSkippedExercise: Codable, Equatable {
    var id: String
    var name: String?
}

struct ForgeSkippedLog: Codable, Equatable {
    var id: String
    var name: String?
    var date: String?
}

struct ForgeImportSkipped: Codable, Equatable {
    var exercises: [ForgeSkippedExercise]?
    var templates: [ForgeSkippedExercise]?
    var logs: [ForgeSkippedLog]?
    var programs: [ForgeSkippedExercise]?
}

struct ForgeImportRename: Codable, Equatable {
    var from: String
    var to: String
}

struct ForgeImportRenamed: Codable, Equatable {
    var exercises: [ForgeImportRename]?
    var templates: [ForgeImportRename]?
    var logs: [ForgeImportRename]?
    var programs: [ForgeImportRename]?
}

struct ForgeImportResult: Codable, Equatable {
    var imported: ForgeImportCounts
    var renamed: ForgeImportRenamed?
    var skipped: ForgeImportSkipped?
}

struct ForgeImportPreview: Equatable {
    struct Counts: Equatable {
        var exercises: Int
        var templates: Int
        var logs: Int
        var programs: Int
        var settings: Int
    }

    struct DuplicateIds: Equatable {
        var exercises: Int
        var templates: Int
        var logs: Int
        var programs: Int
    }

    var counts: Counts
    var duplicateIds: DuplicateIds
    var isEmpty: Bool
    var targetIsEmpty: Bool
}

enum MuscleGroups {
    static let all = [
        "Chest", "Back", "Shoulders", "Biceps", "Triceps",
        "Forearms", "Core", "Quads", "Hamstrings", "Glutes",
        "Calves", "Full Body", "Cardio", "Other",
    ]
}

enum DateHelpers {
    static let apiDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static let displayDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    static func todayString() -> String {
        apiDay.string(from: Date())
    }

    static func date(from day: String) -> Date {
        apiDay.date(from: day) ?? Date()
    }

    static func dayString(from date: Date) -> String {
        apiDay.string(from: date)
    }
}

enum ProgramScheduleStatus {
    case rest
    case planned
    case done
    case skipped
    case missed
}

struct ProgramNextWorkout {
    let date: Date
    let dayKey: String
    let template: WorkoutTemplate
    let scheduleItem: ProgramScheduleItem
    let scheduleIndex: Int
    let position: Int
    let total: Int
}

struct ProgramCycleDay: Identifiable {
    let scheduleItem: ProgramScheduleItem
    let index: Int
    let template: WorkoutTemplate?
    let isCurrent: Bool
    let isNext: Bool

    var id: String { scheduleItem.id }
}

struct ProgramUpcomingDay: Identifiable {
    let date: Date
    let dayKey: String
    let scheduleIndex: Int?
    let scheduleItem: ProgramScheduleItem?
    let template: WorkoutTemplate?
    let isInsertedRest: Bool
    let isBeforeStart: Bool
    let status: ProgramScheduleStatus

    var id: String { dayKey }
}

struct ProgramAdherenceSummary {
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

struct ProgramDeloadInfo {
    let isDeload: Bool
    let nextDate: Date
    let weekNumber: Int
    let instruction: String
}

enum ProgramCyclePlanner {
    private struct ProgramSlot {
        let date: Date
        let dayKey: String
        let scheduleIndex: Int?
        let scheduleItem: ProgramScheduleItem?
        let template: WorkoutTemplate?
        let isInsertedRest: Bool
        let isBeforeStart: Bool
    }

    static func activeProgram(from programs: [TrainingProgram]) -> TrainingProgram? {
        programs.first { $0.active == true }
    }

    static func scheduleTitle(for item: ProgramScheduleItem, templates: [WorkoutTemplate]) -> String {
        guard let templateId = item.templateId?.trimmingCharacters(in: .whitespacesAndNewlines), !templateId.isEmpty else {
            return "Rest"
        }
        return templates.first(where: { $0.id == templateId })?.name ?? "Missing routine"
    }

    static func cycleDayLabel(index: Int) -> String {
        "Day \(index + 1)"
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

    static func statusLabel(for day: ProgramUpcomingDay) -> String {
        if day.isBeforeStart { return "Before start" }
        if day.isInsertedRest { return "Inserted rest" }
        switch day.status {
        case .rest: return "Rest"
        case .planned: return "Planned"
        case .done: return "Done"
        case .skipped: return "Skipped"
        case .missed: return "Missed"
        }
    }

    static func nextOccurrence(for dayId: String, upcoming: [ProgramUpcomingDay]) -> ProgramUpcomingDay? {
        upcoming.first { $0.scheduleItem?.id == dayId && !$0.isInsertedRest }
    }

    static func replaceScheduleItem(_ schedule: [ProgramScheduleItem], dayId: String, templateId: String) -> [ProgramScheduleItem] {
        schedule.map { item in
            guard item.id == dayId else { return item }
            var updated = item
            let cleaned = templateId.trimmingCharacters(in: .whitespacesAndNewlines)
            updated.templateId = cleaned.isEmpty ? nil : cleaned
            return updated
        }
    }

    static func swapScheduleDays(_ schedule: [ProgramScheduleItem], sourceId: String, targetId: String) -> [ProgramScheduleItem] {
        guard let sourceIndex = schedule.firstIndex(where: { $0.id == sourceId }),
              let targetIndex = schedule.firstIndex(where: { $0.id == targetId }),
              sourceIndex != targetIndex else {
            return schedule
        }
        var next = schedule
        next.swapAt(sourceIndex, targetIndex)
        return next
    }

    static func moveScheduleDay(_ schedule: [ProgramScheduleItem], from sourceIndex: Int, to targetIndex: Int) -> [ProgramScheduleItem] {
        guard schedule.indices.contains(sourceIndex), schedule.indices.contains(targetIndex), sourceIndex != targetIndex else {
            return schedule
        }
        var next = schedule
        let moved = next.remove(at: sourceIndex)
        next.insert(moved, at: targetIndex)
        return next
    }

    static func removeScheduleDay(_ schedule: [ProgramScheduleItem], dayId: String) -> [ProgramScheduleItem] {
        schedule.filter { $0.id != dayId }
    }

    static func insertRestDay(_ program: TrainingProgram, dayKey: String) -> TrainingProgram {
        guard DateHelpers.apiDay.date(from: dayKey) != nil else { return program }
        var updated = program
        updated.insertedRestDays = Array(Set((program.insertedRestDays + [dayKey]))).sorted()
        return updated
    }

    static func cycleDays(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog]) -> [ProgramCycleDay] {
        guard let program else { return [] }
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let currentSlot = slot(for: Date(), program: program, templatesById: templatesById)
        let nextWorkout = nextWorkout(program: program, templates: templates, logs: logs)

        return program.schedule.enumerated().map { index, item in
            let template = item.templateId.flatMap { templatesById[$0] }
            return ProgramCycleDay(
                scheduleItem: item,
                index: index,
                template: template,
                isCurrent: currentSlot.scheduleItem?.id == item.id && !currentSlot.isInsertedRest && !currentSlot.isBeforeStart,
                isNext: nextWorkout?.scheduleItem.id == item.id
            )
        }
    }

    static func nextWorkout(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog], lookaheadDays: Int = 28) -> ProgramNextWorkout? {
        guard let program, !program.schedule.isEmpty else { return nil }
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())

        for offset in 0..<lookaheadDays {
            guard let date = Calendar.current.date(byAdding: .day, value: offset, to: today) else { continue }
            let currentSlot = slot(for: date, program: program, templatesById: templatesById)
            guard let template = currentSlot.template,
                  let scheduleItem = currentSlot.scheduleItem,
                  let scheduleIndex = currentSlot.scheduleIndex,
                  !handledOn(logs: logs, template: template, dayKey: currentSlot.dayKey)
            else { continue }

            return ProgramNextWorkout(
                date: date,
                dayKey: currentSlot.dayKey,
                template: template,
                scheduleItem: scheduleItem,
                scheduleIndex: scheduleIndex,
                position: scheduleIndex + 1,
                total: program.schedule.count
            )
        }

        return nil
    }

    static func upcomingSchedule(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog], days: Int = 21) -> [ProgramUpcomingDay] {
        guard let program else { return [] }
        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())

        return (0..<days).compactMap { offset in
            guard let date = Calendar.current.date(byAdding: .day, value: offset, to: today) else { return nil }
            let currentSlot = slot(for: date, program: program, templatesById: templatesById)
            return ProgramUpcomingDay(
                date: date,
                dayKey: currentSlot.dayKey,
                scheduleIndex: currentSlot.scheduleIndex,
                scheduleItem: currentSlot.scheduleItem,
                template: currentSlot.template,
                isInsertedRest: currentSlot.isInsertedRest,
                isBeforeStart: currentSlot.isBeforeStart,
                status: status(for: currentSlot, logs: logs)
            )
        }
    }

    static func adherenceSummary(program: TrainingProgram?, templates: [WorkoutTemplate], logs: [WorkoutLog], weeks: Int = 4) -> ProgramAdherenceSummary {
        guard let program, !program.schedule.isEmpty else {
            return ProgramAdherenceSummary(weeks: weeks, scheduled: 0, completed: 0, skipped: 0, missed: 0, remainingToday: 0)
        }

        let templatesById = Dictionary(uniqueKeysWithValues: templates.map { ($0.id, $0) })
        let today = Calendar.current.startOfDay(for: Date())
        let start = Calendar.current.date(byAdding: .day, value: -((weeks * 7) - 1), to: today) ?? today
        var scheduled = 0
        var completed = 0
        var skipped = 0
        var missed = 0
        var remainingToday = 0

        var date = start
        while date <= today {
            let currentSlot = slot(for: date, program: program, templatesById: templatesById)
            if let template = currentSlot.template {
                scheduled += 1
                if completedOn(logs: logs, template: template, dayKey: currentSlot.dayKey) {
                    completed += 1
                } else if skippedOn(logs: logs, template: template, dayKey: currentSlot.dayKey) {
                    skipped += 1
                } else if date < today {
                    missed += 1
                } else {
                    remainingToday += 1
                }
            }
            date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? today
        }

        return ProgramAdherenceSummary(
            weeks: weeks,
            scheduled: scheduled,
            completed: completed,
            skipped: skipped,
            missed: missed,
            remainingToday: remainingToday
        )
    }

    static func deloadInfo(program: TrainingProgram?, date: Date = Date()) -> ProgramDeloadInfo? {
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

        return ProgramDeloadInfo(
            isDeload: isDeload,
            nextDate: nextDate,
            weekNumber: weekNumber,
            instruction: instruction
        )
    }

    private static func status(for slot: ProgramSlot, logs: [WorkoutLog]) -> ProgramScheduleStatus {
        guard let template = slot.template else { return .rest }
        if handledOn(logs: logs, template: template, dayKey: slot.dayKey) {
            return completedOn(logs: logs, template: template, dayKey: slot.dayKey) ? .done : .skipped
        }
        return slot.date < Calendar.current.startOfDay(for: Date()) ? .missed : .planned
    }

    private static func slot(for date: Date, program: TrainingProgram, templatesById: [String: WorkoutTemplate]) -> ProgramSlot {
        let targetDate = Calendar.current.startOfDay(for: date)
        let dayKey = DateHelpers.dayString(from: targetDate)
        let startDate = DateHelpers.date(from: program.startDate)

        guard !program.schedule.isEmpty else {
            return ProgramSlot(date: targetDate, dayKey: dayKey, scheduleIndex: nil, scheduleItem: nil, template: nil, isInsertedRest: false, isBeforeStart: false)
        }

        if targetDate < Calendar.current.startOfDay(for: startDate) {
            return ProgramSlot(date: targetDate, dayKey: dayKey, scheduleIndex: nil, scheduleItem: nil, template: nil, isInsertedRest: false, isBeforeStart: true)
        }

        if program.insertedRestDays.contains(dayKey) {
            return ProgramSlot(date: targetDate, dayKey: dayKey, scheduleIndex: nil, scheduleItem: nil, template: nil, isInsertedRest: true, isBeforeStart: false)
        }

        let priorRestCount = program.insertedRestDays.filter { $0 < dayKey }.count
        let elapsed = dayDifference(from: startDate, to: targetDate) - priorRestCount
        if elapsed < 0 {
            return ProgramSlot(date: targetDate, dayKey: dayKey, scheduleIndex: nil, scheduleItem: nil, template: nil, isInsertedRest: false, isBeforeStart: true)
        }

        let scheduleIndex = positiveModulo(elapsed, program.schedule.count)
        let scheduleItem = program.schedule[scheduleIndex]
        let template = scheduleItem.templateId.flatMap { templatesById[$0] }
        return ProgramSlot(
            date: targetDate,
            dayKey: dayKey,
            scheduleIndex: scheduleIndex,
            scheduleItem: scheduleItem,
            template: template,
            isInsertedRest: false,
            isBeforeStart: false
        )
    }

    private static func handledOn(logs: [WorkoutLog], template: WorkoutTemplate, dayKey: String) -> Bool {
        completedOn(logs: logs, template: template, dayKey: dayKey)
            || skippedOn(logs: logs, template: template, dayKey: dayKey)
    }

    private static func completedOn(logs: [WorkoutLog], template: WorkoutTemplate, dayKey: String) -> Bool {
        let templateName = template.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return logs.contains { log in
            log.date == dayKey
                && log.status == "finished"
                && log.name.trimmingCharacters(in: .whitespacesAndNewlines)
                    .caseInsensitiveCompare(templateName) == .orderedSame
        }
    }

    private static func skippedOn(logs: [WorkoutLog], template: WorkoutTemplate, dayKey: String) -> Bool {
        let templateName = template.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return logs.contains { log in
            log.date == dayKey
                && log.status == "skipped"
                && log.name.trimmingCharacters(in: .whitespacesAndNewlines)
                    .caseInsensitiveCompare(templateName) == .orderedSame
        }
    }

    private static func dayDifference(from start: Date, to end: Date) -> Int {
        Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: start), to: Calendar.current.startOfDay(for: end)).day ?? 0
    }

    private static func positiveModulo(_ value: Int, _ count: Int) -> Int {
        ((value % count) + count) % count
    }

    private static func startOfWeek(_ date: Date) -> Date {
        let startOfDay = Calendar.current.startOfDay(for: date)
        let weekdayOffset = Calendar.current.component(.weekday, from: startOfDay) - 1
        return Calendar.current.date(byAdding: .day, value: -weekdayOffset, to: startOfDay) ?? startOfDay
    }

    private static func deloadInstruction(_ deload: ProgramDeloadRule) -> String? {
        guard deload.type != "none" else { return nil }
        return "\(deload.loadPercent ?? 85)% load / \(deload.repPercent ?? 100)% reps"
    }
}

func formatDuration(startTime: String?, endTime: String? = nil) -> String {
    guard let startTime, let start = ISO8601DateFormatter().date(from: startTime) else { return "" }
    let end = endTime.flatMap { ISO8601DateFormatter().date(from: $0) } ?? Date()
    let minutes = max(0, Int(round(end.timeIntervalSince(start) / 60)))
    if minutes < 60 { return "\(minutes)m" }
    let hours = minutes / 60
    let remaining = minutes % 60
    return remaining > 0 ? "\(hours)h \(remaining)m" : "\(hours)h"
}

func restDurationText(_ seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    return String(format: "%02d:%02d", safeSeconds / 60, safeSeconds % 60)
}

func restTargetLabel(_ seconds: Int?) -> String {
    guard let seconds, seconds > 0 else { return "None" }
    if seconds < 60 { return "\(seconds)s" }
    let minutes = seconds / 60
    let remaining = seconds % 60
    return remaining == 0 ? "\(minutes)m" : "\(minutes):\(String(format: "%02d", remaining))"
}

struct PersonalBestCandidate {
    let weight: String
    let reps: String?
    let weightValue: Double
    let repsValue: Double
}

private func personalBestNumber(_ value: String?) -> Double {
    Double((value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
}

private func personalBestNumberLabel(_ value: Double) -> String {
    value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
}

private func effectivePersonalBestWeight(_ weight: String?, weightType: String?) -> Double {
    let value = personalBestNumber(weight)
    guard value > 0, weightType != "none" else { return 0 }
    if weightType == "bar_double" { return (value * 2) + 45 }
    if weightType == "double" { return value * 2 }
    return value
}

private func personalBestTextLabel(_ value: String?) -> String? {
    let text = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return nil }
    if let number = Double(text) {
        return personalBestNumberLabel(number)
    }
    return text
}

func personalBestLabel(_ best: PersonalBest?, usesTime: Bool = false) -> String? {
    guard let best, let weight = personalBestTextLabel(best.weight) else { return nil }
    let reps = personalBestNumber(best.reps)
    if reps > 0 {
        return "\(weight) lbs x \(personalBestNumberLabel(reps)) \(usesTime ? "secs" : "reps")"
    }
    return "\(weight) lbs"
}

func bestPersonalBestCandidate(from sets: [WorkoutSet], weightType: String? = "weight") -> PersonalBestCandidate? {
    sets.reduce(PersonalBestCandidate?.none) { current, set in
        let weight = effectivePersonalBestWeight(set.weight, weightType: weightType)
        guard weight > 0 else { return current }
        let reps = personalBestNumber(set.reps)
        if current == nil || weight > current!.weightValue || (weight == current!.weightValue && reps > current!.repsValue) {
            return PersonalBestCandidate(
                weight: personalBestNumberLabel(weight),
                reps: reps > 0 ? personalBestNumberLabel(reps) : nil,
                weightValue: weight,
                repsValue: reps
            )
        }
        return current
    }
}

func isPersonalBestImprovement(_ candidate: PersonalBestCandidate?, over current: PersonalBest?) -> Bool {
    guard let candidate else { return false }
    let currentWeight = personalBestNumber(current?.weight)
    let currentReps = personalBestNumber(current?.reps)
    if candidate.weightValue > currentWeight { return true }
    if candidate.weightValue == currentWeight && candidate.repsValue > currentReps { return true }
    return false
}

func personalBestPayload(_ candidate: PersonalBestCandidate, date: String) -> PersonalBest {
    PersonalBest(weight: candidate.weight, date: date, reps: candidate.reps)
}

func setTypeLabel(_ type: String?) -> String {
    switch type {
    case "warmup": return "Warmup"
    case "drop": return "Drop"
    case "failure": return "Failure"
    default: return "Working"
    }
}

func supersetLabel(_ group: String?) -> String {
    guard let group, !group.isEmpty else { return "None" }
    return "Superset \(group)"
}

func progressionSummary(_ rule: ProgramProgressionRule?) -> String? {
    guard let rule, rule.type != "none" else { return nil }
    switch rule.type {
    case "double_progression":
        return "\(rule.minReps ?? 8)-\(rule.maxReps ?? 12) reps, +\(rule.repIncrement ?? 1) rep until cap, then +\(formatProgressionNumber(rule.weightIncrement ?? 5)) lb"
    case "linear_weight":
        return "Add \(formatProgressionNumber(rule.weightIncrement ?? 5)) lb when all target reps are hit"
    case "linear_reps":
        return "Add \(rule.repIncrement ?? 1) rep when all target reps are hit"
    default:
        return nil
    }
}

func deloadInstruction(_ rule: ProgramDeloadRule?) -> String? {
    guard let rule, rule.type != "none" else { return nil }
    return "\(rule.loadPercent ?? 85)% load / \(rule.repPercent ?? 100)% reps"
}

func deloadSummary(_ rule: ProgramDeloadRule?) -> String? {
    guard let rule, rule.type != "none", let instruction = deloadInstruction(rule) else { return nil }
    let start = DateHelpers.date(from: rule.startDate ?? DateHelpers.todayString())
    let startLabel = start.formatted(.dateTime.month(.abbreviated).day())
    return "Every \(rule.everyWeeks ?? 4) weeks: \(instruction), starting \(startLabel)"
}

func formatProgressionNumber(_ value: Double) -> String {
    if value.rounded() == value {
        return String(Int(value))
    }
    return String(format: "%.1f", value)
}

func reservesCalculatedWeightCaption(weightType: String?) -> Bool {
    weightType == "double" || weightType == "bar_double"
}

func calculatedWeightTotal(weight: String?, weightType: String?) -> Double? {
    let value = Double((weight ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
    guard value > 0 else { return nil }
    switch weightType {
    case "double":
        return value * 2
    case "bar_double":
        return (value * 2) + 45
    default:
        return nil
    }
}

func calculatedWeightCaption(weight: String?, weightType: String?) -> String? {
    guard let total = calculatedWeightTotal(weight: weight, weightType: weightType) else { return nil }
    return "Total \(formatProgressionNumber(total)) lbs"
}

func contextualWeightPlaceholder(weight: String?, sourceWeightType: String?, targetWeightType: String?) -> String? {
    let raw = (weight ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return nil }
    guard let value = Double(raw) else { return raw }

    let sourceType = sourceWeightType ?? targetWeightType ?? "weight"
    let targetType = targetWeightType ?? "weight"
    let total: Double
    switch sourceType {
    case "double":
        total = value * 2
    case "bar_double":
        total = (value * 2) + 45
    default:
        total = value
    }

    let contextualValue: Double
    switch targetType {
    case "double":
        contextualValue = total / 2
    case "bar_double":
        contextualValue = max(0, (total - 45) / 2)
    default:
        contextualValue = total
    }
    return formatProgressionNumber(contextualValue)
}

func restTimeText(startTime: Double?, duration: Int?, targetSeconds: Int? = nil) -> String {
    let seconds: Int
    if let duration {
        seconds = duration
    } else if let startTime {
        seconds = max(0, Int((Date().timeIntervalSince1970 * 1000 - startTime) / 1000))
    } else {
        seconds = 0
    }
    if duration == nil, startTime != nil, let targetSeconds, targetSeconds > 0 {
        let remaining = targetSeconds - seconds
        if remaining >= 0 {
            return restDurationText(remaining)
        }
        return "+\(restDurationText(abs(remaining)))"
    }
    return restDurationText(seconds)
}
