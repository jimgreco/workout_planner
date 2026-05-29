import ActivityKit
import SwiftUI
import WidgetKit

private let forgeAccent = Color(red: 0.96, green: 0.16, blue: 0.38)
private let forgeSuccess = Color(red: 0.23, green: 0.82, blue: 0.48)
private let liveActivityBackground = Color(red: 0.07, green: 0.07, blue: 0.08)
private let liveActivityRaised = Color.white.opacity(0.10)
private let liveActivityText = Color.white
private let liveActivitySecondaryText = Color.white.opacity(0.68)
private let liveActivityTertiaryText = Color.white.opacity(0.48)

struct WorkoutPlannerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutLiveActivityAttributes.self) { context in
            LockScreenWorkoutView(state: context.state)
                .activityBackgroundTint(liveActivityBackground)
                .activitySystemActionForegroundColor(forgeAccent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.state.isResting ? "Rest" : "Current")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                        Text(context.state.exerciseName)
                            .font(.headline.weight(.heavy))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(context.state.setLabel)
                            .font(.caption.weight(.bold))
                        LiveActivityTimer(state: context.state)
                            .font(.headline.weight(.heavy).monospacedDigit())
                            .foregroundStyle(context.state.isResting ? forgeAccent : .primary)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            CompactMetric(title: "Reps", value: context.state.reps)
                            if !context.state.weight.isEmpty {
                                CompactMetric(title: "Weight", value: context.state.weight)
                            }
                            if shouldShowSetType(context.state) {
                                CompactMetric(title: "Type", value: context.state.setType)
                            }
                        }

                        ProgressView(value: context.state.progress)
                            .tint(context.state.isComplete ? .green : forgeAccent)
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.isResting ? "timer" : "bolt.fill")
                    .foregroundStyle(forgeAccent)
            } compactTrailing: {
                Text(context.state.isResting ? restShortLabel(context.state) : context.state.setLabel)
                    .font(.caption2.weight(.heavy))
                    .monospacedDigit()
                    .minimumScaleFactor(0.8)
            } minimal: {
                Image(systemName: context.state.isResting ? "timer" : "flame.fill")
                    .foregroundStyle(forgeAccent)
            }
            .keylineTint(forgeAccent)
        }
    }
}

private struct LockScreenWorkoutView: View {
    let state: WorkoutLiveActivityAttributes.ContentState

    private var statusIcon: String {
        if state.isComplete { return "checkmark" }
        return state.isResting ? "timer" : "bolt.fill"
    }

    private var headline: String {
        if state.isComplete { return "Workout complete" }
        return state.isResting ? "Rest" : state.exerciseName
    }

    private var detailLine: String {
        if state.isComplete { return state.workoutName }
        if state.isResting {
            let exercise = state.restExerciseName ?? state.exerciseName
            return exercise.isEmpty ? "Between sets" : "After \(exercise)"
        }

        var parts: [String] = []
        if !state.muscleGroup.isEmpty {
            parts.append(state.muscleGroup)
        }
        if shouldShowSetType(state) {
            parts.append(state.setType)
        }
        return parts.isEmpty ? state.workoutName : parts.joined(separator: " / ")
    }

    private var progressLabel: String {
        if state.totalSets > 0 {
            return "\(state.completedSets)/\(state.totalSets)"
        }
        return "\(state.exerciseCount) \(state.exerciseCount == 1 ? "exercise" : "exercises")"
    }

    private var progressTint: Color {
        state.isComplete ? forgeSuccess : forgeAccent
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 9) {
                Image(systemName: statusIcon)
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(progressTint, in: Circle())

                VStack(alignment: .leading, spacing: 1) {
                    Text("Forge")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(liveActivityText)
                    Text("\(state.exerciseCount) \(state.exerciseCount == 1 ? "exercise" : "exercises")")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(liveActivityTertiaryText)
                        .lineLimit(1)
                }

                Spacer()

                LiveActivityTimer(state: state)
                    .font(.system(.title3, design: .rounded).weight(.heavy).monospacedDigit())
                    .foregroundStyle(state.isResting ? forgeAccent : liveActivityText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(headline)
                    .font(.headline.weight(.heavy))
                    .foregroundStyle(liveActivityText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Text(detailLine)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(liveActivitySecondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }

            HStack(spacing: 8) {
                LockScreenMetric(title: "Set", value: state.setLabel)
                LockScreenMetric(title: "Reps", value: state.reps)
                if !state.weight.isEmpty {
                    LockScreenMetric(title: "Weight", value: state.weight)
                } else if shouldShowSetType(state) {
                    LockScreenMetric(title: "Type", value: state.setType)
                }
            }

            HStack(spacing: 8) {
                LockScreenProgressBar(value: state.progress, tint: progressTint)

                Text(progressLabel)
                    .font(.caption2.weight(.heavy).monospacedDigit())
                    .foregroundStyle(liveActivitySecondaryText)
                    .frame(minWidth: 34, alignment: .trailing)

                if let personalBest = state.personalBest {
                    Label("PB \(personalBest)", systemImage: "star.fill")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(forgeAccent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

private struct LockScreenMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2.weight(.heavy))
                .foregroundStyle(liveActivityTertiaryText)
                .textCase(.uppercase)
            Text(value.isEmpty ? "-" : value)
                .font(.caption.weight(.heavy))
                .foregroundStyle(liveActivityText)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(liveActivityRaised, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct LockScreenProgressBar: View {
    let value: Double
    let tint: Color

    private var clampedValue: CGFloat {
        CGFloat(min(1, max(0, value)))
    }

    var body: some View {
        GeometryReader { proxy in
            Capsule()
                .fill(Color.white.opacity(0.12))
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(tint)
                        .frame(width: proxy.size.width * clampedValue)
                }
        }
        .frame(height: 4)
    }
}

private struct CompactMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2.weight(.heavy))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(value.isEmpty ? "-" : value)
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct LiveActivityTimer: View {
    let state: WorkoutLiveActivityAttributes.ContentState

    var body: some View {
        if let restTargetEnd = state.restTargetEnd, restTargetEnd > Date() {
            Text(timerInterval: Date()...restTargetEnd, countsDown: true)
        } else if let restStartedAt = state.restStartedAt {
            Text(timerInterval: restStartedAt...Date.distantFuture, countsDown: false)
        } else if let startedAt = state.startedAt {
            Text(timerInterval: startedAt...Date.distantFuture, countsDown: false)
        } else {
            Text("0m")
        }
    }
}

private func restShortLabel(_ state: WorkoutLiveActivityAttributes.ContentState) -> String {
    if let end = state.restTargetEnd, end > Date() {
        let remaining = max(0, Int(end.timeIntervalSinceNow))
        return remaining >= 60 ? "\(remaining / 60)m" : "\(remaining)s"
    }
    return state.setLabel
}

private func shouldShowSetType(_ state: WorkoutLiveActivityAttributes.ContentState) -> Bool {
    let setType = state.setType.lowercased()
    return !setType.isEmpty && setType != "-" && setType != "working"
}
