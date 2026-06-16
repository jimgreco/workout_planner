import ActivityKit
import AppIntents
import Foundation

struct WorkoutLiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var workoutName: String
        var exerciseName: String
        var muscleGroup: String
        var setLabel: String
        var reps: String
        var repsGoal: String?
        var weight: String
        var weightCaption: String?
        var weightLast: String?
        var loadLabel: String
        var allowsWeightEntry: Bool
        var weightBaseline: Double?
        var interactionRevision: Int
        var setType: String
        var personalBest: String?
        var needsWeightIncrease: Bool
        var completedSets: Int
        var totalSets: Int
        var exerciseCount: Int
        var startedAt: Date?
        var restStartedAt: Date?
        var restTargetEnd: Date?
        var restTargetSeconds: Int?
        var restExerciseName: String?
        var isComplete: Bool

        var progress: Double {
            guard totalSets > 0 else { return 0 }
            return min(1, max(0, Double(completedSets) / Double(totalSets)))
        }

        var isResting: Bool {
            restStartedAt != nil
        }
    }

    var workoutID: String
}

struct WorkoutLiveActivitySharedSet: Codable, Hashable {
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
    var setType: String?
}

struct WorkoutLiveActivitySharedItem: Codable, Hashable {
    var exerciseId: String
    var exerciseName: String
    var muscleGroup: String
    var weightType: String?
    var restTargetSeconds: Int?
    var sets: [WorkoutLiveActivitySharedSet]
}

struct WorkoutLiveActivitySharedState: Codable, Hashable {
    var workoutID: String
    var workoutName: String
    var items: [WorkoutLiveActivitySharedItem]
    var activeExerciseIndex: Int
    var activeSetIndex: Int
    var startedAt: Date?
    var revision: Int
    var contentState: WorkoutLiveActivityAttributes.ContentState

    mutating func adjustReps(delta: Int) {
        guard let position = activePosition else { return }
        var set = items[position.exerciseIndex].sets[position.setIndex]
        if set.usesSideReps {
            let left = max(0, (Self.repValue(set.repsLeft) ?? Self.repSeed(from: set.placeholderRepsLeft ?? set.placeholderReps) ?? 0) + delta)
            let right = max(0, (Self.repValue(set.repsRight) ?? Self.repSeed(from: set.placeholderRepsRight ?? set.placeholderReps) ?? 0) + delta)
            set.repsLeft = "\(left)"
            set.repsRight = "\(right)"
        } else {
            let next = max(0, (Self.repValue(set.reps) ?? Self.repSeed(from: set.placeholderReps) ?? 0) + delta)
            set.reps = "\(next)"
        }
        items[position.exerciseIndex].sets[position.setIndex] = set
        revision += 1
        refreshContentState()
    }

    mutating func adjustWeight(delta: Double?, resetToBaseline: Bool) {
        guard let position = activePosition,
              items[position.exerciseIndex].weightType != "none"
        else { return }

        var set = items[position.exerciseIndex].sets[position.setIndex]
        let baseline = contentState.weightBaseline ?? Self.weightBaseline(for: set, item: items[position.exerciseIndex])
        let current = Self.number(set.weight) ?? baseline ?? 0
        let next = resetToBaseline ? (baseline ?? current) : max(0, current + (delta ?? 0))
        set.weight = Self.formatNumber(next)
        items[position.exerciseIndex].sets[position.setIndex] = set
        revision += 1
        refreshContentState()
    }

    mutating func logCurrentSet() {
        guard let position = activePosition else { return }
        var set = items[position.exerciseIndex].sets[position.setIndex]
        if set.usesSideReps {
            if Self.cleaned(set.repsLeft) == nil {
                set.repsLeft = "\(Self.repSeed(from: set.placeholderRepsLeft ?? set.placeholderReps) ?? 0)"
            }
            if Self.cleaned(set.repsRight) == nil {
                set.repsRight = "\(Self.repSeed(from: set.placeholderRepsRight ?? set.placeholderReps) ?? 0)"
            }
        } else if Self.cleaned(set.reps) == nil {
            set.reps = "\(Self.repSeed(from: set.placeholderReps) ?? 0)"
        }

        if items[position.exerciseIndex].weightType != "none", Self.cleaned(set.weight) == nil {
            set.weight = Self.weightBaseline(for: set, item: items[position.exerciseIndex]).map(Self.formatNumber)
        }

        set.restStartTime = Date().timeIntervalSince1970 * 1000
        set.restDuration = nil
        items[position.exerciseIndex].sets[position.setIndex] = set

        if let next = nextOpenPosition(after: position) {
            activeExerciseIndex = next.exerciseIndex
            activeSetIndex = next.setIndex
        }

        revision += 1
        refreshContentState()
    }

    mutating func refreshContentState() {
        guard let position = activePosition else { return }
        let item = items[position.exerciseIndex]
        let set = item.sets[position.setIndex]
        let rest = restingPosition
        let restSet = rest.map { items[$0.exerciseIndex].sets[$0.setIndex] }
        let restItem = rest.map { items[$0.exerciseIndex] }
        let restStartedAt = restSet?.restStartTime.map { Date(timeIntervalSince1970: $0 / 1000) }
        let restTargetSeconds = restSet?.restTargetSeconds ?? restItem?.restTargetSeconds

        contentState.exerciseName = item.exerciseName
        contentState.muscleGroup = item.muscleGroup
        contentState.setLabel = "\(position.setIndex + 1)/\(item.sets.count)"
        contentState.reps = Self.repsLabel(for: set)
        contentState.repsGoal = Self.repsGoalLabel(for: set)
        contentState.weight = Self.weightLabel(for: set, item: item)
        contentState.weightCaption = Self.weightCaption(for: set, item: item)
        contentState.weightLast = Self.weightLastLabel(for: set, item: item)
        contentState.loadLabel = Self.loadLabel(item.weightType)
        contentState.allowsWeightEntry = item.weightType != "none"
        contentState.weightBaseline = Self.weightBaseline(for: set, item: item)
        contentState.interactionRevision = revision
        contentState.completedSets = completedSetCount
        contentState.totalSets = totalSetCount
        contentState.exerciseCount = items.count
        contentState.restStartedAt = restStartedAt
        contentState.restTargetEnd = restStartedAt.flatMap { start in
            restTargetSeconds.map { start.addingTimeInterval(TimeInterval($0)) }
        }
        contentState.restTargetSeconds = restTargetSeconds
        contentState.restExerciseName = restItem?.exerciseName
        contentState.isComplete = totalSetCount > 0 && completedSetCount >= totalSetCount
    }

    private var activePosition: (exerciseIndex: Int, setIndex: Int)? {
        guard items.indices.contains(activeExerciseIndex),
              items[activeExerciseIndex].sets.indices.contains(activeSetIndex)
        else { return firstOpenPosition ?? firstPosition }
        return (activeExerciseIndex, activeSetIndex)
    }

    private var firstPosition: (exerciseIndex: Int, setIndex: Int)? {
        guard let exerciseIndex = items.indices.first,
              let setIndex = items[exerciseIndex].sets.indices.first
        else { return nil }
        return (exerciseIndex, setIndex)
    }

    private var firstOpenPosition: (exerciseIndex: Int, setIndex: Int)? {
        for exerciseIndex in items.indices {
            for setIndex in items[exerciseIndex].sets.indices {
                let set = items[exerciseIndex].sets[setIndex]
                if set.restStartTime == nil, set.restDuration == nil {
                    return (exerciseIndex, setIndex)
                }
            }
        }
        return nil
    }

    private var restingPosition: (exerciseIndex: Int, setIndex: Int)? {
        for exerciseIndex in items.indices {
            for setIndex in items[exerciseIndex].sets.indices {
                let set = items[exerciseIndex].sets[setIndex]
                if set.restStartTime != nil, set.restDuration == nil {
                    return (exerciseIndex, setIndex)
                }
            }
        }
        return nil
    }

    private func nextOpenPosition(after position: (exerciseIndex: Int, setIndex: Int)) -> (exerciseIndex: Int, setIndex: Int)? {
        var foundCurrent = false
        for exerciseIndex in items.indices {
            for setIndex in items[exerciseIndex].sets.indices {
                if foundCurrent {
                    let set = items[exerciseIndex].sets[setIndex]
                    if set.restStartTime == nil, set.restDuration == nil {
                        return (exerciseIndex, setIndex)
                    }
                }
                if exerciseIndex == position.exerciseIndex, setIndex == position.setIndex {
                    foundCurrent = true
                }
            }
        }
        return nil
    }

    private var completedSetCount: Int {
        items.reduce(0) { total, item in
            total + item.sets.filter { $0.restStartTime != nil || $0.restDuration != nil }.count
        }
    }

    private var totalSetCount: Int {
        items.reduce(0) { $0 + $1.sets.count }
    }

    private static func repsLabel(for set: WorkoutLiveActivitySharedSet) -> String {
        if set.usesSideReps {
            let left = repText(value: set.repsLeft, placeholder: set.placeholderRepsLeft ?? set.placeholderReps)
            let right = repText(value: set.repsRight, placeholder: set.placeholderRepsRight ?? set.placeholderReps)
            let leftText = left ?? right ?? "-"
            let rightText = right ?? left ?? "-"
            return leftText == rightText ? leftText : "\(leftText)/\(rightText)"
        }
        return repText(value: set.reps, placeholder: set.placeholderReps) ?? "-"
    }

    private static func repsGoalLabel(for set: WorkoutLiveActivitySharedSet) -> String? {
        if let left = repGoal(from: set.placeholderRepsLeft),
           let right = repGoal(from: set.placeholderRepsRight) {
            return left == right ? left : "\(left)/\(right)"
        }
        guard let goal = repGoal(from: set.placeholderReps) else { return nil }
        return "Goal \(goal)"
    }

    private static func weightLabel(for set: WorkoutLiveActivitySharedSet, item: WorkoutLiveActivitySharedItem) -> String {
        guard item.weightType != "none",
              let weight = cleaned(set.weight) ?? weightBaseline(for: set, item: item).map(formatNumber)
        else { return "" }
        if item.weightType == "bar_double" { return "\(weight) + bar" }
        return item.weightType == "double" ? "\(weight) each" : "\(weight) lb"
    }

    private static func weightCaption(for set: WorkoutLiveActivitySharedSet, item: WorkoutLiveActivitySharedItem) -> String? {
        guard item.weightType != "none",
              let baseline = cleaned(set.weight).flatMap(number) ?? weightBaseline(for: set, item: item)
        else { return nil }
        let total: Double?
        switch item.weightType {
        case "double": total = baseline * 2
        case "bar_double": total = baseline * 2 + 45
        default: total = nil
        }
        return total.map { "Total \(formatNumber($0)) lbs" }
    }

    private static func weightLastLabel(for set: WorkoutLiveActivitySharedSet, item: WorkoutLiveActivitySharedItem) -> String? {
        guard item.weightType != "none",
              let baseline = weightBaseline(for: set, item: item)
        else { return nil }
        return formatNumber(baseline)
    }

    private static func weightBaseline(for set: WorkoutLiveActivitySharedSet, item: WorkoutLiveActivitySharedItem) -> Double? {
        guard let raw = cleaned(set.placeholderWeight),
              let value = number(raw)
        else { return nil }

        let sourceType = set.placeholderWeightType ?? item.weightType ?? "weight"
        let targetType = item.weightType ?? "weight"
        let total: Double
        switch sourceType {
        case "double": total = value * 2
        case "bar_double": total = value * 2 + 45
        default: total = value
        }
        switch targetType {
        case "double": return total / 2
        case "bar_double": return max(0, (total - 45) / 2)
        default: return total
        }
    }

    private static func loadLabel(_ weightType: String?) -> String {
        switch weightType ?? "weight" {
        case "double": return "2x"
        case "bar_double": return "Bar"
        case "none": return "None"
        default: return "1x"
        }
    }

    private static func repText(value: String?, placeholder: String?) -> String? {
        if let value = cleaned(value) { return value }
        return repSeed(from: placeholder).map { "\($0)" }
    }

    private static func repSeed(from rawValue: String?) -> Int? {
        if let parsed = ParsedRepPlaceholder(rawValue: rawValue),
           let last = parsed.last,
           let value = repValue(last) {
            return value
        }
        return repValue(rawValue)
    }

    private static func repGoal(from rawValue: String?) -> String? {
        ParsedRepPlaceholder(rawValue: rawValue)?.goal
    }

    fileprivate static func repValue(_ rawValue: String?) -> Int? {
        guard let number = numberPrefix(rawValue) else { return nil }
        return max(0, Int(number.rounded()))
    }

    private static func number(_ rawValue: String?) -> Double? {
        guard let value = cleaned(rawValue) else { return nil }
        return Double(value)
    }

    private static func numberPrefix(_ rawValue: String?) -> Double? {
        guard let rawValue = cleaned(rawValue) else { return nil }
        if let value = Double(rawValue) { return value }
        let prefix = rawValue.prefix { character in
            character.isNumber || character == "."
        }
        guard !prefix.isEmpty else { return nil }
        return Double(prefix)
    }

    private static func formatNumber(_ value: Double) -> String {
        if value.rounded() == value {
            return String(Int(value))
        }
        return String(format: "%.1f", value)
    }

    private static func cleaned(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension WorkoutLiveActivitySharedSet {
    var usesSideReps: Bool {
        WorkoutLiveActivitySharedState.repValue(repsLeft) != nil
            || WorkoutLiveActivitySharedState.repValue(repsRight) != nil
            || placeholderRepsLeft != nil
            || placeholderRepsRight != nil
    }
}

private struct ParsedRepPlaceholder {
    let last: String?
    let goal: String?

    init?(rawValue: String?) {
        let trimmed = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty, trimmed != "-", trimmed.localizedCaseInsensitiveCompare("Target") != .orderedSame else {
            return nil
        }
        if let open = trimmed.firstIndex(of: "("),
           let close = trimmed.lastIndex(of: ")"),
           open < close {
            let rawLast = String(trimmed[..<open]).trimmingCharacters(in: .whitespacesAndNewlines)
            let rawGoal = String(trimmed[trimmed.index(after: open)..<close]).trimmingCharacters(in: .whitespacesAndNewlines)
            last = rawLast.isEmpty ? nil : rawLast
            goal = rawGoal.isEmpty ? nil : rawGoal
        } else {
            last = nil
            goal = trimmed
        }
        guard last != nil || goal != nil else { return nil }
    }
}

enum WorkoutLiveActivitySharedStore {
    static let appGroupIdentifier = "group.com.workoutplanner.ios"

    private static let keyPrefix = "forge.liveActivity.sharedState."

    static func load(workoutID: String) -> WorkoutLiveActivitySharedState? {
        guard let data = defaults?.data(forKey: keyPrefix + workoutID) else { return nil }
        return try? JSONDecoder().decode(WorkoutLiveActivitySharedState.self, from: data)
    }

    static func save(_ state: WorkoutLiveActivitySharedState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults?.set(data, forKey: keyPrefix + state.workoutID)
    }

    static func clear(workoutID: String?) {
        guard let workoutID else { return }
        defaults?.removeObject(forKey: keyPrefix + workoutID)
    }

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }
}

struct WorkoutLiveActivityDecreaseRepsIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Decrease Workout Reps"
    static var isDiscoverable = false

    @Parameter(title: "Workout ID") var workoutID: String

    init() {}

    init(workoutID: String) {
        self.workoutID = workoutID
    }

    func perform() async throws -> some IntentResult {
        await adjustWorkoutLiveActivityReps(workoutID: workoutID, delta: -1)
        return .result()
    }
}

struct WorkoutLiveActivityIncreaseRepsIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Increase Workout Reps"
    static var isDiscoverable = false

    @Parameter(title: "Workout ID") var workoutID: String

    init() {}

    init(workoutID: String) {
        self.workoutID = workoutID
    }

    func perform() async throws -> some IntentResult {
        await adjustWorkoutLiveActivityReps(workoutID: workoutID, delta: 1)
        return .result()
    }
}

struct WorkoutLiveActivityDecreaseWeightIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Decrease Workout Weight"
    static var isDiscoverable = false

    @Parameter(title: "Workout ID") var workoutID: String

    init() {}

    init(workoutID: String) {
        self.workoutID = workoutID
    }

    func perform() async throws -> some IntentResult {
        await adjustWorkoutLiveActivityWeight(workoutID: workoutID, delta: -5)
        return .result()
    }
}

struct WorkoutLiveActivityIncreaseWeightIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Increase Workout Weight"
    static var isDiscoverable = false

    @Parameter(title: "Workout ID") var workoutID: String

    init() {}

    init(workoutID: String) {
        self.workoutID = workoutID
    }

    func perform() async throws -> some IntentResult {
        await adjustWorkoutLiveActivityWeight(workoutID: workoutID, delta: 5)
        return .result()
    }
}

struct WorkoutLiveActivityResetWeightIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Reset Workout Weight"
    static var isDiscoverable = false

    @Parameter(title: "Workout ID") var workoutID: String

    init() {}

    init(workoutID: String) {
        self.workoutID = workoutID
    }

    func perform() async throws -> some IntentResult {
        await mutateSharedWorkout(workoutID: workoutID) { state in
            state.adjustWeight(delta: nil, resetToBaseline: true)
        }
        return .result()
    }
}

struct WorkoutLiveActivityLogSetIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Log Workout Set"
    static var isDiscoverable = false

    @Parameter(title: "Workout ID") var workoutID: String

    init() {}

    init(workoutID: String) {
        self.workoutID = workoutID
    }

    func perform() async throws -> some IntentResult {
        await mutateSharedWorkout(workoutID: workoutID) { state in
            state.logCurrentSet()
        }
        return .result()
    }
}

private func mutateSharedWorkout(
    workoutID: String,
    mutation: (inout WorkoutLiveActivitySharedState) -> Void
) async {
    guard var state = WorkoutLiveActivitySharedStore.load(workoutID: workoutID) else { return }
    mutation(&state)
    WorkoutLiveActivitySharedStore.save(state)
    let content = ActivityContent(state: state.contentState, staleDate: nil)
    for activity in Activity<WorkoutLiveActivityAttributes>.activities where activity.attributes.workoutID == workoutID {
        await activity.update(content)
    }
}

private func adjustWorkoutLiveActivityReps(workoutID: String, delta: Int) async {
    await mutateSharedWorkout(workoutID: workoutID) { state in
        state.adjustReps(delta: delta)
    }
}

private func adjustWorkoutLiveActivityWeight(workoutID: String, delta: Double) async {
    await mutateSharedWorkout(workoutID: workoutID) { state in
        state.adjustWeight(delta: delta, resetToBaseline: false)
    }
}
