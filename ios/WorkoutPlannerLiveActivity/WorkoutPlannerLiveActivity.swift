import ActivityKit
import SwiftUI
import WidgetKit

private let forgeAccent = Color(red: 0.96, green: 0.16, blue: 0.38)

struct WorkoutPlannerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutLiveActivityAttributes.self) { context in
            LockScreenWorkoutView(state: context.state)
                .activityBackgroundTint(Color(.systemBackground))
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
                            CompactMetric(title: "Type", value: context.state.setType)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 10) {
                Label("Forge", systemImage: "bolt.fill")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(forgeAccent)

                Spacer()

                LiveActivityTimer(state: state)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(state.isResting ? forgeAccent : .secondary)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(state.isComplete ? "All sets logged" : state.exerciseName)
                    .font(.headline.weight(.heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                if !state.muscleGroup.isEmpty {
                    Text(state.muscleGroup)
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(.secondary.opacity(0.14), in: Capsule())
                }
            }

            if state.isResting {
                Text("Resting after \(state.restExerciseName ?? state.exerciseName)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                CompactMetric(title: "Set", value: state.setLabel)
                CompactMetric(title: "Reps", value: state.reps)
                if !state.weight.isEmpty {
                    CompactMetric(title: "Weight", value: state.weight)
                }
                CompactMetric(title: "Type", value: state.setType)
            }

            if let personalBest = state.personalBest {
                Label("PB \(personalBest)", systemImage: "star.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(forgeAccent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }

            ProgressView(value: state.progress)
                .tint(state.isComplete ? .green : forgeAccent)

            HStack {
                Text("\(state.completedSets) of \(state.totalSets) sets")
                Spacer()
                Text("\(state.exerciseCount) \(state.exerciseCount == 1 ? "exercise" : "exercises")")
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        .padding(16)
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
