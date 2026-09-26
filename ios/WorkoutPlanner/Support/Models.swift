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
    var equipmentAlternatives: [EquipmentAlternative]?
    var equipmentSetups: [EquipmentSetup]?
    var deletedEquipmentSetupIds: [String]?
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
        revision: Int? = nil,
        equipmentAlternatives: [EquipmentAlternative]? = nil,
        equipmentSetups: [EquipmentSetup]? = nil,
        deletedEquipmentSetupIds: [String]? = nil
    ) {
        self.equipmentAlternatives = equipmentAlternatives
        self.equipmentSetups = equipmentSetups
        self.deletedEquipmentSetupIds = deletedEquipmentSetupIds
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
    var repMode: String?
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
    var completion: String?
    var setType: String?

    init(
        reps: String? = "",
        repsLeft: String? = nil,
        repsRight: String? = nil,
        repMode: String? = nil,
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
        setType: String? = nil,
        completion: String? = nil
    ) {
        self.reps = reps
        self.repsLeft = repsLeft
        self.repsRight = repsRight
        self.repMode = repMode
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
        self.rir = Self.normalizedRir(rir)
        self.setType = setType
        self.completion = completion
    }

    static func normalizedRir(_ value: String?) -> String? {
        let text = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? nil : text
    }

    private enum CodingKeys: String, CodingKey {
        case reps
        case repsLeft
        case repsRight
        case repMode
        case weight
        case placeholderReps
        case placeholderRepsLeft
        case placeholderRepsRight
        case placeholderWeight
        case placeholderWeightType
        case restStartTime
        case restDuration
        case restTargetSeconds
        case rpe
        case rir
        case completion
        case setType
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(reps, forKey: .reps)
        try container.encodeIfPresent(repsLeft, forKey: .repsLeft)
        try container.encodeIfPresent(repsRight, forKey: .repsRight)
        try container.encodeIfPresent(repMode, forKey: .repMode)
        try container.encodeIfPresent(weight, forKey: .weight)
        try container.encodeIfPresent(placeholderReps, forKey: .placeholderReps)
        try container.encodeIfPresent(placeholderRepsLeft, forKey: .placeholderRepsLeft)
        try container.encodeIfPresent(placeholderRepsRight, forKey: .placeholderRepsRight)
        try container.encodeIfPresent(placeholderWeight, forKey: .placeholderWeight)
        try container.encodeIfPresent(placeholderWeightType, forKey: .placeholderWeightType)
        try container.encodeIfPresent(restStartTime, forKey: .restStartTime)
        try container.encodeIfPresent(restDuration, forKey: .restDuration)
        try container.encodeIfPresent(restTargetSeconds, forKey: .restTargetSeconds)
        try container.encodeIfPresent(rpe, forKey: .rpe)
        try container.encode(Self.normalizedRir(rir), forKey: .rir)
        try container.encodeIfPresent(completion, forKey: .completion)
        try container.encodeIfPresent(setType, forKey: .setType)
    }
}

struct EquipmentSetup: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name = ""
    var gym = ""
    var machine = ""
    var seat = ""
    var grip = ""
    var loadConvention = ""
    var smithBarWeight: Double?

    var displayName: String {
        let parts = [gym, machine].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return parts.isEmpty ? (name.isEmpty ? "Equipment setup" : name) : parts.joined(separator: " · ")
    }

    var isValid: Bool {
        !machine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        [gym, machine, seat, grip, loadConvention].allSatisfy { $0.count <= 120 } &&
        (smithBarWeight == nil || validSmithBarWeight(smithBarWeight) != nil)
    }

    var cleaned: EquipmentSetup {
        var result = self
        result.gym = gym.trimmingCharacters(in: .whitespacesAndNewlines)
        result.machine = machine.trimmingCharacters(in: .whitespacesAndNewlines)
        result.seat = seat.trimmingCharacters(in: .whitespacesAndNewlines)
        result.grip = grip.trimmingCharacters(in: .whitespacesAndNewlines)
        result.loadConvention = loadConvention.trimmingCharacters(in: .whitespacesAndNewlines)
        result.name = String(result.displayName.prefix(120))
        return result
    }
}

extension Exercise {
    mutating func removeSetup(_ id: String) {
        equipmentSetups = (equipmentSetups ?? []).filter { $0.id != id }
        deletedEquipmentSetupIds = Array(Set((deletedEquipmentSetupIds ?? []) + [id])).sorted()
    }

    func currentSetup(_ profile: EquipmentSetup?) -> EquipmentSetup? {
        guard let profile, !(deletedEquipmentSetupIds ?? []).contains(profile.id) else { return nil }
        return equipmentSetups?.first { $0.id == profile.id } ?? profile
    }

    func setups(logs: [WorkoutLog], templates: [WorkoutTemplate], current: EquipmentSetup? = nil) -> [EquipmentSetup] {
        var profiles: [String: EquipmentSetup] = [:]
        let orderedLogs = logs.sorted { lhs, rhs in
            lhs.date == rhs.date ? (lhs.updatedAt ?? "") < (rhs.updatedAt ?? "") : lhs.date < rhs.date
        }
        for log in orderedLogs {
            for item in (log.prescription?.exerciseItems ?? []) + log.exerciseItems where item.exerciseId == id {
                if let profile = item.setupProfile { profiles[profile.id] = profile }
            }
        }
        for template in templates {
            for item in template.exerciseItems where item.exerciseId == id {
                if let profile = item.setupProfile { profiles[profile.id] = profile }
            }
        }
        if let current { profiles[current.id] = current }
        for profile in equipmentSetups ?? [] { profiles[profile.id] = profile }
        return profiles.values.filter { !(deletedEquipmentSetupIds ?? []).contains($0.id) }.sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
    }
}
struct TrainingPhase: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name = ""
    var startDate: String
    var endDate: String
    var setsPerExercise: Int?
    var targetRir: Int?
    var notes: String?
    var allowOptional: Bool?
}
struct WorkoutPrescription: Codable, Equatable {
    var templateId: String
    var templateName: String
    var programId: String?
    var programName: String?
    var phaseName: String?
    var day: String
    var optional: Bool
    var exerciseItems: [ExerciseItem]
    var targetRir: Int?
    static func make(template: WorkoutTemplate, program: TrainingProgram?, day: String) -> WorkoutPrescription {
        let phase = program?.phases?.first { $0.startDate <= day && day <= $0.endDate }
        let items = template.exerciseItems.map { original in
            var item = original
            if let cap = phase?.setsPerExercise { var working = 0; item.sets = item.sets.filter { set in if set.setType == "warmup" { return true }; working += 1; return working <= cap } }
            return item
        }
        return WorkoutPrescription(templateId: template.id, templateName: template.name, programId: program?.id, programName: program?.name, phaseName: phase?.name, day: day, optional: program?.schedule.first { $0.templateId == template.id }?.optional == true, exerciseItems: items, targetRir: phase?.targetRir)
    }
}

struct ExerciseItem: Codable, Identifiable, Equatable {
    var setupProfile: EquipmentSetup?
    var baselineId: String?
    var techniqueNote: String?
    var id: String { exerciseId }
    var exerciseId: String
    var weightType: String?
    var restTargetSeconds: Int?
    var supersetGroup: String?
    var description: String?
    var useIndividualReps: Bool?
    var sets: [WorkoutSet]

    init(exerciseId: String, weightType: String? = "weight", restTargetSeconds: Int? = nil, supersetGroup: String? = nil, description: String? = nil, useIndividualReps: Bool? = nil, sets: [WorkoutSet], baselineId: String? = nil, techniqueNote: String? = nil, setupProfile: EquipmentSetup? = nil) {
        self.setupProfile = setupProfile
        self.baselineId = baselineId
        self.techniqueNote = techniqueNote
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
    var gymId: String?
    var revision: Int?

    init(
        id: String = UUID().uuidString,
        name: String,
        description: String? = "",
        exerciseItems: [ExerciseItem] = [],
        updatedAt: String? = nil,
        revision: Int? = nil,
        gymId: String? = nil
    ) {
        self.gymId = gymId
        self.id = id
        self.name = name
        self.description = description
        self.exerciseItems = exerciseItems
        self.updatedAt = updatedAt
        self.revision = revision
    }

    enum CodingKeys: String, CodingKey {
        case id, name, description, exerciseItems, updatedAt, gymId, revision
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(exerciseItems, forKey: .exerciseItems)
        try container.encodeIfPresent(updatedAt, forKey: .updatedAt)
        try container.encodeIfPresent(revision, forKey: .revision)
        // Explicit null clears the association; omitted fields from older clients preserve it.
        try container.encode(gymId, forKey: .gymId)
    }

}

struct ProgramScheduleItem: Codable, Identifiable, Equatable {
    var id: String
    var templateId: String?
    var notes: String?
    var optional: Bool?

    init(id: String = UUID().uuidString, templateId: String? = nil, notes: String? = nil, optional: Bool? = nil) {
        self.optional = optional
        self.id = id
        self.templateId = templateId?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        self.notes = notes?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case templateId
        case optional
        case notes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? UUID().uuidString
        templateId = try container.decodeIfPresent(String.self, forKey: .templateId)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        optional = try container.decodeIfPresent(Bool.self, forKey: .optional)
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

struct ProgramScheduleEdit: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var date: String
    var type: String
    var templateId: String?
}

struct TrainingProgram: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var description: String?
    var schedule: [ProgramScheduleItem]
    var endDate: String?
    var scheduledActivation: Bool?
    var phases: [TrainingPhase]?
    var startDate: String
    var insertedRestDays: [String]
    var scheduleEdits: [ProgramScheduleEdit]
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
        scheduleEdits: [ProgramScheduleEdit] = [],
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
        self.scheduleEdits = scheduleEdits
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
        case endDate, scheduledActivation, phases
        case startDate
        case insertedRestDays, scheduleEdits
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
        endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
        scheduledActivation = try container.decodeIfPresent(Bool.self, forKey: .scheduledActivation)
        phases = try container.decodeIfPresent([TrainingPhase].self, forKey: .phases)
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate) ?? DateHelpers.todayString()
        insertedRestDays = (try container.decodeIfPresent([String].self, forKey: .insertedRestDays) ?? []).sorted()
        scheduleEdits = try container.decodeIfPresent([ProgramScheduleEdit].self, forKey: .scheduleEdits) ?? []
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
    var prescription: WorkoutPrescription?
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
        prescription: WorkoutPrescription? = nil,
        revision: Int? = nil
    ) {
        self.prescription = prescription
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

private let workoutWeightTypes: Set<String> = ["weight", "double", "bar_double", "smith_double", "none"]

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
    guard isRecordedWorkingSet(loggedSet), personalBestContext(item) == personalBestContext(lastItem) else { return false }
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

enum RepMixBurnImportMode: String, Codable, CaseIterable, Identifiable {
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

struct RepMixBurnExportPayload: Codable, Equatable {
    var exportedAt: String?
    var exercises: [Exercise]?
    var templates: [WorkoutTemplate]?
    var logs: [WorkoutLog]?
    var programs: [TrainingProgram]?
    var gyms: [Gym]?
    var equipment: [GymEquipment]? = nil
    var settings: WorkoutSettings?
}

struct RepMixBurnImportRequest: Encodable {
    var mode: RepMixBurnImportMode
    var data: RepMixBurnExportPayload
}

struct RepMixBurnImportCounts: Codable, Equatable {
    var exercises: Int
    var templates: Int
    var logs: Int
    var programs: Int
    var gyms: Int? = nil
    var equipment: Int? = nil
    var settings: Bool?
}

struct RepMixBurnSkippedExercise: Codable, Equatable {
    var id: String
    var name: String?
}

struct RepMixBurnSkippedLog: Codable, Equatable {
    var id: String
    var name: String?
    var date: String?
}

struct RepMixBurnImportSkipped: Codable, Equatable {
    var exercises: [RepMixBurnSkippedExercise]?
    var templates: [RepMixBurnSkippedExercise]?
    var logs: [RepMixBurnSkippedLog]?
    var programs: [RepMixBurnSkippedExercise]?
    var gyms: [RepMixBurnSkippedExercise]? = nil
}

struct RepMixBurnImportRename: Codable, Equatable {
    var from: String
    var to: String
}

struct RepMixBurnImportRenamed: Codable, Equatable {
    var exercises: [RepMixBurnImportRename]?
    var templates: [RepMixBurnImportRename]?
    var logs: [RepMixBurnImportRename]?
    var programs: [RepMixBurnImportRename]?
    var gyms: [RepMixBurnImportRename]? = nil
}

struct RepMixBurnImportResult: Codable, Equatable {
    var imported: RepMixBurnImportCounts
    var renamed: RepMixBurnImportRenamed?
    var skipped: RepMixBurnImportSkipped?
}

struct RepMixBurnImportPreview: Equatable {
    struct Counts: Equatable {
        var exercises: Int
        var templates: Int
        var logs: Int
        var programs: Int
        var gyms: Int = 0
        var equipment: Int = 0
        var settings: Int
    }

    struct DuplicateIds: Equatable {
        var exercises: Int
        var templates: Int
        var logs: Int
        var programs: Int
        var gyms: Int = 0
        var equipment: Int = 0
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
    var optionalCompleted: Int = 0

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
        let today = DateHelpers.todayString()
        let current = programs.filter { ($0.active == true || $0.scheduledActivation == true) && $0.startDate <= today }.sorted { $0.startDate > $1.startDate }.first
        guard let current, current.endDate == nil || today <= current.endDate! else { return nil }
        return current
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
        if day.scheduleItem?.optional == true && day.status != .done && day.status != .skipped { return "Optional" }
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

    static func removeRestDay(_ program: TrainingProgram, dayKey: String) -> TrainingProgram {
        guard DateHelpers.apiDay.date(from: dayKey) != nil else { return program }
        var updated = program
        updated.insertedRestDays.removeAll { $0 == dayKey }
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
                  !handledOn(logs: logs, template: template, dayKey: currentSlot.dayKey)
            else { continue }

            if scheduleItem.optional == true && program.phases?.first(where: { $0.startDate <= currentSlot.dayKey && currentSlot.dayKey <= $0.endDate })?.allowOptional == false { continue }
            return ProgramNextWorkout(
                date: date,
                dayKey: currentSlot.dayKey,
                template: template,
                scheduleItem: scheduleItem,
                scheduleIndex: currentSlot.scheduleIndex ?? -1,
                position: currentSlot.scheduleIndex.map { $0 + 1 } ?? 0,
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
            if let template = currentSlot.template, currentSlot.scheduleItem?.optional != true {
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
            remainingToday: remainingToday,
            optionalCompleted: logs.filter { $0.status == "finished" && $0.prescription?.programId == program.id && $0.prescription?.optional == true && $0.date >= DateHelpers.dayString(from: start) && $0.date <= DateHelpers.dayString(from: today) }.count
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
        if slot.scheduleItem?.optional == true { return .planned }
        return slot.date < Calendar.current.startOfDay(for: Date()) ? .missed : .planned
    }

    static func shiftedDay(_ day: String, by offset: Int) -> String {
        let date = DateHelpers.date(from: day)
        return DateHelpers.dayString(from: Calendar.current.date(byAdding: .day, value: offset, to: date)!)
    }

    static func canEditUpcoming(_ program: TrainingProgram, date: String, type: String, logs: [WorkoutLog]) -> Bool {
        guard !program.schedule.isEmpty, program.scheduleEdits.count < 500,
              date >= DateHelpers.todayString(), date >= program.startDate,
              program.endDate == nil || date <= program.endDate! else { return false }
        let last = type == "swap" ? shiftedDay(date, by: 1) : program.endDate
        if type == "swap", let end = program.endDate, let last, last > end { return false }
        return !logs.contains { log in
            log.date >= date && (last == nil || log.date <= last!) &&
            ["finished", "skipped", "active", "planning"].contains(log.status ?? "")
        }
    }

    static func editingUpcoming(_ program: TrainingProgram, date: String, type: String, templateId: String? = nil, logs: [WorkoutLog]) -> TrainingProgram? {
        guard ["insert", "delete", "swap"].contains(type), canEditUpcoming(program, date: date, type: type, logs: logs) else { return nil }
        var updated = program
        updated.scheduleEdits.append(ProgramScheduleEdit(date: date, type: type, templateId: type == "insert" ? templateId : nil))
        return updated
    }

    private static func slot(for date: Date, program: TrainingProgram, templatesById: [String: WorkoutTemplate]) -> ProgramSlot {
        let target = Calendar.current.startOfDay(for: date)
        let dayKey = DateHelpers.dayString(from: target)
        guard !program.schedule.isEmpty, dayKey >= program.startDate, program.endDate == nil || dayKey <= program.endDate! else {
            return baseSlot(for: date, program: program, templatesById: templatesById)
        }
        var source = dayKey
        for edit in program.scheduleEdits.reversed() {
            if edit.type == "insert" {
                if source == edit.date {
                    let item = ProgramScheduleItem(id: edit.id, templateId: edit.templateId)
                    return ProgramSlot(date: target, dayKey: dayKey, scheduleIndex: nil, scheduleItem: item, template: edit.templateId.flatMap { templatesById[$0] }, isInsertedRest: edit.templateId == nil, isBeforeStart: false)
                }
                if source > edit.date { source = shiftedDay(source, by: -1) }
            } else if edit.type == "delete", source >= edit.date {
                source = shiftedDay(source, by: 1)
            } else if edit.type == "swap" {
                if source == edit.date { source = shiftedDay(source, by: 1) }
                else if source == shiftedDay(edit.date, by: 1) { source = edit.date }
            }
        }
        var base = program
        base.endDate = nil
        let original = baseSlot(for: DateHelpers.date(from: source), program: base, templatesById: templatesById)
        return ProgramSlot(date: target, dayKey: dayKey, scheduleIndex: original.scheduleIndex, scheduleItem: original.scheduleItem, template: original.template, isInsertedRest: original.isInsertedRest, isBeforeStart: original.isBeforeStart)
    }

    private static func baseSlot(for date: Date, program: TrainingProgram, templatesById: [String: WorkoutTemplate]) -> ProgramSlot {
        let targetDate = Calendar.current.startOfDay(for: date)
        let dayKey = DateHelpers.dayString(from: targetDate)
        let startDate = DateHelpers.date(from: program.startDate)

        guard !program.schedule.isEmpty else {
            return ProgramSlot(date: targetDate, dayKey: dayKey, scheduleIndex: nil, scheduleItem: nil, template: nil, isInsertedRest: false, isBeforeStart: false)
        }

        if targetDate < Calendar.current.startOfDay(for: startDate) || (program.endDate != nil && dayKey > program.endDate!) {
            return ProgramSlot(date: targetDate, dayKey: dayKey, scheduleIndex: nil, scheduleItem: nil, template: nil, isInsertedRest: false, isBeforeStart: targetDate < Calendar.current.startOfDay(for: startDate))
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
                && (log.prescription.map { $0.templateId == template.id } ?? (log.name.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(templateName) == .orderedSame))
        }
    }

    private static func skippedOn(logs: [WorkoutLog], template: WorkoutTemplate, dayKey: String) -> Bool {
        let templateName = template.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return logs.contains { log in
            log.date == dayKey
                && log.status == "skipped"
                && (log.prescription.map { $0.templateId == template.id } ?? (log.name.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(templateName) == .orderedSame))
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

func validSmithBarWeight(_ value: Double?) -> Double? {
    guard let value, value.isFinite, value >= 0, value <= 500 else { return nil }
    return value
}

func effectiveRecordedWeight(_ weight: String?, weightType: String?, smithBarWeight: Double? = nil) -> Double? {
    let raw = (weight ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty, let value = Double(raw), value.isFinite, value >= 0, weightType != "none" else { return 0 }
    if weightType == "smith_double" {
        guard let resistance = validSmithBarWeight(smithBarWeight) else { return nil }
        return value * 2 + resistance
    }
    if weightType == "bar_double" { return value * 2 + 45 }
    if weightType == "double" { return value * 2 }
    return value
}

func smithLoadContext(_ item: ExerciseItem?) -> String {
    guard item?.weightType == "smith_double" else { return "other" }
    return "smith:" + (validSmithBarWeight(item?.setupProfile?.smithBarWeight).map { String($0) } ?? "unknown")
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

func bestPersonalBestCandidate(from sets: [WorkoutSet], weightType: String? = "weight", smithBarWeight: Double? = nil) -> PersonalBestCandidate? {
    sets.reduce(PersonalBestCandidate?.none) { current, set in
        guard isRecordedWorkingSet(set) else { return current }
        let weight = effectiveRecordedWeight(set.weight, weightType: weightType, smithBarWeight: smithBarWeight) ?? 0
        guard weight > 0 else { return current }
        let reps = [set.reps, set.repsLeft, set.repsRight].map(personalBestNumber).max() ?? 0
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

func hasPersonalBestContext(_ item: ExerciseItem) -> Bool {
    !(item.baselineId ?? "").isEmpty || !(item.setupProfile?.id ?? "").isEmpty || item.weightType == "smith_double"
}

// Array keys avoid collisions between user-owned IDs and context separators.
func personalBestContext(_ item: ExerciseItem) -> [String] {
    [item.exerciseId, item.baselineId ?? "", item.setupProfile?.id ?? "", item.weightType ?? "weight", smithLoadContext(item)]
}

private func personalBestLogPrecedes(_ a: WorkoutLog, _ b: WorkoutLog) -> Bool {
    let aKey = a.startTime ?? a.endTime ?? "\(a.date)T00:00:00"
    let bKey = b.startTime ?? b.endTime ?? "\(b.date)T00:00:00"
    return aKey == bKey ? a.id < b.id : aKey < bKey
}

private func recordedPersonalBest(_ item: ExerciseItem, logs: [WorkoutLog]) -> PersonalBest? {
    let context = personalBestContext(item)
    var best: PersonalBest?
    for log in logs.filter({ $0.status == "finished" }).sorted(by: personalBestLogPrecedes) {
        for previous in log.exerciseItems where personalBestContext(previous) == context {
            let candidate = bestPersonalBestCandidate(from: previous.sets, weightType: previous.weightType, smithBarWeight: previous.setupProfile?.smithBarWeight)
            if isPersonalBestImprovement(candidate, over: best), let candidate {
                best = personalBestPayload(candidate, date: log.date)
            }
        }
    }
    return best
}

func personalBestForItem(_ item: ExerciseItem, logs: [WorkoutLog], legacyBest: PersonalBest?) -> PersonalBest? {
    hasPersonalBestContext(item) ? recordedPersonalBest(item, logs: logs) : legacyBest
}

func latestPersonalBest(_ exercise: Exercise, logs: [WorkoutLog]) -> (best: PersonalBest?, contextual: Bool) {
    let item = logs.filter { $0.status == "finished" }.sorted(by: personalBestLogPrecedes).reversed()
        .flatMap { $0.exerciseItems }.first { $0.exerciseId == exercise.id }
    guard let item else { return (exercise.personalBest, false) }
    return (personalBestForItem(item, logs: logs, legacyBest: exercise.personalBest), hasPersonalBestContext(item))
}

// Reconstruct contextual badges before filtering by date. Saved sets and setup
// snapshots remain unchanged, and corrections/deletions update the result.
func logsWithPersonalBests(_ logs: [WorkoutLog]) -> [WorkoutLog] {
    var bests: [[String]: PersonalBest] = [:]
    var badges: [String: [String]] = [:]
    for log in logs.filter({ $0.status == "finished" }).sorted(by: personalBestLogPrecedes) {
        var ids = (log.pbExerciseIds ?? []).filter { id in
            log.exerciseItems.contains { $0.exerciseId == id && !hasPersonalBestContext($0) }
        }
        for item in log.exerciseItems where hasPersonalBestContext(item) {
            let key = personalBestContext(item)
            let candidate = bestPersonalBestCandidate(from: item.sets, weightType: item.weightType, smithBarWeight: item.setupProfile?.smithBarWeight)
            if isPersonalBestImprovement(candidate, over: bests[key]), let candidate {
                if !ids.contains(item.exerciseId) { ids.append(item.exerciseId) }
                bests[key] = personalBestPayload(candidate, date: log.date)
            }
        }
        badges[log.id] = ids
    }
    return logs.map { log in
        guard let ids = badges[log.id] else { return log }
        var result = log
        result.pbExerciseIds = ids
        result.hasPB = !ids.isEmpty
        return result
    }
}

func personalBestIdsForWorkout(_ log: WorkoutLog, logs: [WorkoutLog], exercises: [Exercise]) -> [String] {
    let prior = logs.filter { $0.id != log.id && personalBestLogPrecedes($0, log) }
    let editing = logs.contains { $0.id == log.id && $0.status == "finished" }
    var ids: [String] = []
    for item in log.exerciseItems {
        let candidate = bestPersonalBestCandidate(from: item.sets, weightType: item.weightType, smithBarWeight: item.setupProfile?.smithBarWeight)
        var best = recordedPersonalBest(item, logs: prior)
        if !hasPersonalBestContext(item) {
            let legacy = exercises.first(where: { $0.id == item.exerciseId })?.personalBest
            if !editing {
                best = legacy // Preserve explicit Reset PB for general records.
            } else if let legacy, let date = legacy.date, date < log.date {
                let legacyCandidate = PersonalBestCandidate(weight: legacy.weight, reps: legacy.reps, weightValue: personalBestNumber(legacy.weight), repsValue: personalBestNumber(legacy.reps))
                if isPersonalBestImprovement(legacyCandidate, over: best) { best = legacy }
            }
        }
        if isPersonalBestImprovement(candidate, over: best), !ids.contains(item.exerciseId) { ids.append(item.exerciseId) }
    }
    return ids
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
    weightType == "double" || weightType == "bar_double" || weightType == "smith_double"
}

func calculatedWeightTotal(weight: String?, weightType: String?, smithBarWeight: Double? = nil) -> Double? {
    if weightType == "smith_double" {
        guard let raw = weight, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return effectiveRecordedWeight(raw, weightType: weightType, smithBarWeight: smithBarWeight)
    }
    guard let value = Double((weight ?? "").trimmingCharacters(in: .whitespacesAndNewlines)),
          value.isFinite, value >= 0, value > 0 || weightType == "bar_double" else { return nil }
    switch weightType {
    case "double":
        return value * 2
    case "bar_double":
        return (value * 2) + 45
    default:
        return nil
    }
}

func calculatedWeightCaption(weight: String?, weightType: String?, smithBarWeight: Double? = nil) -> String? {
    if weightType == "smith_double", validSmithBarWeight(smithBarWeight) == nil,
       let value = Double((weight ?? "").trimmingCharacters(in: .whitespacesAndNewlines)), value.isFinite, value >= 0 {
        return "\(formatProgressionNumber(value * 2)) lb plates + unknown bar"
    }
    guard let total = calculatedWeightTotal(weight: weight, weightType: weightType, smithBarWeight: smithBarWeight) else { return nil }
    return "Total \(formatProgressionNumber(total)) lbs"
}

func contextualWeightPlaceholder(weight: String?, sourceWeightType: String?, targetWeightType: String?) -> String? {
    let raw = (weight ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return nil }
    guard let value = Double(raw) else { return raw }

    let sourceType = sourceWeightType ?? targetWeightType ?? "weight"
    let targetType = targetWeightType ?? "weight"
    if sourceType == "smith_double" || targetType == "smith_double" { return sourceType == targetType ? raw : nil }
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


func hasRecordedWorkoutReps(_ set: WorkoutSet) -> Bool {
    guard set.completion != "skipped", set.completion != "unrecorded" else { return false }
    return [set.reps, set.repsLeft, set.repsRight].contains { raw in
        guard let n = Double(raw ?? "") else { return false }
        return n.isFinite && n > 0
    }
}
func isRecordedWorkingSet(_ set: WorkoutSet) -> Bool {
    hasRecordedWorkoutReps(set) && set.setType != "warmup"
}

struct GymEquipment: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name = ""
    var category = "Other"
    var details = ""

    static let categories = ["Free weights", "Machines", "Cables", "Benches & racks", "Cardio", "Accessories", "Other"]
    var equipmentId: String?
    var revision: Int?
    var updatedAt: String?
    var libraryID: String { equipmentId ?? id }
    static let preloaded: [GymEquipment] = {
        let data = #"""
        [
          {"id": "eq-dumbbells", "name": "Dumbbells", "category": "Free weights", "details": ""},
          {"id": "eq-adjustable-dumbbells", "name": "Adjustable dumbbells", "category": "Free weights", "details": ""},
          {"id": "eq-barbell-plates", "name": "Barbell & plates", "category": "Free weights", "details": ""},
          {"id": "eq-ez-curl-bar", "name": "EZ curl bar", "category": "Free weights", "details": ""},
          {"id": "eq-trap-bar", "name": "Trap bar", "category": "Free weights", "details": ""},
          {"id": "eq-safety-squat-bar", "name": "Safety squat bar", "category": "Free weights", "details": ""},
          {"id": "eq-swiss-bar", "name": "Swiss bar", "category": "Free weights", "details": ""},
          {"id": "eq-fixed-barbells", "name": "Fixed barbells", "category": "Free weights", "details": ""},
          {"id": "eq-kettlebells", "name": "Kettlebells", "category": "Free weights", "details": ""},
          {"id": "eq-weight-plates", "name": "Weight plates", "category": "Free weights", "details": ""},
          {"id": "eq-bumper-plates", "name": "Bumper plates", "category": "Free weights", "details": ""},
          {"id": "eq-flat-bench", "name": "Flat bench", "category": "Benches & racks", "details": ""},
          {"id": "eq-adjustable-bench", "name": "Adjustable bench", "category": "Benches & racks", "details": ""},
          {"id": "eq-decline-bench", "name": "Decline bench", "category": "Benches & racks", "details": ""},
          {"id": "eq-preacher-curl-bench", "name": "Preacher curl bench", "category": "Benches & racks", "details": ""},
          {"id": "eq-squat-rack", "name": "Squat rack", "category": "Benches & racks", "details": ""},
          {"id": "eq-power-rack", "name": "Power rack", "category": "Benches & racks", "details": ""},
          {"id": "eq-half-rack", "name": "Half rack", "category": "Benches & racks", "details": ""},
          {"id": "eq-smith-machine", "name": "Smith machine", "category": "Benches & racks", "details": ""},
          {"id": "eq-barbell-bench-press-station", "name": "Barbell bench press station", "category": "Benches & racks", "details": ""},
          {"id": "eq-incline-bench-press-station", "name": "Incline bench press station", "category": "Benches & racks", "details": ""},
          {"id": "eq-landmine-attachment", "name": "Landmine attachment", "category": "Benches & racks", "details": ""},
          {"id": "eq-dip-station", "name": "Dip station", "category": "Benches & racks", "details": ""},
          {"id": "eq-pull-up-bar", "name": "Pull-up bar", "category": "Benches & racks", "details": ""},
          {"id": "eq-assisted-pull-up-dip-machine", "name": "Assisted pull-up & dip machine", "category": "Benches & racks", "details": ""},
          {"id": "eq-roman-chair", "name": "Roman chair", "category": "Benches & racks", "details": ""},
          {"id": "eq-glute-ham-developer", "name": "Glute-ham developer", "category": "Benches & racks", "details": ""},
          {"id": "eq-chest-press-machine", "name": "Chest press machine", "category": "Machines", "details": ""},
          {"id": "eq-incline-chest-press-machine", "name": "Incline chest press machine", "category": "Machines", "details": ""},
          {"id": "eq-chest-fly-pec-deck", "name": "Chest fly / pec deck", "category": "Machines", "details": ""},
          {"id": "eq-shoulder-press-machine", "name": "Shoulder press machine", "category": "Machines", "details": ""},
          {"id": "eq-lateral-raise-machine", "name": "Lateral raise machine", "category": "Machines", "details": ""},
          {"id": "eq-rear-delt-fly-machine", "name": "Rear delt fly machine", "category": "Machines", "details": ""},
          {"id": "eq-lat-pulldown", "name": "Lat pulldown", "category": "Machines", "details": ""},
          {"id": "eq-seated-row-machine", "name": "Seated row machine", "category": "Machines", "details": ""},
          {"id": "eq-chest-supported-row-machine", "name": "Chest-supported row machine", "category": "Machines", "details": ""},
          {"id": "eq-t-bar-row-machine", "name": "T-bar row machine", "category": "Machines", "details": ""},
          {"id": "eq-pullover-machine", "name": "Pullover machine", "category": "Machines", "details": ""},
          {"id": "eq-biceps-curl-machine", "name": "Biceps curl machine", "category": "Machines", "details": ""},
          {"id": "eq-triceps-extension-machine", "name": "Triceps extension machine", "category": "Machines", "details": ""},
          {"id": "eq-leg-press", "name": "Leg press", "category": "Machines", "details": ""},
          {"id": "eq-hack-squat-machine", "name": "Hack squat machine", "category": "Machines", "details": ""},
          {"id": "eq-pendulum-squat-machine", "name": "Pendulum squat machine", "category": "Machines", "details": ""},
          {"id": "eq-belt-squat-machine", "name": "Belt squat machine", "category": "Machines", "details": ""},
          {"id": "eq-leg-extension", "name": "Leg extension", "category": "Machines", "details": ""},
          {"id": "eq-seated-leg-curl", "name": "Seated leg curl", "category": "Machines", "details": ""},
          {"id": "eq-lying-leg-curl", "name": "Lying leg curl", "category": "Machines", "details": ""},
          {"id": "eq-standing-leg-curl", "name": "Standing leg curl", "category": "Machines", "details": ""},
          {"id": "eq-hip-thrust-machine", "name": "Hip thrust machine", "category": "Machines", "details": ""},
          {"id": "eq-glute-kickback-machine", "name": "Glute kickback machine", "category": "Machines", "details": ""},
          {"id": "eq-hip-abductor-machine", "name": "Hip abductor machine", "category": "Machines", "details": ""},
          {"id": "eq-hip-adductor-machine", "name": "Hip adductor machine", "category": "Machines", "details": ""},
          {"id": "eq-standing-calf-raise-machine", "name": "Standing calf raise machine", "category": "Machines", "details": ""},
          {"id": "eq-seated-calf-raise-machine", "name": "Seated calf raise machine", "category": "Machines", "details": ""},
          {"id": "eq-back-extension-machine", "name": "Back extension machine", "category": "Machines", "details": ""},
          {"id": "eq-ab-crunch-machine", "name": "Ab crunch machine", "category": "Machines", "details": ""},
          {"id": "eq-torso-rotation-machine", "name": "Torso rotation machine", "category": "Machines", "details": ""},
          {"id": "eq-neck-machine", "name": "Neck machine", "category": "Machines", "details": ""},
          {"id": "eq-cable-station", "name": "Cable station", "category": "Cables", "details": ""},
          {"id": "eq-dual-adjustable-pulley", "name": "Dual adjustable pulley", "category": "Cables", "details": ""},
          {"id": "eq-cable-crossover-station", "name": "Cable crossover station", "category": "Cables", "details": ""},
          {"id": "eq-seated-cable-row", "name": "Seated cable row", "category": "Cables", "details": ""},
          {"id": "eq-triceps-rope", "name": "Triceps rope", "category": "Cables", "details": ""},
          {"id": "eq-straight-cable-bar", "name": "Straight cable bar", "category": "Cables", "details": ""},
          {"id": "eq-ez-cable-bar", "name": "EZ cable bar", "category": "Cables", "details": ""},
          {"id": "eq-single-cable-handle", "name": "Single cable handle", "category": "Cables", "details": ""},
          {"id": "eq-lat-pulldown-bar", "name": "Lat pulldown bar", "category": "Cables", "details": ""},
          {"id": "eq-close-grip-row-handle", "name": "Close-grip row handle", "category": "Cables", "details": ""},
          {"id": "eq-ankle-strap", "name": "Ankle strap", "category": "Cables", "details": ""},
          {"id": "eq-treadmill", "name": "Treadmill", "category": "Cardio", "details": ""},
          {"id": "eq-stationary-bike", "name": "Stationary bike", "category": "Cardio", "details": ""},
          {"id": "eq-recumbent-bike", "name": "Recumbent bike", "category": "Cardio", "details": ""},
          {"id": "eq-air-bike", "name": "Air bike", "category": "Cardio", "details": ""},
          {"id": "eq-spin-bike", "name": "Spin bike", "category": "Cardio", "details": ""},
          {"id": "eq-rowing-machine", "name": "Rowing machine", "category": "Cardio", "details": ""},
          {"id": "eq-ski-erg", "name": "Ski erg", "category": "Cardio", "details": ""},
          {"id": "eq-elliptical", "name": "Elliptical", "category": "Cardio", "details": ""},
          {"id": "eq-stair-climber", "name": "Stair climber", "category": "Cardio", "details": ""},
          {"id": "eq-step-mill", "name": "Step mill", "category": "Cardio", "details": ""},
          {"id": "eq-curve-treadmill", "name": "Curve treadmill", "category": "Cardio", "details": ""},
          {"id": "eq-versaclimber", "name": "VersaClimber", "category": "Cardio", "details": ""},
          {"id": "eq-arm-ergometer", "name": "Arm ergometer", "category": "Cardio", "details": ""},
          {"id": "eq-resistance-bands", "name": "Resistance bands", "category": "Accessories", "details": ""},
          {"id": "eq-mini-loop-bands", "name": "Mini loop bands", "category": "Accessories", "details": ""},
          {"id": "eq-suspension-trainer", "name": "Suspension trainer", "category": "Accessories", "details": ""},
          {"id": "eq-gymnastic-rings", "name": "Gymnastic rings", "category": "Accessories", "details": ""},
          {"id": "eq-ab-wheel", "name": "Ab wheel", "category": "Accessories", "details": ""},
          {"id": "eq-exercise-mat", "name": "Exercise mat", "category": "Accessories", "details": ""},
          {"id": "eq-stability-ball", "name": "Stability ball", "category": "Accessories", "details": ""},
          {"id": "eq-bosu-ball", "name": "BOSU ball", "category": "Accessories", "details": ""},
          {"id": "eq-medicine-ball", "name": "Medicine ball", "category": "Accessories", "details": ""},
          {"id": "eq-slam-ball", "name": "Slam ball", "category": "Accessories", "details": ""},
          {"id": "eq-wall-ball", "name": "Wall ball", "category": "Accessories", "details": ""},
          {"id": "eq-sandbag", "name": "Sandbag", "category": "Accessories", "details": ""},
          {"id": "eq-weight-vest", "name": "Weight vest", "category": "Accessories", "details": ""},
          {"id": "eq-dip-belt", "name": "Dip belt", "category": "Accessories", "details": ""},
          {"id": "eq-lifting-chains", "name": "Lifting chains", "category": "Accessories", "details": ""},
          {"id": "eq-plyometric-box", "name": "Plyometric box", "category": "Accessories", "details": ""},
          {"id": "eq-aerobic-step", "name": "Aerobic step", "category": "Accessories", "details": ""},
          {"id": "eq-jump-rope", "name": "Jump rope", "category": "Accessories", "details": ""},
          {"id": "eq-battle-ropes", "name": "Battle ropes", "category": "Accessories", "details": ""},
          {"id": "eq-push-up-handles", "name": "Push-up handles", "category": "Accessories", "details": ""},
          {"id": "eq-parallettes", "name": "Parallettes", "category": "Accessories", "details": ""},
          {"id": "eq-sliders", "name": "Sliders", "category": "Accessories", "details": ""},
          {"id": "eq-balance-board", "name": "Balance board", "category": "Accessories", "details": ""},
          {"id": "eq-foam-roller", "name": "Foam roller", "category": "Accessories", "details": ""},
          {"id": "eq-sled", "name": "Sled", "category": "Accessories", "details": ""},
          {"id": "eq-sled-harness", "name": "Sled harness", "category": "Accessories", "details": ""},
          {"id": "eq-agility-ladder", "name": "Agility ladder", "category": "Accessories", "details": ""},
          {"id": "eq-farmer-carry-handles", "name": "Farmer carry handles", "category": "Accessories", "details": ""},
          {"id": "eq-wrist-roller", "name": "Wrist roller", "category": "Accessories", "details": ""},
          {"id": "eq-grip-trainer", "name": "Grip trainer", "category": "Accessories", "details": ""}
        ]
        """#.data(using: .utf8)!
        return (try? JSONDecoder().decode([GymEquipment].self, from: data)) ?? []
    }()

}

struct Gym: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name = ""
    var notes = ""
    var equipment: [GymEquipment] = []
    var updatedAt: String?
    var revision: Int?

    var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.utf16.count <= 120
        && notes.utf16.count <= 2000 && equipment.count <= 200
        && equipment.allSatisfy {
            !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && $0.name.utf16.count <= 120 && $0.details.utf16.count <= 500
        }
    }

    func aiBrief(routine: WorkoutTemplate? = nil, exercises: [Exercise] = []) -> String {
        var lines = [
            "Help me build a workout using this gym inventory.",
            "Use only the listed equipment and bodyweight. Do not assume unlisted machines, attachments, or weight ranges are available. Ask about anything missing.",
            "Equipment alternatives identify the main implement or station. Check that any supporting bench, rack, plates, or attachments needed for the movement are also available.",
            "Ask me about my goals, experience, weekly schedule, session length, and limitations before suggesting a plan.",
            "", "Gym: \(name)"
        ]
        if !notes.isEmpty { lines.append("Gym notes: \(notes)") }
        lines += ["", "Equipment:"]
        if equipment.isEmpty { lines.append("No equipment recorded yet. Ask me to complete the inventory before planning.") }
        for category in GymEquipment.categories {
            let items = equipment.filter { $0.category == category }
            if items.isEmpty { continue }
            lines.append(category + ":")
            for item in items {
                lines.append("- \(item.name)" + (item.details.isEmpty ? "" : " — \(item.details)"))
            }
        }
        if let routine {
            lines += ["", "Routine to adapt: \(routine.name)"]
            if let description = routine.description, !description.isEmpty { lines.append(description) }
            for item in routine.exerciseItems {
                let name = exercises.first { $0.id == item.exerciseId }?.name ?? item.exerciseId
                let data = try? JSONEncoder().encode(item)
                let details = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                lines.append("- \(name): \(details)")
                let summary = exercises.first { $0.id == item.exerciseId }?.equipmentSummary(at: self) ?? "No equipment requirement recorded"
                lines.append("  Equipment: \(summary)")
            }
            lines.append("Equipment entries are alternatives: any one listed option can be used. If no requirement is recorded, ask rather than assuming the exercise needs no equipment.")
            lines.append("Suggest changes before replacing any exercise. Preserve the intent of the routine.")
        }
        return lines.joined(separator: "\n")
    }
}

struct EquipmentAlternative: Codable, Equatable, Identifiable {
    var gymId: String? = nil
    var equipmentId: String
    var id: String { "\(gymId ?? "library")/\(equipmentId)" }
}

extension Exercise {
    func equipmentSummary(at gym: Gym) -> String {
        let refs = equipmentAlternatives ?? []
        guard !refs.isEmpty else { return "No equipment requirement recorded" }
        let available = gym.equipment.filter { item in refs.contains { ($0.gymId == nil && $0.equipmentId == item.libraryID) || ($0.gymId == gym.id && $0.equipmentId == item.id) } }
        return available.isEmpty ? "No recorded alternative at this gym" : available.map(\.name).joined(separator: " OR ")
    }
}
