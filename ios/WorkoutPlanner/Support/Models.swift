import Foundation

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
    var id: String { "\(weekday)-\(templateId)" }
    var weekday: Int
    var templateId: String
    var notes: String?
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
        self.active = active
        self.progression = progression
        self.deload = deload
        self.progressionRule = progressionRule
        self.activity = activity
        self.updatedAt = updatedAt
        self.revision = revision
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

    static let defaults = WorkoutSettings(defaultSets: 4, defaultReps: 8, defaultRestTargetSeconds: 0)
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
            return "\(program.schedule.count) scheduled - \(active)"
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
