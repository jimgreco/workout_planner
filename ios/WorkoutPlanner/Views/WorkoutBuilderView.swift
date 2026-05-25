import SwiftUI

enum WorkoutBuilderFocusedField: Hashable {
    case reps(itemIndex: Int, setIndex: Int)
    case weight(itemIndex: Int, setIndex: Int)
}

private let restTargetOptions: [(label: String, seconds: Int?)] = [
    ("No target", nil),
    ("0:30", 30),
    ("1:00", 60),
    ("1:30", 90),
    ("2:00", 120),
    ("3:00", 180),
    ("5:00", 300),
]

struct WorkoutBuilderView: View {
    let exercises: [Exercise]
    @Binding var items: [ExerciseItem]
    @FocusState.Binding var focusedField: WorkoutBuilderFocusedField?
    var readOnly = false
    var showWeight = true
    var defaultSets = 4
    var defaultReps = 8
    var activeExerciseIndex: Int?
    var activeSetIndex: Int?
    var planningMode = false
    var onSetCompleted: ((Int, Int) -> Void)?
    var onChanged: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            ForEach(items.indices, id: \.self) { index in
                if let exercise = exercise(for: items[index].exerciseId) {
                    ExerciseSetsCard(
                        exercise: exercise,
                        item: $items[index],
                        focusedField: $focusedField,
                        itemIndex: index,
                        isActiveExercise: activeExerciseIndex == index,
                        activeSetIndex: activeSetIndex,
                        readOnly: readOnly,
                        showWeight: showWeight,
                        planningMode: planningMode,
                        canMoveUp: index > 0,
                        canMoveDown: index < items.count - 1,
                        defaultReps: defaultReps,
                        onMove: { direction in move(index, direction) },
                        onRemove: { removeExercise(index) },
                        onSetCompleted: onSetCompleted,
                        onChanged: onChanged
                    )
                }
            }

            if !readOnly {
                Menu {
                    let available = availableExercises
                    if available.isEmpty {
                        Text("No more exercises available")
                    } else {
                        ForEach(available) { exercise in
                            Button("\(exercise.name) (\(exercise.muscleGroup))") {
                                addExercise(exercise)
                            }
                        }
                    }
                } label: {
                    Label("Add Exercise", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(compact: true))
            }

            if exercises.isEmpty && !readOnly {
                Text("No exercises configured yet. Go to Library to add some first.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var availableExercises: [Exercise] {
        let used = Set(items.map(\.exerciseId))
        return exercises
            .filter { !used.contains($0.id) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func exercise(for id: String) -> Exercise? {
        exercises.first { $0.id == id }
    }

    private func addExercise(_ exercise: Exercise) {
        let sets = (0..<defaultSets).map { _ in
            planningMode
                ? WorkoutSet(reps: "", weight: "", placeholderReps: String(defaultReps))
                : WorkoutSet(reps: String(defaultReps), weight: "")
        }
        items.append(ExerciseItem(exerciseId: exercise.id, weightType: "weight", sets: sets))
        onChanged?()
    }

    private func removeExercise(_ index: Int) {
        items.remove(at: index)
        onChanged?()
    }

    private func move(_ index: Int, _ direction: Int) {
        let newIndex = index + direction
        guard items.indices.contains(index), items.indices.contains(newIndex) else { return }
        items.swapAt(index, newIndex)
        onChanged?()
    }
}

private struct ExerciseSetsCard: View {
    let exercise: Exercise
    @Binding var item: ExerciseItem
    @FocusState.Binding var focusedField: WorkoutBuilderFocusedField?
    let itemIndex: Int
    let isActiveExercise: Bool
    let activeSetIndex: Int?
    let readOnly: Bool
    let showWeight: Bool
    let planningMode: Bool
    let canMoveUp: Bool
    let canMoveDown: Bool
    let defaultReps: Int
    let onMove: (Int) -> Void
    let onRemove: () -> Void
    let onSetCompleted: ((Int, Int) -> Void)?
    let onChanged: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(exercise.name)
                            .font(.system(size: 17, weight: .heavy))
                            .foregroundStyle(Theme.text)
                            .lineLimit(2)
                        Badge(text: exercise.muscleGroup)
                    }
                    if let pb = exercise.personalBest?.weight, !pb.isEmpty {
                        Text("PB: \(pb) lbs")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.muted)
                    }
                }

                Spacer()

                if !readOnly {
                    HStack(spacing: 6) {
                        IconCircleButton(systemName: "arrow.up", disabled: !canMoveUp) { onMove(-1) }
                        IconCircleButton(systemName: "arrow.down", disabled: !canMoveDown) { onMove(1) }
                        IconCircleButton(systemName: "xmark", tint: Theme.danger, action: onRemove)
                    }
                }
            }

            Divider()

            if showWeight && !readOnly {
                Picker("Weight type", selection: Binding(
                    get: { item.weightType ?? "weight" },
                    set: { item.weightType = $0; onChanged?() }
                )) {
                    Text("Weight").tag("weight")
                    Text("2x").tag("double")
                    Text("None").tag("none")
                }
                .pickerStyle(.segmented)
            }

            if !readOnly {
                Menu {
                    ForEach(restTargetOptions, id: \.label) { option in
                        Button(option.label) {
                            item.restTargetSeconds = option.seconds
                            onChanged?()
                        }
                    }
                } label: {
                    Label("Rest \(restTargetLabel(item.restTargetSeconds))", systemImage: "timer")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(SecondaryButtonStyle(compact: true))
            } else if item.restTargetSeconds ?? 0 > 0 {
                Label("Rest \(restTargetLabel(item.restTargetSeconds))", systemImage: "timer")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.accent)
            }

            setHeader

            ForEach(item.sets.indices, id: \.self) { setIndex in
                setRow(setIndex)
            }

            if !readOnly {
                Button {
                    addSet()
                } label: {
                    Label("Add Set", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(compact: true))
            }
        }
        .padding(16)
        .background(Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(isActiveExercise ? Theme.accent : Theme.border, lineWidth: isActiveExercise ? 2 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .shadow(color: .black.opacity(isActiveExercise ? 0.12 : 0.06), radius: isActiveExercise ? 10 : 4, x: 0, y: 2)
    }

    private var setHeader: some View {
        HStack(spacing: 8) {
            Text("Set")
                .frame(width: 36)
            Text("Reps")
                .frame(maxWidth: .infinity)
            if showWeight && (!readOnly || item.weightType != "none") {
                Text(item.weightType == "double" ? "2x Weight" : item.weightType == "none" ? "" : "Weight")
                    .frame(maxWidth: .infinity)
            }
            Text("Rest")
                .frame(width: 58, alignment: .trailing)
            if !readOnly && !planningMode {
                Text("Done")
                    .frame(width: 38)
            }
            if !readOnly { Color.clear.frame(width: 32) }
        }
        .font(.system(size: 10, weight: .heavy))
        .foregroundStyle(Theme.muted)
        .textCase(.uppercase)
    }

    @ViewBuilder
    private func setRow(_ setIndex: Int) -> some View {
        let active = isActiveExercise && activeSetIndex == setIndex
        HStack(spacing: 8) {
            Text("\(setIndex + 1)")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.muted)
                .frame(width: 36)

            TextField(
                planningMode && focusedField == .reps(itemIndex: itemIndex, setIndex: setIndex) ? "" : repsPlaceholder(for: setIndex),
                text: Binding(
                    get: { item.sets[setIndex].reps ?? "" },
                    set: { value in
                        item.sets[setIndex].reps = value
                        onChanged?()
                    }
                )
            )
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .disabled(readOnly)
            .focused($focusedField, equals: .reps(itemIndex: itemIndex, setIndex: setIndex))
            .fieldStyle()
            .background(active ? Theme.accent.opacity(0.08) : Color.clear)

            if showWeight && (!readOnly || item.weightType != "none") {
                if item.weightType != "none", !planningMode {
                    TextField(
                        item.sets[setIndex].placeholderWeight ?? "-",
                        text: Binding(
                            get: { item.sets[setIndex].weight ?? "" },
                            set: { value in
                                item.sets[setIndex].weight = value
                                onChanged?()
                            }
                        )
                    )
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .disabled(readOnly)
                    .focused($focusedField, equals: .weight(itemIndex: itemIndex, setIndex: setIndex))
                    .fieldStyle()
                    .background(active ? Theme.accent.opacity(0.08) : Color.clear)
                } else {
                    Color.clear.frame(maxWidth: .infinity)
                }
            }

            RestTimerText(set: item.sets[setIndex], targetSeconds: item.restTargetSeconds)
                .frame(width: 58, alignment: .trailing)

            if !readOnly && !planningMode {
                SetCompleteButton(
                    isComplete: setIsComplete(setIndex),
                    isEnabled: setCanComplete(setIndex)
                ) {
                    onSetCompleted?(itemIndex, setIndex)
                }
                .frame(width: 38)
            }

            if !readOnly {
                IconCircleButton(
                    systemName: "xmark",
                    tint: Theme.muted,
                    disabled: item.sets.count <= 1
                ) {
                    removeSet(setIndex)
                }
            }
        }
    }

    private func addSet() {
        let last = item.sets.last ?? WorkoutSet(reps: String(defaultReps), weight: "")
        item.sets.append(WorkoutSet(
            reps: last.reps ?? (planningMode ? "" : String(defaultReps)),
            weight: last.weight ?? "",
            placeholderReps: last.placeholderReps,
            placeholderWeight: last.placeholderWeight
        ))
        onChanged?()
    }

    private func repsPlaceholder(for setIndex: Int) -> String {
        if let placeholder = item.sets[setIndex].placeholderReps, !placeholder.isEmpty {
            return placeholder
        }
        return planningMode ? "Target" : "-"
    }

    private func setCanComplete(_ setIndex: Int) -> Bool {
        guard item.sets.indices.contains(setIndex),
              item.sets[setIndex].restStartTime == nil,
              item.sets[setIndex].restDuration == nil
        else { return false }
        if item.weightType == "none" {
            return !(item.sets[setIndex].reps ?? "").isEmpty
        }
        return !(item.sets[setIndex].weight ?? "").isEmpty
    }

    private func setIsComplete(_ setIndex: Int) -> Bool {
        guard item.sets.indices.contains(setIndex) else { return false }
        return item.sets[setIndex].restStartTime != nil || item.sets[setIndex].restDuration != nil
    }

    private func removeSet(_ index: Int) {
        guard item.sets.count > 1 else { return }
        item.sets.remove(at: index)
        onChanged?()
    }
}

private struct SetCompleteButton: View {
    let isComplete: Bool
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(isComplete ? Theme.success : Theme.muted)
                .frame(width: 30, height: 30)
                .background(isComplete ? Theme.success.opacity(0.1) : Theme.background)
                .overlay(Circle().stroke(isComplete ? Theme.success.opacity(0.55) : Theme.border, lineWidth: 1))
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled || isComplete ? 1 : 0.45)
        .accessibilityLabel(isComplete ? "Set complete" : "Complete set")
    }
}

private struct RestTimerText: View {
    let set: WorkoutSet
    var targetSeconds: Int?

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { _ in
            Text(restTimeText(startTime: set.restStartTime, duration: set.restDuration, targetSeconds: targetSeconds))
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundStyle(foregroundStyle)
        }
    }

    private var foregroundStyle: Color {
        guard set.restStartTime != nil || set.restDuration != nil else { return Theme.muted.opacity(0) }
        guard set.restDuration == nil,
              let targetSeconds,
              targetSeconds > 0,
              let startTime = set.restStartTime
        else { return Theme.success }
        let elapsed = max(0, Int((Date().timeIntervalSince1970 * 1000 - startTime) / 1000))
        return elapsed >= targetSeconds ? Theme.danger : Theme.accent
    }
}
