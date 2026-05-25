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
}

struct Exercise: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var muscleGroup: String
    var notes: String?
    var personalBest: PersonalBest?
    var updatedAt: String?
    var revision: Int?

    init(
        id: String = UUID().uuidString,
        name: String,
        muscleGroup: String = "Other",
        notes: String? = nil,
        personalBest: PersonalBest? = nil,
        updatedAt: String? = nil,
        revision: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.muscleGroup = muscleGroup
        self.notes = notes
        self.personalBest = personalBest
        self.updatedAt = updatedAt
        self.revision = revision
    }
}

struct WorkoutSet: Codable, Equatable {
    var reps: String?
    var weight: String?
    var placeholderReps: String?
    var placeholderWeight: String?
    var restStartTime: Double?
    var restDuration: Int?

    init(
        reps: String? = "",
        weight: String? = "",
        placeholderReps: String? = nil,
        placeholderWeight: String? = nil,
        restStartTime: Double? = nil,
        restDuration: Int? = nil
    ) {
        self.reps = reps
        self.weight = weight
        self.placeholderReps = placeholderReps
        self.placeholderWeight = placeholderWeight
        self.restStartTime = restStartTime
        self.restDuration = restDuration
    }
}

struct ExerciseItem: Codable, Identifiable, Equatable {
    var id: String { exerciseId }
    var exerciseId: String
    var weightType: String?
    var restTargetSeconds: Int?
    var sets: [WorkoutSet]

    init(exerciseId: String, weightType: String? = "weight", restTargetSeconds: Int? = nil, sets: [WorkoutSet]) {
        self.exerciseId = exerciseId
        self.weightType = weightType
        self.restTargetSeconds = restTargetSeconds
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

struct TrainingProgram: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var description: String?
    var schedule: [ProgramScheduleItem]
    var active: Bool?
    var progressionRule: String?
    var updatedAt: String?
    var revision: Int?

    init(
        id: String = UUID().uuidString,
        name: String,
        description: String? = "",
        schedule: [ProgramScheduleItem] = [],
        active: Bool? = true,
        progressionRule: String? = "",
        updatedAt: String? = nil,
        revision: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.schedule = schedule
        self.active = active
        self.progressionRule = progressionRule
        self.updatedAt = updatedAt
        self.revision = revision
    }
}

struct WorkoutLog: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var date: String
    var notes: String?
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

    static let defaults = WorkoutSettings(defaultSets: 4, defaultReps: 8)
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
