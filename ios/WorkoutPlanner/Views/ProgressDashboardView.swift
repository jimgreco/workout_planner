import Foundation
import SwiftUI

private let progressMetricColumns = [
    GridItem(.flexible(), spacing: 10, alignment: .top),
    GridItem(.flexible(), spacing: 10, alignment: .top),
]

struct ProgressDashboardView: View {
    @EnvironmentObject private var store: WorkoutStore
    @State private var selectedRange: ProgressRange = .ninetyDays

    private var stats: ProgressStats {
        ProgressStats(logs: store.logs, exercises: store.exercises, range: selectedRange)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Picker("", selection: $selectedRange) {
                        ForEach(ProgressRange.allCases) { range in
                            Text(range.label).tag(range)
                        }
                    }
                    .pickerStyle(.segmented)

                    if stats.totalWorkouts == 0 {
                        EmptyState(icon: "chart.bar", text: "Finish a workout to see progress here.")
                    } else {
                        LazyVGrid(columns: progressMetricColumns, alignment: .leading, spacing: 10) {
                            ProgressMetricCard(title: "Workouts", value: "\(stats.totalWorkouts)", subtitle: selectedRange.detail, icon: "dumbbell.fill")
                            ProgressMetricCard(title: "Volume", value: formatVolume(stats.totalVolume), subtitle: nil, icon: "chart.line.uptrend.xyaxis")
                            ProgressMetricCard(title: "Avg Sets", value: oneDecimal(stats.averageSets), subtitle: "per workout", icon: "calendar")
                            ProgressMetricCard(title: "Streak", value: "\(stats.streak)d", subtitle: nil, icon: "flame.fill")
                            ProgressMetricCard(title: "PRs", value: "\(stats.pbCount)", subtitle: "in range", icon: "star.fill")
                        }

                        if let best = stats.topExercises.first(where: { $0.bestSet != nil }) {
                            ProgressCallout(summary: best)
                        }

                        ProgressPanel(title: "Weekly Volume") {
                            WeeklyVolumeBars(series: stats.weeklySeries)
                        }

                        ProgressPanel(title: "Muscle Split") {
                            MuscleSplitRows(items: stats.muscleSplit)
                        }

                        ProgressPanel(title: "Top Exercises") {
                            ProgressExerciseRows(items: Array(stats.topExercises.prefix(6)))
                        }

                        ProgressPanel(title: "Recent PRs") {
                            RecentPRRows(items: stats.recentPBs)
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle("Progress")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

private enum ProgressRange: String, CaseIterable, Identifiable {
    case sevenDays
    case thirtyDays
    case ninetyDays
    case all

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sevenDays: return "7D"
        case .thirtyDays: return "30D"
        case .ninetyDays: return "90D"
        case .all: return "All"
        }
    }

    var detail: String {
        switch self {
        case .sevenDays: return "last 7 days"
        case .thirtyDays: return "last 30 days"
        case .ninetyDays: return "last 90 days"
        case .all: return "all time"
        }
    }

    var days: Int? {
        switch self {
        case .sevenDays: return 7
        case .thirtyDays: return 30
        case .ninetyDays: return 90
        case .all: return nil
        }
    }
}

private struct ProgressStats {
    let scopedLogs: [WorkoutLog]
    let totalWorkouts: Int
    let totalVolume: Double
    let totalSets: Int
    let averageSets: Double
    let streak: Int
    let pbCount: Int
    let weeklySeries: [WeeklyProgress]
    let muscleSplit: [MuscleProgress]
    let topExercises: [ExerciseProgressSummary]
    let recentPBs: [RecentPR]

    init(logs: [WorkoutLog], exercises: [Exercise], range: ProgressRange) {
        let finished = logs.finishedWorkoutLogs()
        let exerciseById = Dictionary(uniqueKeysWithValues: exercises.map { ($0.id, $0) })
        let scoped = finished.filter { log in
            guard let days = range.days else { return true }
            let calendar = Calendar.current
            let today = calendar.startOfDay(for: Date())
            guard let cutoff = calendar.date(byAdding: .day, value: -days + 1, to: today) else { return true }
            return DateHelpers.date(from: log.date) >= cutoff
        }

        var weekly: [String: WeeklyProgress] = [:]
        var muscles: [String: MuscleProgress] = [:]
        var volume = 0.0
        var sets = 0

        for log in scoped {
            let week = startOfWeekString(log.date)
            var weeklyStat = weekly[week] ?? WeeklyProgress(week: week, workouts: 0, volume: 0)
            weeklyStat.workouts += 1

            for item in log.exerciseItems {
                let itemVolume = volumeForItem(item)
                let setCount = item.sets.count
                let muscleGroup = exerciseById[item.exerciseId]?.muscleGroup ?? "Other"
                volume += itemVolume
                sets += setCount
                weeklyStat.volume += itemVolume

                var muscle = muscles[muscleGroup] ?? MuscleProgress(muscleGroup: muscleGroup, sets: 0, volume: 0)
                muscle.sets += setCount
                muscle.volume += itemVolume
                muscles[muscleGroup] = muscle
            }

            weekly[week] = weeklyStat
        }

        scopedLogs = scoped
        totalWorkouts = scoped.count
        totalVolume = volume
        totalSets = sets
        averageSets = scoped.isEmpty ? 0 : Double(sets) / Double(scoped.count)
        streak = workoutStreak(finished)
        pbCount = scoped.reduce(0) { $0 + ($1.pbExerciseIds?.count ?? 0) }
        weeklySeries = weekly.values.sorted { $0.week < $1.week }
        muscleSplit = muscles.values.sorted { $0.sets > $1.sets }
        topExercises = exercises
            .map { ExerciseProgressSummary(exercise: $0, logs: scoped) }
            .filter { $0.sessions > 0 }
            .sorted {
                if $0.totalVolume == $1.totalVolume {
                    return $0.sessions > $1.sessions
                }
                return $0.totalVolume > $1.totalVolume
            }
        recentPBs = finished.flatMap { log in
            (log.pbExerciseIds ?? []).compactMap { id -> RecentPR? in
                guard let exercise = exerciseById[id] else { return nil }
                return RecentPR(id: "\(log.id)-\(id)", exerciseName: exercise.name, logName: log.name, date: log.date)
            }
        }
        .prefix(6)
        .map { $0 }
    }
}

private struct WeeklyProgress: Identifiable {
    var id: String { week }
    let week: String
    var workouts: Int
    var volume: Double
}

private struct MuscleProgress: Identifiable {
    var id: String { muscleGroup }
    let muscleGroup: String
    var sets: Int
    var volume: Double
}

struct ExerciseProgressSummary {
    let exercise: Exercise
    let history: [ExerciseHistoryEntry]
    let sessions: Int
    let totalVolume: Double
    let totalSets: Int
    let bestSet: ExerciseBestSet?
    let lastTrained: String?

    init(exercise: Exercise, logs: [WorkoutLog]) {
        self.exercise = exercise
        history = exerciseHistory(exerciseId: exercise.id, logs: logs)
        sessions = history.count
        totalVolume = history.reduce(0) { $0 + $1.volume }
        totalSets = history.reduce(0) { $0 + $1.setCount }
        bestSet = history.compactMap(\.bestSet).max { $0.score < $1.score }
        lastTrained = history.first?.date
    }
}

struct ExerciseHistoryEntry: Identifiable {
    let id: String
    let logName: String
    let date: String
    let item: ExerciseItem
    let setCount: Int
    let volume: Double
    let bestSet: ExerciseBestSet?
}

struct ExerciseBestSet {
    let set: WorkoutSet
    let weightType: String?
    let score: Double
    let date: String
}

private struct RecentPR: Identifiable {
    let id: String
    let exerciseName: String
    let logName: String
    let date: String
}

private struct ProgressMetricCard: View {
    let title: String
    let value: String
    let subtitle: String?
    let icon: String

    var body: some View {
        Card {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 34, height: 34)
                    .background(Theme.accent.opacity(0.09))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(value)
                        .font(.system(size: 20, weight: .heavy))
                        .foregroundStyle(Theme.text)
                        .minimumScaleFactor(0.75)
                    Text(title)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.muted)
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
        }
    }
}

private struct ProgressCallout: View {
    let summary: ExerciseProgressSummary

    var body: some View {
        if let best = summary.bestSet {
            HStack(spacing: 12) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 36, height: 36)
                    .background(Theme.accent.opacity(0.09))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(summary.exercise.name)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(Theme.text)
                    Text("Best recent set: \(setLabel(best.set, weightType: best.weightType, usesTime: summary.exercise.usesTime == true)) • \(shortDate(best.date))")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(16)
            .background(Theme.accent.opacity(0.07))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.accent.opacity(0.25), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        }
    }
}

struct ProgressPanel<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                Text(title)
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(Theme.text)
                content
            }
        }
    }
}

private struct WeeklyVolumeBars: View {
    let series: [WeeklyProgress]

    var body: some View {
        if series.isEmpty {
            EmptyState(icon: "chart.bar", text: "No finished workouts in this range.")
                .padding(.vertical, -12)
        } else {
            let visible = Array(series.suffix(8))
            let maxVolume = max(visible.map(\.volume).max() ?? 1, 1)
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(visible) { item in
                    VStack(spacing: 6) {
                        Text(compactVolume(item.volume))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Theme.surface)
                            .frame(height: 118)
                            .overlay(alignment: .bottom) {
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(LinearGradient(colors: [Theme.accent.opacity(0.7), Theme.accent], startPoint: .top, endPoint: .bottom))
                                    .frame(height: max(8, CGFloat(item.volume / maxVolume) * 118))
                            }
                        Text(shortDate(item.week))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

private struct MuscleSplitRows: View {
    let items: [MuscleProgress]

    var body: some View {
        if items.isEmpty {
            EmptyState(icon: "figure.strengthtraining.traditional", text: "No muscle-group data yet.")
                .padding(.vertical, -12)
        } else {
            let visible = Array(items.prefix(8))
            let maxSets = max(visible.map(\.sets).max() ?? 1, 1)
            VStack(spacing: 12) {
                ForEach(visible) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(item.muscleGroup)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.text)
                            Spacer()
                            Text("\(item.sets) sets")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Theme.muted)
                        }
                        GeometryReader { proxy in
                            RoundedRectangle(cornerRadius: 999, style: .continuous)
                                .fill(Theme.surface)
                                .overlay(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                                        .fill(Theme.success)
                                        .frame(width: max(10, proxy.size.width * CGFloat(item.sets) / CGFloat(maxSets)))
                                }
                        }
                        .frame(height: 8)
                    }
                }
            }
        }
    }
}

private struct ProgressExerciseRows: View {
    let items: [ExerciseProgressSummary]

    var body: some View {
        if items.isEmpty {
            EmptyState(icon: "dumbbell", text: "No exercise history yet.")
                .padding(.vertical, -12)
        } else {
            VStack(spacing: 0) {
                ForEach(items, id: \.exercise.id) { item in
                    ProgressRow(title: item.exercise.name, subtitle: "\(item.sessions) sessions • \(item.totalSets) sets", value: formatVolume(item.totalVolume))
                }
            }
        }
    }
}

private struct RecentPRRows: View {
    let items: [RecentPR]

    var body: some View {
        if items.isEmpty {
            EmptyState(icon: "star", text: "No PRs in recent history.")
                .padding(.vertical, -12)
        } else {
            VStack(spacing: 0) {
                ForEach(items) { item in
                    ProgressRow(title: item.exerciseName, subtitle: item.logName, value: shortDate(item.date))
                }
            }
        }
    }
}

private struct ProgressRow: View {
    let title: String
    let subtitle: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.border.opacity(0.55)).frame(height: 1)
        }
    }
}

func exerciseHistory(exerciseId: String, logs: [WorkoutLog]) -> [ExerciseHistoryEntry] {
    logs.finishedWorkoutLogs().compactMap { log in
        guard let item = log.exerciseItems.first(where: { $0.exerciseId == exerciseId }) else { return nil }
        let best = item.sets.compactMap { set -> ExerciseBestSet? in
            let score: Double
            if item.weightType == "none" {
                score = number(set.reps)
            } else {
                score = estimatedOneRepMax(weight: effectiveWeight(set.weight, weightType: item.weightType), reps: set.reps)
            }
            guard score > 0 else { return nil }
            return ExerciseBestSet(set: set, weightType: item.weightType, score: score, date: log.date)
        }
        .max { $0.score < $1.score }

        return ExerciseHistoryEntry(
            id: "\(log.id)-\(exerciseId)",
            logName: log.name,
            date: log.date,
            item: item,
            setCount: item.sets.count,
            volume: volumeForItem(item),
            bestSet: best
        )
    }
}

private extension Array where Element == WorkoutLog {
    func finishedWorkoutLogs() -> [WorkoutLog] {
        filter { $0.status == "finished" }
            .sorted { lhs, rhs in
                if lhs.date == rhs.date {
                    return (lhs.endTime ?? lhs.startTime ?? "") > (rhs.endTime ?? rhs.startTime ?? "")
                }
                return lhs.date > rhs.date
            }
    }
}

private func startOfWeekString(_ day: String) -> String {
    let date = DateHelpers.date(from: day)
    let calendar = Calendar.current
    let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
    return DateHelpers.dayString(from: start)
}

private func workoutStreak(_ logs: [WorkoutLog]) -> Int {
    let dates = Array(Set(logs.map(\.date))).sorted(by: >)
    guard let first = dates.first else { return 0 }
    var streak = 1
    var previous = DateHelpers.date(from: first)
    for day in dates.dropFirst() {
        let current = DateHelpers.date(from: day)
        let distance = Calendar.current.dateComponents([.day], from: current, to: previous).day ?? 0
        if distance != 1 { break }
        streak += 1
        previous = current
    }
    return streak
}

func volumeForItem(_ item: ExerciseItem) -> Double {
    item.sets.reduce(0) { total, set in
        total + effectiveWeight(set.weight, weightType: item.weightType) * number(set.reps)
    }
}

func number(_ value: String?) -> Double {
    Double((value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
}

func effectiveWeight(_ weight: String?, weightType: String?) -> Double {
    let value = number(weight)
    guard value > 0, weightType != "none" else { return 0 }
    if weightType == "bar_double" { return (value * 2) + 45 }
    if weightType == "double" { return value * 2 }
    return value
}

func estimatedOneRepMax(weight: Double, reps: String?) -> Double {
    let reps = number(reps)
    guard weight > 0, reps > 0 else { return 0 }
    return weight * (1 + reps / 30)
}

func setLabel(_ set: WorkoutSet, weightType: String?, usesTime: Bool = false) -> String {
    let reps = (set.reps?.isEmpty == false) ? set.reps! : "-"
    let unit = usesTime ? "secs" : "reps"
    let effort = [
        set.rpe?.isEmpty == false ? "RPE \(set.rpe!)" : nil,
        set.rir?.isEmpty == false ? "RIR \(set.rir!)" : nil,
    ].compactMap { $0 }.joined(separator: " · ")
    let effortSuffix = effort.isEmpty ? "" : " · \(effort)"
    let typePrefix = set.setType == nil || set.setType == "working" ? "" : "\(setTypeLabel(set.setType)) · "
    guard weightType != "none" else { return "\(typePrefix)\(reps) \(unit)\(effortSuffix)" }
    let weight = (set.weight?.isEmpty == false) ? "\(trimmed(number(set.weight))) lb" : "-"
    let suffix = weightType == "bar_double" ? " (bar + 2x)" : weightType == "double" ? " (2x)" : ""
    return "\(typePrefix)\(reps) x \(weight)\(suffix)\(effortSuffix)"
}

func formatVolume(_ value: Double) -> String {
    let rounded = Int(value.rounded())
    if rounded >= 1_000_000 {
        return String(format: "%.1fM lb", Double(rounded) / 1_000_000)
    }
    if rounded >= 1_000 {
        return "\(Int((Double(rounded) / 1_000).rounded()))k lb"
    }
    return "\(rounded) lb"
}

private func compactVolume(_ value: Double) -> String {
    let rounded = Int(value.rounded())
    if rounded >= 1_000 {
        return "\(Int((Double(rounded) / 1_000).rounded()))k"
    }
    return "\(rounded)"
}

private func oneDecimal(_ value: Double) -> String {
    String(format: "%.1f", value)
}

private func trimmed(_ value: Double) -> String {
    if value.rounded() == value {
        return "\(Int(value))"
    }
    return String(format: "%.1f", value)
}

private func shortDate(_ day: String) -> String {
    DateHelpers.date(from: day).formatted(.dateTime.month(.abbreviated).day())
}
