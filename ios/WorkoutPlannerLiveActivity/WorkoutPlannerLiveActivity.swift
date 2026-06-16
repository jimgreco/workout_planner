import ActivityKit
import AppIntents
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
            LockScreenWorkoutView(state: context.state, workoutID: context.attributes.workoutID)
                .activityBackgroundTint(liveActivityBackground)
                .activitySystemActionForegroundColor(forgeAccent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    DynamicIslandExerciseHeader(state: context.state)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    DynamicIslandTimerSummary(state: context.state)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    DynamicIslandWorkoutDashboard(state: context.state)
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

private struct DynamicIslandExerciseHeader: View {
    let state: WorkoutLiveActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 5) {
                Text(state.isResting ? "Next" : "Current")
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .foregroundStyle(forgeAccent)
                    .textCase(.uppercase)
                    .padding(.horizontal, 6)
                    .frame(height: 18)
                    .background(forgeAccent.opacity(0.16), in: Capsule())

                if state.needsWeightIncrease && !state.isComplete {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(forgeAccent)
                        .accessibilityLabel("Add weight")
                }
            }

            Text(state.exerciseName)
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(liveActivityText)
                .lineLimit(1)
                .minimumScaleFactor(0.68)

            if !state.isComplete && shouldShowMetadata {
                HStack(spacing: 4) {
                    if !state.muscleGroup.isEmpty {
                        LiveActivityTag(text: state.muscleGroup, compact: true)
                    }

                    if shouldShowSetType(state) {
                        LiveActivityTag(text: state.setType, compact: true)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            }
        }
    }

    private var shouldShowMetadata: Bool {
        !state.muscleGroup.isEmpty || shouldShowSetType(state)
    }
}

private struct DynamicIslandTimerSummary: View {
    let state: WorkoutLiveActivityAttributes.ContentState

    private var progressLabel: String {
        guard state.totalSets > 0 else { return state.setLabel }
        return "\(state.completedSets)/\(state.totalSets)"
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            Text(state.setLabel)
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(liveActivityText)
                .monospacedDigit()
                .lineLimit(1)

            LiveActivityTimer(state: state)
                .font(.system(size: 18, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(state.isResting ? forgeAccent : liveActivityText)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Text(progressLabel)
                .font(.system(size: 9, weight: .heavy, design: .rounded))
                .foregroundStyle(liveActivitySecondaryText)
                .monospacedDigit()
                .lineLimit(1)
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}

private struct DynamicIslandWorkoutDashboard: View {
    let state: WorkoutLiveActivityAttributes.ContentState

    private var repsCaption: String? {
        guard let goal = state.repsGoal else { return nil }
        let strippedGoal = goal.replacingOccurrences(of: "Goal ", with: "")
        return strippedGoal == state.reps ? nil : goal
    }

    private var loadValue: String {
        state.allowsWeightEntry ? (state.weight.isEmpty ? "-" : state.weight) : "No load"
    }

    private var weightLastCaption: String? {
        guard state.allowsWeightEntry,
              let weightLast = state.weightLast,
              !weightLast.isEmpty
        else { return nil }
        return "Last \(weightLast)"
    }

    private var progressTint: Color {
        state.isComplete ? forgeSuccess : forgeAccent
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 7) {
                DynamicIslandMetricTile(
                    title: "Reps",
                    value: state.reps,
                    caption: repsCaption
                )

                DynamicIslandMetricTile(
                    title: "Load",
                    value: loadValue,
                    caption: weightLastCaption,
                    badge: state.allowsWeightEntry ? state.loadLabel : nil
                )
            }

            ProgressView(value: state.progress)
                .tint(progressTint)
                .frame(height: 4)
        }
    }
}

private struct DynamicIslandMetricTile: View {
    let title: String
    let value: String
    var caption: String?
    var badge: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                Text(title)
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .foregroundStyle(liveActivityTertiaryText)
                    .textCase(.uppercase)
                    .lineLimit(1)

                if let badge {
                    Text(badge)
                        .font(.system(size: 8, weight: .heavy, design: .rounded))
                        .foregroundStyle(forgeAccent)
                        .padding(.horizontal, 5)
                        .frame(height: 16)
                        .background(forgeAccent.opacity(0.16), in: Capsule())
                        .lineLimit(1)
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                metricValue
                if let caption {
                    metricCaption(caption)
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(liveActivityRaised, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private var metricValue: some View {
        Text(value.isEmpty ? "-" : value)
            .font(.system(size: 14, weight: .heavy, design: .rounded))
            .foregroundStyle(liveActivityText)
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.62)
    }

    private func metricCaption(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 8, weight: .heavy, design: .rounded))
            .foregroundStyle(liveActivitySecondaryText)
            .lineLimit(1)
            .minimumScaleFactor(0.62)
    }
}

private struct LockScreenWorkoutView: View {
    let state: WorkoutLiveActivityAttributes.ContentState
    let workoutID: String

    private var headline: String {
        if state.isComplete { return "Workout complete" }
        return state.exerciseName
    }

    private var detailLine: String {
        if state.isComplete { return state.workoutName }
        return ""
    }

    private var secondaryLine: String {
        [detailLine, metadataLine]
            .filter { !$0.isEmpty }
            .joined(separator: " • ")
    }

    private var metadataLine: String {
        var parts = [state.setLabel]
        if !state.muscleGroup.isEmpty {
            parts.append(state.muscleGroup)
        }
        if shouldShowSetType(state) {
            parts.append(state.setType)
        }
        return parts.joined(separator: " • ")
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

    private var thirdMetricTitle: String {
        if !state.weight.isEmpty { return "Load" }
        if shouldShowSetType(state) { return "Type" }
        return "Done"
    }

    private var thirdMetricValue: String {
        if !state.weight.isEmpty { return state.weight }
        if shouldShowSetType(state) { return state.setType }
        return progressLabel
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(headline)
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(liveActivityText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)

                    if !secondaryLine.isEmpty {
                        Text(secondaryLine)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(liveActivitySecondaryText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.68)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .trailing, spacing: 2) {
                    LiveActivityTimer(state: state)
                        .font(.system(size: 17, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(state.isResting ? forgeAccent : liveActivityText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.76)

                    if !state.isResting, let personalBest = state.personalBest {
                        Text("PB \(personalBest)")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundStyle(forgeAccent)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
                .fixedSize(horizontal: true, vertical: false)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)

            if state.isComplete {
                HStack(spacing: 7) {
                    LockScreenMetric(title: "Set", value: state.setLabel)
                    LockScreenMetric(title: "Reps", value: state.reps)
                    LockScreenMetric(title: thirdMetricTitle, value: thirdMetricValue)
                }
            } else {
                LiveActivityQuickEntryPanel(state: state, workoutID: workoutID)
            }

            if state.isComplete {
                HStack(alignment: .center, spacing: 8) {
                    Text("Progress")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(liveActivityTertiaryText)
                        .textCase(.uppercase)
                        .frame(width: 48, alignment: .leading)

                    LockScreenProgressBar(value: state.progress, tint: progressTint)

                    Text(progressLabel)
                        .font(.caption2.weight(.heavy).monospacedDigit())
                        .foregroundStyle(liveActivitySecondaryText)
                        .frame(minWidth: 38, alignment: .trailing)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }
}

private struct LockScreenMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(liveActivityTertiaryText)
                .textCase(.uppercase)
            Text(value.isEmpty ? "-" : value)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(liveActivityText)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(liveActivityRaised, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}

private struct LiveActivityMetadataRow: View {
    let state: WorkoutLiveActivityAttributes.ContentState
    var compact = false
    var showsAddWeight = true

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            LiveActivityTag(text: state.setLabel, accent: true, compact: compact)

            if !state.muscleGroup.isEmpty {
                LiveActivityTag(text: state.muscleGroup, compact: compact)
            }

            if shouldShowSetType(state) {
                LiveActivityTag(text: state.setType, compact: compact)
            }

            if showsAddWeight && state.needsWeightIncrease && !state.isComplete {
                LiveActivityAddWeightChip(compact: compact)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.78)
    }
}

private struct LiveActivityTag: View {
    let text: String
    var accent = false
    var compact = false

    var body: some View {
        Text(text)
            .font(.system(size: compact ? 9 : 11, weight: .heavy, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .foregroundStyle(accent ? forgeAccent : liveActivitySecondaryText)
            .padding(.horizontal, compact ? 5 : 7)
            .frame(height: compact ? 19 : 24)
            .background((accent ? forgeAccent.opacity(0.16) : liveActivityRaised), in: Capsule())
    }
}

private struct LiveActivityQuickEntryPanel: View {
    let state: WorkoutLiveActivityAttributes.ContentState
    let workoutID: String

    var body: some View {
        VStack(spacing: 7) {
            LiveActivitySummaryStrip(state: state)

            HStack(alignment: .center, spacing: 8) {
                LiveActivityStepperButton(
                    label: "-1",
                    intent: WorkoutLiveActivityDecreaseRepsIntent(workoutID: workoutID)
                )

                LiveActivityStepperButton(
                    label: "+1",
                    intent: WorkoutLiveActivityIncreaseRepsIntent(workoutID: workoutID)
                )

                Spacer(minLength: 3)

                LiveActivityIconActionButton(
                    systemImage: "checkmark",
                    intent: WorkoutLiveActivityLogSetIntent(workoutID: workoutID)
                )

                Spacer(minLength: 3)

                if state.allowsWeightEntry {
                    LiveActivityStepperButton(
                        label: "-5",
                        intent: WorkoutLiveActivityDecreaseWeightIntent(workoutID: workoutID)
                    )

                    LiveActivityStepperButton(
                        label: "+5",
                        intent: WorkoutLiveActivityIncreaseWeightIntent(workoutID: workoutID)
                    )
                } else {
                    Color.clear
                        .frame(width: 84, height: 34)
                }
            }
        }
    }
}

private struct LiveActivitySummaryStrip: View {
    let state: WorkoutLiveActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 10) {
            summaryMetric(title: "Reps", value: state.reps, inlineCaption: repsCaption)

            Rectangle()
                .fill(Color.white.opacity(0.10))
                .frame(width: 1, height: 26)

            summaryMetric(
                title: "Load",
                value: loadValue,
                inlineCaption: weightLastCaption,
                badge: state.allowsWeightEntry ? state.loadLabel : nil
            )
        }
        .padding(.horizontal, 11)
        .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
        .background(liveActivityRaised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var repsCaption: String? {
        guard let goal = state.repsGoal else { return nil }
        let strippedGoal = goal.replacingOccurrences(of: "Goal ", with: "")
        return strippedGoal == state.reps ? nil : goal
    }

    private var loadValue: String {
        state.allowsWeightEntry ? (state.weight.isEmpty ? "-" : state.weight) : "No load"
    }

    private var weightLastCaption: String? {
        guard state.allowsWeightEntry,
              let weightLast = state.weightLast,
              !weightLast.isEmpty
        else { return nil }
        return "Last \(weightLast)"
    }

    private func summaryMetric(title: String, value: String, inlineCaption: String? = nil, badge: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Text(title)
                    .font(.system(size: 8, weight: .heavy, design: .rounded))
                    .foregroundStyle(liveActivityTertiaryText)
                    .textCase(.uppercase)
                    .lineLimit(1)

                if let badge {
                    Text(badge)
                        .font(.system(size: 8, weight: .heavy, design: .rounded))
                        .foregroundStyle(forgeAccent)
                        .padding(.horizontal, 5)
                        .frame(height: 16)
                        .background(forgeAccent.opacity(0.16), in: Capsule())
                        .lineLimit(1)
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(value.isEmpty ? "-" : value)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(liveActivityText)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                if let inlineCaption {
                    Text(inlineCaption)
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundStyle(liveActivitySecondaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct LiveActivityStepperButton<I: LiveActivityIntent>: View {
    let label: String
    let intent: I

    var body: some View {
        Button(intent: intent) {
            Text(label)
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(liveActivityText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 38)
                .frame(height: 34)
                .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct LiveActivityIconActionButton<I: LiveActivityIntent>: View {
    let systemImage: String
    let intent: I

    var body: some View {
        Button(intent: intent) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 58, height: 34)
                .background(forgeAccent, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct DynamicIslandQuickEntryRow: View {
    let state: WorkoutLiveActivityAttributes.ContentState
    let workoutID: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            CompactMetric(title: "Reps", value: compactRepsValue)
            CompactMetric(title: "Load", value: compactWeightValue)
            if state.allowsWeightEntry {
                DynamicIslandAdjustmentButtons(workoutID: workoutID)
            } else if shouldShowSetType(state) {
                CompactMetric(title: "Type", value: state.setType)
            }
        }
    }

    private var compactRepsValue: String {
        return state.reps
    }

    private var compactWeightValue: String {
        guard state.allowsWeightEntry else { return "No load" }
        if state.weight.isEmpty { return state.loadLabel }
        return "\(state.weight) \(state.loadLabel)"
    }
}

private struct DynamicIslandAdjustmentButtons: View {
    let workoutID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Tune")
                .font(.caption2.weight(.heavy))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            HStack(spacing: 4) {
                miniButton("-5", intent: WorkoutLiveActivityDecreaseWeightIntent(workoutID: workoutID))
                miniButton("0", intent: WorkoutLiveActivityResetWeightIntent(workoutID: workoutID), filled: true)
                miniButton("+5", intent: WorkoutLiveActivityIncreaseWeightIntent(workoutID: workoutID))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func miniButton<I: LiveActivityIntent>(_ label: String, intent: I, filled: Bool = false) -> some View {
        Button(intent: intent) {
            Text(label)
                .font(.caption2.weight(.heavy))
                .foregroundStyle(filled ? .white : .primary)
                .frame(minWidth: 20, minHeight: 18)
                .background(filled ? forgeAccent : Color.white.opacity(0.12), in: Capsule())
        }
        .buttonStyle(.plain)
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
        .frame(height: 5)
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

private struct LiveActivityAddWeightChip: View {
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 3 : 4) {
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: compact ? 9 : 10, weight: .heavy))
            Text("Add Weight")
                .font(.system(size: compact ? 9 : 10, weight: .heavy))
                .textCase(.uppercase)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .foregroundStyle(forgeAccent)
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 3 : 4)
        .background(forgeAccent.opacity(0.16), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
        .accessibilityLabel("Add weight")
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
