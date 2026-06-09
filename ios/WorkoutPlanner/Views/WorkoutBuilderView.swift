import SwiftUI

enum WorkoutBuilderFocusedField: Hashable {
    case reps(itemIndex: Int, setIndex: Int)
    case repsLeft(itemIndex: Int, setIndex: Int)
    case repsRight(itemIndex: Int, setIndex: Int)
    case weight(itemIndex: Int, setIndex: Int)
    case rpe(itemIndex: Int, setIndex: Int)
    case rir(itemIndex: Int, setIndex: Int)
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

private let setTypeOptions: [(label: String, value: String)] = [
    ("Working", "working"),
    ("Warmup", "warmup"),
    ("Drop", "drop"),
    ("Failure", "failure"),
]

private let supersetOptions: [(label: String, value: String?)] = [
    ("No pairing", nil),
    ("Superset A", "A"),
    ("Superset B", "B"),
    ("Superset C", "C"),
    ("Superset D", "D"),
]

struct WorkoutBuilderView: View {
    let exercises: [Exercise]
    @Binding var items: [ExerciseItem]
    @FocusState.Binding var focusedField: WorkoutBuilderFocusedField?
    var readOnly = false
    var showWeight = true
    var defaultSets = 4
    var defaultReps = 8
    var defaultRestTargetSeconds: Int?
    var activeExerciseIndex: Int?
    var activeSetIndex: Int?
    var planningMode = false
    var onSetCompleted: ((Int, Int) -> Void)?
    var onResetPersonalBest: ((Exercise) -> Void)?
    var onEditExercise: ((Exercise) -> Void)?
    var onChanged: (() -> Void)?
    var onTextChanged: (() -> Void)?
    var onEditingDone: (() -> Void)?
    @State private var exerciseSearch = ""

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
                        replacementExercises: replacementExercises(for: index),
                        canMoveUp: index > 0,
                        canMoveDown: index < items.count - 1,
                        defaultReps: exercise.defaultReps ?? defaultReps,
                        onMove: { direction in move(index, direction) },
                        onReplace: { replacement in replaceExercise(index, with: replacement) },
                        onRemove: { removeExercise(index) },
                        onSetCompleted: onSetCompleted,
                        onResetPersonalBest: onResetPersonalBest,
                        onEditExercise: onEditExercise,
                        onChanged: onChanged,
                        onTextChanged: onTextChanged,
                        onEditingDone: onEditingDone
                    )
                }
            }

            if !readOnly {
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                        TextField("Search exercises to add", text: $exerciseSearch)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.system(size: 15))
                        if !exerciseSearch.isEmpty {
                            Button {
                                exerciseSearch = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(Theme.muted)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear exercise search")
                        }
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 44)
                    .background(Theme.background)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                            .stroke(Theme.border, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))

                    Menu {
                        let available = availableExercises
                        if available.isEmpty {
                            Text(exerciseSearch.isEmpty ? "No more exercises available" : "No matching exercises")
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
                    .disabled(availableExercises.isEmpty)
                }
                .frame(maxWidth: .infinity)
            }

            if exercises.isEmpty && !readOnly {
                Text("No exercises configured yet. Add exercises from the Program + menu first.")
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
            .filter { exercise in
                exerciseSearch.isEmpty
                    || exercise.name.localizedCaseInsensitiveContains(exerciseSearch)
                    || exercise.muscleGroup.localizedCaseInsensitiveContains(exerciseSearch)
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func replacementExercises(for index: Int) -> [Exercise] {
        guard items.indices.contains(index) else { return [] }
        let currentId = items[index].exerciseId
        let used = Set(items.map(\.exerciseId))
        return exercises
            .filter { $0.id == currentId || !used.contains($0.id) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func exercise(for id: String) -> Exercise? {
        exercises.first { $0.id == id }
    }

    private func addExercise(_ exercise: Exercise) {
        let setCount = exercise.defaultSets ?? defaultSets
        let repCount = exercise.defaultReps ?? defaultReps
        let sets = (0..<setCount).map { _ in
            planningMode
                ? WorkoutSet(
                    reps: "",
                    repsLeft: exercise.isUnilateral == true ? "" : nil,
                    repsRight: exercise.isUnilateral == true ? "" : nil,
                    weight: "",
                    placeholderReps: String(repCount),
                    placeholderRepsLeft: exercise.isUnilateral == true ? String(repCount) : nil,
                    placeholderRepsRight: exercise.isUnilateral == true ? String(repCount) : nil
                )
                : WorkoutSet(
                    reps: String(repCount),
                    repsLeft: exercise.isUnilateral == true ? String(repCount) : nil,
                    repsRight: exercise.isUnilateral == true ? String(repCount) : nil,
                    weight: ""
                )
        }
        items.append(ExerciseItem(
            exerciseId: exercise.id,
            weightType: "weight",
            restTargetSeconds: (defaultRestTargetSeconds ?? 0) > 0 ? defaultRestTargetSeconds : nil,
            description: exercise.description ?? "",
            useIndividualReps: false,
            sets: sets
        ))
        exerciseSearch = ""
        onChanged?()
    }

    private func removeExercise(_ index: Int) {
        items.remove(at: index)
        onChanged?()
    }

    private func replaceExercise(_ index: Int, with exercise: Exercise) {
        guard items.indices.contains(index), items[index].exerciseId != exercise.id else { return }
        items[index].exerciseId = exercise.id
        if (items[index].description ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items[index].description = exercise.description ?? ""
        }
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
    let replacementExercises: [Exercise]
    let canMoveUp: Bool
    let canMoveDown: Bool
    let defaultReps: Int
    let onMove: (Int) -> Void
    let onReplace: (Exercise) -> Void
    let onRemove: () -> Void
    let onSetCompleted: ((Int, Int) -> Void)?
    let onResetPersonalBest: ((Exercise) -> Void)?
    let onEditExercise: ((Exercise) -> Void)?
    let onChanged: (() -> Void)?
    let onTextChanged: (() -> Void)?
    let onEditingDone: (() -> Void)?
    @FocusState private var focusedCompactField: CompactRepField?
    @FocusState private var notesFocused: Bool
    @State private var editedCompactFields: Set<CompactRepField> = []

    private let setColumnWidth: CGFloat = 28
    private let restColumnWidth: CGFloat = 54
    private let doneColumnWidth: CGFloat = 34
    private let removeColumnWidth: CGFloat = 32
    private let rowSpacing: CGFloat = 6
    private var showsWeightColumn: Bool {
        showWeight && item.weightType != "none" && !planningMode
    }
    private var canResetPersonalBest: Bool {
        !readOnly && !planningMode && exercise.personalBest != nil && onResetPersonalBest != nil
    }
    private var canEditExercise: Bool {
        !readOnly && planningMode && onEditExercise != nil
    }
    private var repUnitTitle: String {
        exercise.usesTime == true ? "Secs" : "Reps"
    }
    private var repUnit: String {
        exercise.usesTime == true ? "secs" : "reps"
    }
    private var sameTargetForEverySet: Binding<Bool> {
        Binding(
            get: { !(item.useIndividualReps ?? false) },
            set: { value in
                item.useIndividualReps = !value
                onChanged?()
            }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                headerContent(stacked: false)
                headerContent(stacked: true)
            }

            Divider()

            if showWeight && !readOnly {
                Picker("Weight type", selection: Binding(
                    get: { item.weightType ?? "weight" },
                    set: { item.weightType = $0; onChanged?() }
                )) {
                    Text("Weight").tag("weight")
                    Text("2x").tag("double")
                    Text("Bar + 2x").tag("bar_double")
                    Text("None").tag("none")
                }
                .pickerStyle(.segmented)
            }

            if !readOnly {
                ViewThatFits(in: .horizontal) {
                    controlRow
                    VStack(spacing: 8) {
                        restMenu
                        pairMenu
                    }
                }
            } else if item.restTargetSeconds ?? 0 > 0 {
                Label("Rest \(restTargetLabel(item.restTargetSeconds))", systemImage: "timer")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.accent)
            }

            if !readOnly || (item.description?.isEmpty == false) {
                TextField("Exercise notes, cues, or substitution reason", text: Binding(
                    get: { item.description ?? "" },
                    set: { value in
                        item.description = value
                        onTextChanged?()
                    }
                ), axis: .vertical)
                .lineLimit(1...3)
                .focused($notesFocused)
                .fieldStyle()
                .disabled(readOnly)
            }

            if planningMode && !readOnly {
                Toggle("Same \(repUnit) target for every set", isOn: sameTargetForEverySet)
                    .font(.system(size: 13, weight: .semibold))
                    .tint(Theme.accent)
            }

            if readOnly, item.supersetGroup?.isEmpty == false {
                Label(supersetLabel(item.supersetGroup), systemImage: "link")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.success)
            }

            if planningMode && !(item.useIndividualReps ?? false) {
                compactTargetControls
            } else {
                setHeader

                ForEach(item.sets.indices, id: \.self) { setIndex in
                    setRow(setIndex)
                }
            }

            if !readOnly && (!planningMode || (item.useIndividualReps ?? false)) {
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
                .stroke(cardStrokeColor, lineWidth: isActiveExercise ? 2 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .shadow(color: .black.opacity(isActiveExercise ? 0.12 : 0.06), radius: isActiveExercise ? 10 : 4, x: 0, y: 2)
        .toolbar {
            if focusedCompactField != nil || notesFocused {
                ToolbarItem(placement: .keyboard) {
                    KeyboardDoneToolbar {
                        focusedCompactField = nil
                        notesFocused = false
                        focusedField = nil
                    }
                }
            }
        }
        .onChange(of: focusedCompactField) { oldValue, newValue in
            if oldValue != nil, newValue != oldValue {
                onEditingDone?()
            }
        }
        .onChange(of: notesFocused) { oldValue, newValue in
            if oldValue && !newValue {
                onEditingDone?()
            }
        }
    }

    private func headerContent(stacked: Bool) -> some View {
        Group {
            if stacked {
                VStack(alignment: .leading, spacing: 10) {
                    exerciseTitle
                    headerButtons
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    exerciseTitle
                    Spacer(minLength: 8)
                    headerButtons
                }
            }
        }
    }

    private var exerciseTitle: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(exercise.name)
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Theme.text)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                Badge(text: exercise.muscleGroup)
            }
            if let pb = personalBestLabel(exercise.personalBest, usesTime: exercise.usesTime == true) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("PB: \(pb)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    if canResetPersonalBest {
                        Button(role: .destructive) {
                            onResetPersonalBest?(exercise)
                        } label: {
                            Label("Reset PB", systemImage: "arrow.counterclockwise")
                                .labelStyle(.titleAndIcon)
                                .font(.system(size: 12, weight: .bold))
                                .lineLimit(1)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.danger)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .layoutPriority(1)
    }

    @ViewBuilder
    private var headerButtons: some View {
        if !readOnly {
            HStack(spacing: 6) {
                if canEditExercise {
                    Button {
                        onEditExercise?(exercise)
                    } label: {
                        Label("Edit", systemImage: "pencil")
                            .labelStyle(.titleAndIcon)
                            .font(.system(size: 12, weight: .bold))
                            .lineLimit(1)
                    }
                    .buttonStyle(SecondaryButtonStyle(compact: true))
                    .fixedSize(horizontal: true, vertical: false)
                }
                IconCircleButton(systemName: "arrow.up", disabled: !canMoveUp) { onMove(-1) }
                IconCircleButton(systemName: "arrow.down", disabled: !canMoveDown) { onMove(1) }
                IconCircleButton(systemName: "xmark", tint: Theme.danger, action: onRemove)
            }
            .fixedSize(horizontal: true, vertical: false)
        }
    }

    private var controlRow: some View {
        HStack(spacing: 8) {
            substitutionMenu
            restMenu
            pairMenu
        }
    }

    private var substitutionMenu: some View {
        Menu {
            ForEach(replacementExercises) { replacement in
                Button("\(replacement.name) (\(replacement.muscleGroup))") {
                    onReplace(replacement)
                }
            }
        } label: {
            Label("Sub \(exercise.name)", systemImage: "arrow.triangle.2.circlepath")
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(SecondaryButtonStyle(compact: true))
        .frame(maxWidth: .infinity)
        .disabled(replacementExercises.count <= 1)
    }

    private var restMenu: some View {
        Menu {
            ForEach(restTargetOptions, id: \.label) { option in
                Button(option.label) {
                    item.restTargetSeconds = option.seconds
                    onChanged?()
                }
            }
        } label: {
            Label("Rest \(restTargetLabel(item.restTargetSeconds))", systemImage: "timer")
                .lineLimit(1)
                .minimumScaleFactor(0.82)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(SecondaryButtonStyle(compact: true))
        .frame(maxWidth: .infinity)
    }

    private var pairMenu: some View {
        Menu {
            ForEach(supersetOptions, id: \.label) { option in
                Button(option.label) {
                    item.supersetGroup = option.value
                    onChanged?()
                }
            }
        } label: {
            Label("Pair \(supersetLabel(item.supersetGroup))", systemImage: "link")
                .lineLimit(1)
                .minimumScaleFactor(0.82)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(SecondaryButtonStyle(compact: true))
        .frame(maxWidth: .infinity)
    }

    private var cardStrokeColor: Color {
        if isActiveExercise { return Theme.accent }
        if item.supersetGroup?.isEmpty == false { return Theme.success.opacity(0.55) }
        return Theme.border
    }

    private var setHeader: some View {
        HStack(spacing: rowSpacing) {
            Text("Set")
                .frame(width: setColumnWidth)
            Text(exercise.isUnilateral == true ? "\(repUnitTitle) L/R" : repUnitTitle)
                .frame(maxWidth: .infinity)
            if showsWeightColumn {
                Text(weightHeaderLabel)
                    .frame(maxWidth: .infinity)
            }
            Text("Rest")
                .frame(width: restColumnWidth, alignment: .trailing)
            if !readOnly && !planningMode {
                Text("Done")
                    .frame(width: doneColumnWidth)
            }
            if !readOnly { Color.clear.frame(width: removeColumnWidth) }
        }
        .font(.system(size: 10, weight: .heavy))
        .foregroundStyle(Theme.muted)
        .textCase(.uppercase)
    }

    private var weightHeaderLabel: String {
        switch item.weightType {
        case "double": return "2x Weight"
        case "bar_double": return "Bar + 2x"
        case "none": return ""
        default: return "Weight"
        }
    }

    private var compactTargetControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Use \(repUnit) range", isOn: Binding(
                get: { compactUsesRange },
                set: { setCompactRangeMode($0) }
            ))
            .font(.system(size: 13, weight: .semibold))
            .tint(Theme.accent)

            if exercise.isUnilateral == true {
                if compactUsesRange {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        compactField("Left min", field: .left, value: rangeBinding(field: .left, side: .min))
                        compactField("Left max", field: .left, value: rangeBinding(field: .left, side: .max))
                        compactField("Right min", field: .right, value: rangeBinding(field: .right, side: .min))
                        compactField("Right max", field: .right, value: rangeBinding(field: .right, side: .max))
                    }
                } else {
                    HStack(spacing: 8) {
                        compactField("Left \(repUnit)", field: .left, value: compactBinding(field: .left))
                        compactField("Right \(repUnit)", field: .right, value: compactBinding(field: .right))
                    }
                }
            } else if compactUsesRange {
                HStack(spacing: 8) {
                    compactField("Min \(repUnit)", field: .reps, value: rangeBinding(field: .reps, side: .min))
                    compactField("Max \(repUnit)", field: .reps, value: rangeBinding(field: .reps, side: .max))
                }
            } else {
                compactField("\(repUnitTitle) for all sets", field: .reps, value: compactBinding(field: .reps))
            }

            HStack(spacing: 8) {
                Text("\(item.sets.count) \(item.sets.count == 1 ? "set" : "sets")")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.muted)
                Spacer()
                Button {
                    addSet()
                } label: {
                    Label("Add Set", systemImage: "plus")
                }
                .buttonStyle(SecondaryButtonStyle(compact: true))
                Button(role: .destructive) {
                    removeSet(item.sets.count - 1)
                } label: {
                    Label("Remove", systemImage: "xmark")
                }
                .buttonStyle(SecondaryButtonStyle(compact: true))
                .disabled(item.sets.count <= 1)
            }
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private enum CompactRepField: Hashable {
        case reps
        case left
        case right
    }

    private enum CompactRangeSide {
        case min
        case max
    }

    private var compactUsesRange: Bool {
        if exercise.isUnilateral == true {
            return repRange(compactValue(field: .left)) != nil || repRange(compactValue(field: .right)) != nil
        }
        return repRange(compactValue(field: .reps)) != nil
    }

    private func compactField(_ label: String, field: CompactRepField, value: Binding<String>) -> some View {
        let placeholder = compactPlaceholder(field: field)
        let isFocused = focusedCompactField == field

        return VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
            ZStack {
                if value.wrappedValue.isEmpty, !isFocused {
                    if let placeholder {
                        RepsFieldPlaceholderView(value: placeholder)
                            .padding(.horizontal, 4)
                            .frame(maxWidth: .infinity)
                            .allowsHitTesting(false)
                    } else {
                        Text(compactValue(field: field))
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.muted.opacity(0.58))
                            .lineLimit(1)
                            .minimumScaleFactor(0.68)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 4)
                            .frame(maxWidth: .infinity)
                            .allowsHitTesting(false)
                    }
                }

                TextField("", text: value)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .focused($focusedCompactField, equals: field)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .frame(height: 40)
            }
            .background(Theme.background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        }
        .frame(maxWidth: .infinity)
    }

    private func compactBinding(field: CompactRepField) -> Binding<String> {
        Binding(
            get: { compactTextValue(field: field) },
            set: {
                editedCompactFields.insert(field)
                updateAllCompactValues(field: field, value: $0)
                onTextChanged?()
            }
        )
    }

    private func rangeBinding(field: CompactRepField, side: CompactRangeSide) -> Binding<String> {
        Binding(
            get: {
                let value = compactValue(field: field)
                let range = repRange(value)
                return side == .min ? (range?.min ?? value) : (range?.max ?? "")
            },
            set: { value in
                let current = compactValue(field: field)
                let range = repRange(current)
                let next = repRangeValue(
                    min: side == .min ? value : (range?.min ?? current),
                    max: side == .max ? value : (range?.max ?? "")
                )
                updateAllCompactValues(field: field, value: next)
                onTextChanged?()
            }
        )
    }

    private func compactValue(field: CompactRepField) -> String {
        guard let first = item.sets.first else { return "" }
        switch field {
        case .reps:
            return first.placeholderReps ?? first.reps ?? ""
        case .left:
            return first.placeholderRepsLeft ?? first.repsLeft ?? first.placeholderReps ?? first.reps ?? ""
        case .right:
            return first.placeholderRepsRight ?? first.repsRight ?? first.placeholderReps ?? first.reps ?? ""
        }
    }

    private func compactTextValue(field: CompactRepField) -> String {
        let value = compactValue(field: field)
        guard RepsFieldPlaceholder(rawValue: value) != nil, !editedCompactFields.contains(field) else {
            return value
        }
        return ""
    }

    private func compactPlaceholder(field: CompactRepField) -> RepsFieldPlaceholder? {
        RepsFieldPlaceholder(rawValue: compactValue(field: field))
    }

    private func updateAllCompactValues(field: CompactRepField, value: String) {
        for index in item.sets.indices {
            switch field {
            case .reps:
                item.sets[index].placeholderReps = value
            case .left:
                item.sets[index].placeholderRepsLeft = value
            case .right:
                item.sets[index].placeholderRepsRight = value
            }
        }
    }

    private func setCompactRangeMode(_ enabled: Bool) {
        let fields: [CompactRepField] = exercise.isUnilateral == true ? [.left, .right] : [.reps]
        for field in fields {
            let current = compactValue(field: field)
            let range = repRange(current)
            updateAllCompactValues(
                field: field,
                value: enabled
                    ? repRangeValue(min: range?.min ?? current, max: range?.max ?? current)
                    : (range?.min ?? current)
            )
        }
        onChanged?()
    }

    @ViewBuilder
    private func setRow(_ setIndex: Int) -> some View {
        let active = isActiveExercise && activeSetIndex == setIndex
        VStack(spacing: 6) {
            HStack(spacing: rowSpacing) {
                Text("\(setIndex + 1)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: setColumnWidth)

                if exercise.isUnilateral == true {
                    HStack(spacing: 4) {
                        SetNumericField(
                            placeholder: sideRepsPlaceholderForField(setIndex, side: .left),
                            text: Binding(
                                get: { item.sets[setIndex].repsLeft ?? "" },
                                set: { value in
                                    item.sets[setIndex].repsLeft = value
                                    onTextChanged?()
                                }
                            ),
                            keyboard: .numberPad,
                            focus: .repsLeft(itemIndex: itemIndex, setIndex: setIndex),
                            focusedField: $focusedField,
                            isActive: active,
                            isDisabled: readOnly,
                            placeholderRole: .reps
                        )
                        SetNumericField(
                            placeholder: sideRepsPlaceholderForField(setIndex, side: .right),
                            text: Binding(
                                get: { item.sets[setIndex].repsRight ?? "" },
                                set: { value in
                                    item.sets[setIndex].repsRight = value
                                    onTextChanged?()
                                }
                            ),
                            keyboard: .numberPad,
                            focus: .repsRight(itemIndex: itemIndex, setIndex: setIndex),
                            focusedField: $focusedField,
                            isActive: active,
                            isDisabled: readOnly,
                            placeholderRole: .reps
                        )
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    SetNumericField(
                        placeholder: repsPlaceholderForField(setIndex),
                        text: Binding(
                            get: { item.sets[setIndex].reps ?? "" },
                            set: { value in
                                item.sets[setIndex].reps = value
                                onTextChanged?()
                            }
                        ),
                        keyboard: .numberPad,
                        focus: .reps(itemIndex: itemIndex, setIndex: setIndex),
                        focusedField: $focusedField,
                        isActive: active,
                        isDisabled: readOnly,
                        placeholderRole: .reps
                    )
                }

                if showsWeightColumn {
                    SetNumericField(
                        placeholder: item.sets[setIndex].placeholderWeight ?? "-",
                        text: Binding(
                            get: { item.sets[setIndex].weight ?? "" },
                            set: { value in
                                item.sets[setIndex].weight = value
                                onTextChanged?()
                            }
                        ),
                        keyboard: .decimalPad,
                        focus: .weight(itemIndex: itemIndex, setIndex: setIndex),
                        focusedField: $focusedField,
                        isActive: active,
                        isDisabled: readOnly
                    )
                    .frame(maxWidth: .infinity)
                }

                RestTimerText(set: item.sets[setIndex], targetSeconds: item.sets[setIndex].restTargetSeconds ?? item.restTargetSeconds)
                    .frame(width: restColumnWidth, alignment: .trailing)

                if !readOnly && !planningMode {
                    SetCompleteButton(
                        isComplete: setIsComplete(setIndex),
                        isEnabled: setCanComplete(setIndex)
                    ) {
                        onSetCompleted?(itemIndex, setIndex)
                    }
                    .frame(width: doneColumnWidth)
                }

                if !readOnly {
                    IconCircleButton(
                        systemName: "xmark",
                        tint: Theme.muted,
                        disabled: item.sets.count <= 1
                    ) {
                        removeSet(setIndex)
                    }
                    .frame(width: removeColumnWidth)
                }
            }

            if !readOnly && !planningMode {
                HStack(spacing: rowSpacing) {
                    Color.clear.frame(width: setColumnWidth)
                    Menu {
                        ForEach(setTypeOptions, id: \.value) { option in
                            Button(option.label) {
                                item.sets[setIndex].setType = option.value
                                onChanged?()
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text("Type")
                                .font(.system(size: 10, weight: .heavy))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                            Text(setTypeLabel(item.sets[setIndex].setType))
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 10)
                        .frame(height: 34)
                        .background(Theme.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                                .stroke(Theme.border, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .frame(minWidth: 116, maxWidth: .infinity)
                    effortField(
                        label: "RPE",
                        value: Binding(
                            get: { item.sets[setIndex].rpe ?? "" },
                            set: { item.sets[setIndex].rpe = $0; onTextChanged?() }
                        ),
                        focus: .rpe(itemIndex: itemIndex, setIndex: setIndex),
                        keyboard: .decimalPad
                    )
                    effortField(
                        label: "RIR",
                        value: Binding(
                            get: { item.sets[setIndex].rir ?? "" },
                            set: { item.sets[setIndex].rir = $0; onTextChanged?() }
                        ),
                        focus: .rir(itemIndex: itemIndex, setIndex: setIndex),
                        keyboard: .numberPad
                    )
                }
            }
        }
    }

    private func effortField(
        label: String,
        value: Binding<String>,
        focus: WorkoutBuilderFocusedField,
        keyboard: UIKeyboardType
    ) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            TextField("-", text: value)
                .keyboardType(keyboard)
                .multilineTextAlignment(.center)
                .focused($focusedField, equals: focus)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.text)
                .frame(width: 26)
        }
        .padding(.horizontal, 8)
        .frame(width: 74, height: 34)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private func addSet() {
        let last = item.sets.last ?? WorkoutSet(reps: String(defaultReps), weight: "")
        item.sets.append(WorkoutSet(
            reps: last.reps ?? (planningMode ? "" : String(defaultReps)),
            repsLeft: last.repsLeft,
            repsRight: last.repsRight,
            weight: last.weight ?? "",
            placeholderReps: last.placeholderReps,
            placeholderRepsLeft: last.placeholderRepsLeft,
            placeholderRepsRight: last.placeholderRepsRight,
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

    private func repsPlaceholderForField(_ setIndex: Int) -> String {
        let placeholder = repsPlaceholder(for: setIndex)
        let isFocused = focusedField == .reps(itemIndex: itemIndex, setIndex: setIndex)
        guard planningMode, isFocused else { return placeholder }

        if RepsFieldPlaceholder(rawValue: placeholder)?.last != nil {
            return placeholder
        }
        return ""
    }

    private enum RepSide {
        case left
        case right
    }

    private func sideRepsPlaceholderForField(_ setIndex: Int, side: RepSide) -> String {
        let set = item.sets[setIndex]
        let placeholder: String
        switch side {
        case .left:
            placeholder = set.placeholderRepsLeft?.isEmpty == false ? (set.placeholderRepsLeft ?? "") : "L"
        case .right:
            placeholder = set.placeholderRepsRight?.isEmpty == false ? (set.placeholderRepsRight ?? "") : "R"
        }
        let isFocused: Bool
        switch side {
        case .left:
            isFocused = focusedField == .repsLeft(itemIndex: itemIndex, setIndex: setIndex)
        case .right:
            isFocused = focusedField == .repsRight(itemIndex: itemIndex, setIndex: setIndex)
        }
        guard planningMode, isFocused else { return placeholder }
        return RepsFieldPlaceholder(rawValue: placeholder)?.last == nil ? "" : placeholder
    }

    private func setCanComplete(_ setIndex: Int) -> Bool {
        guard item.sets.indices.contains(setIndex),
              item.sets[setIndex].restStartTime == nil,
              item.sets[setIndex].restDuration == nil
        else { return false }
        if item.weightType == "none" {
            return !(item.sets[setIndex].reps ?? "").isEmpty
                || !(item.sets[setIndex].repsLeft ?? "").isEmpty
                || !(item.sets[setIndex].repsRight ?? "").isEmpty
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

private enum SetNumericFieldPlaceholderRole: Equatable {
    case plain
    case reps
}

private struct CompactRepRange {
    let min: String
    let max: String
}

private func repRange(_ value: String) -> CompactRepRange? {
    let parts = value
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .split(maxSplits: 1, whereSeparator: { $0 == "-" || $0 == "–" })
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
    guard parts.count == 2, !parts[0].isEmpty || !parts[1].isEmpty else { return nil }
    return CompactRepRange(min: parts[0], max: parts[1])
}

private func repRangeValue(min: String, max: String) -> String {
    let cleanMin = min.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanMax = max.trimmingCharacters(in: .whitespacesAndNewlines)
    if !cleanMin.isEmpty, !cleanMax.isEmpty { return "\(cleanMin)-\(cleanMax)" }
    return cleanMin.isEmpty ? cleanMax : cleanMin
}

private struct SetNumericField: View {
    let placeholder: String
    let text: Binding<String>
    let keyboard: UIKeyboardType
    let focus: WorkoutBuilderFocusedField
    @FocusState.Binding var focusedField: WorkoutBuilderFocusedField?
    let isActive: Bool
    let isDisabled: Bool
    var placeholderRole: SetNumericFieldPlaceholderRole = .plain

    var body: some View {
        ZStack {
            if let repsContext {
                RepsFieldPlaceholderView(value: repsContext)
                    .padding(.horizontal, 4)
                    .frame(maxWidth: .infinity)
                    .allowsHitTesting(false)
            } else if text.wrappedValue.isEmpty, !placeholder.isEmpty {
                Text(placeholder)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.muted.opacity(0.58))
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 4)
                    .frame(maxWidth: .infinity)
                    .allowsHitTesting(false)
            }

            TextField("", text: text)
                .keyboardType(keyboard)
                .multilineTextAlignment(.center)
                .focused($focusedField, equals: focus)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(repsContext == nil ? (isDisabled ? Theme.muted : Theme.text) : .clear)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(isDisabled)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(isActive ? Theme.accent.opacity(0.08) : Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private var repsContext: RepsFieldPlaceholder? {
        guard placeholderRole == .reps,
              let placeholderValue = RepsFieldPlaceholder(rawValue: placeholder)
        else { return nil }

        let enteredGoal = text.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return enteredGoal.isEmpty ? placeholderValue : nil
    }
}

struct RepsFieldPlaceholder {
    let last: String?
    let goal: String?

    init(last: String?, goal: String?) {
        self.last = Self.cleaned(last)
        self.goal = Self.cleaned(goal)
    }

    init?(rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
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

    func rawValue(usingGoal goalOverride: String? = nil) -> String? {
        let resolvedGoal = Self.cleaned(goalOverride) ?? goal
        guard last != nil || resolvedGoal != nil else { return nil }
        if let last {
            guard let resolvedGoal else { return last }
            return "\(last) (\(resolvedGoal))"
        }
        return resolvedGoal
    }

    private static func cleaned(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct RepsFieldPlaceholderView: View {
    let value: RepsFieldPlaceholder

    var body: some View {
        VStack(spacing: 1) {
            if let last = value.last {
                placeholderLine(label: "Last", value: last)
            }
            if let goal = value.goal {
                placeholderLine(label: "Goal", value: goal)
            }
        }
        .foregroundStyle(Theme.muted.opacity(0.62))
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .multilineTextAlignment(.center)
    }

    private func placeholderLine(label: String, value: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .heavy))
                .textCase(.uppercase)
            Text(value)
                .font(.system(size: 13, weight: .semibold))
        }
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
