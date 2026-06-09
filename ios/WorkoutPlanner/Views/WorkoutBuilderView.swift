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
    @State private var showingExercisePicker = false

    var body: some View {
        VStack(spacing: 16) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if let exercise = exercise(for: item.exerciseId) {
                    ExerciseSetsCard(
                        exercise: exercise,
                        item: bindingForItem(at: index, fallback: item),
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
                addExercisePanel
            }

            if exercises.isEmpty && !readOnly {
                Text("No exercises configured yet. Add exercises from the Program + menu first.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .sheet(isPresented: $showingExercisePicker) {
            ExercisePickerSheet(exercises: availableExercises, muscleGroups: exerciseMuscleGroups) { exercise in
                addExercise(exercise)
            }
        }
    }

    private var addExercisePanel: some View {
        VStack(alignment: .leading, spacing: items.isEmpty ? 10 : 8) {
            if items.isEmpty && !exercises.isEmpty {
                HStack(spacing: 12) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 28, height: 28)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("No exercises yet")
                            .font(.system(size: 16, weight: .heavy))
                            .foregroundStyle(Theme.text)
                    }
                }
            }

            addExerciseButton
        }
        .padding(items.isEmpty ? 12 : 0)
        .frame(maxWidth: .infinity)
        .background(items.isEmpty ? Theme.surface : Color.clear)
        .overlay {
            if items.isEmpty {
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private var addExerciseButton: some View {
        Button {
            showingExercisePicker = true
        } label: {
            Label("Add Exercise", systemImage: "plus")
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(items.isEmpty ? Color.white : Theme.text)
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(items.isEmpty ? Theme.accent : Theme.background)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                        .stroke(items.isEmpty ? Theme.accent : Theme.border, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .opacity(availableExercises.isEmpty ? 0.55 : 1)
        }
        .buttonStyle(.plain)
        .disabled(availableExercises.isEmpty)
    }

    private var availableExercises: [Exercise] {
        let used = Set(items.map(\.exerciseId))
        return exercises
            .filter { !used.contains($0.id) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var exerciseMuscleGroups: [String] {
        Array(Set(exercises.map { displayMuscleGroup($0.muscleGroup) }))
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
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

    private func bindingForItem(at index: Int, fallback: ExerciseItem) -> Binding<ExerciseItem> {
        Binding(
            get: {
                guard items.indices.contains(index), items[index].exerciseId == fallback.exerciseId else {
                    return fallback
                }
                return items[index]
            },
            set: { value in
                guard items.indices.contains(index), items[index].exerciseId == fallback.exerciseId else { return }
                items[index] = value
            }
        )
    }

    private func addExercise(_ exercise: Exercise) {
        let setCount = exercise.defaultSets ?? defaultSets
        let repCount = exercise.defaultReps ?? defaultReps
        let sets = (0..<setCount).map { _ in
            planningMode
                ? WorkoutSet(
                    reps: "",
                    weight: "",
                    placeholderReps: String(repCount)
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

private struct ExercisePickerSheet: View {
    let exercises: [Exercise]
    let muscleGroups: [String]
    let onSelect: (Exercise) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var selectedMuscleGroup: String?

    private var filteredExercises: [Exercise] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return exercises.filter { exercise in
            let muscleGroup = displayMuscleGroup(exercise.muscleGroup)
            let matchesMuscleGroup = selectedMuscleGroup == nil || selectedMuscleGroup == muscleGroup
            let matchesSearch = query.isEmpty
                || exercise.name.localizedCaseInsensitiveContains(query)
                || muscleGroup.localizedCaseInsensitiveContains(query)
                || (exercise.description ?? "").localizedCaseInsensitiveContains(query)
            return matchesMuscleGroup && matchesSearch
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 8) {
                searchField
                    .padding(.horizontal, 14)

                muscleGroupFilter

                if filteredExercises.isEmpty {
                    EmptyState(icon: "magnifyingglass", text: "No matching exercises")
                        .padding(.horizontal, 14)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 6) {
                            ForEach(filteredExercises) { exercise in
                                Button {
                                    onSelect(exercise)
                                    dismiss()
                                } label: {
                                    ExercisePickerRow(exercise: exercise)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.bottom, 16)
                    }
                }
            }
            .padding(.top, 8)
            .background(Theme.background)
            .navigationTitle("Add Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.muted)

            TextField("Search exercises or muscle groups", text: $searchText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 14))

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear exercise search")
            }
        }
        .padding(.horizontal, 10)
        .frame(height: 38)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private var muscleGroupFilter: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            HStack(spacing: 8) {
                FilterChip(title: "All", isSelected: selectedMuscleGroup == nil) {
                    selectedMuscleGroup = nil
                }

                ForEach(muscleGroups, id: \.self) { muscleGroup in
                    FilterChip(title: muscleGroup, isSelected: selectedMuscleGroup == muscleGroup) {
                        selectedMuscleGroup = muscleGroup
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 2)
        }
    }
}

private struct ExercisePickerRow: View {
    let exercise: Exercise

    var body: some View {
        HStack(spacing: 12) {
            Text(exercise.name)
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.82)

            Badge(text: displayMuscleGroup(exercise.muscleGroup))

            if let description = cleanedDescription {
                Text(description)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .frame(maxWidth: 88, alignment: .leading)
            }

            Spacer(minLength: 4)

            Image(systemName: "plus.circle.fill")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.accent)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private var cleanedDescription: String? {
        let value = exercise.description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : value
    }
}

private struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(isSelected ? Color.white : Theme.text)
                .lineLimit(1)
                .padding(.horizontal, 10)
                .frame(height: 30)
                .background(isSelected ? Theme.accent : Theme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                        .stroke(isSelected ? Theme.accent : Theme.border, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private func displayMuscleGroup(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "Other" : trimmed
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
    private var usesSideReps: Bool {
        exercise.isUnilateral == true && !planningMode
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
            cardHeader

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
                controlMenus
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

    private var cardHeader: some View {
        HStack(alignment: .top, spacing: 10) {
            exerciseTitle
            headerButtons
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
            HStack(spacing: 5) {
                if canEditExercise {
                    Button {
                        onEditExercise?(exercise)
                    } label: {
                        Image(systemName: "pencil")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.text)
                            .frame(width: 26, height: 26)
                            .background(Theme.background)
                            .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
                IconCircleButton(systemName: "arrow.up", disabled: !canMoveUp, size: 26, iconSize: 11) { onMove(-1) }
                IconCircleButton(systemName: "arrow.down", disabled: !canMoveDown, size: 26, iconSize: 11) { onMove(1) }
                IconCircleButton(systemName: "xmark", tint: Theme.danger, size: 26, iconSize: 11, action: onRemove)
            }
            .fixedSize(horizontal: true, vertical: false)
        }
    }

    @ViewBuilder
    private var controlMenus: some View {
        VStack(spacing: 8) {
            if replacementExercises.count > 1 {
                substitutionMenu
            }
            HStack(spacing: 8) {
                restMenu
                pairMenu
            }
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
        .buttonStyle(ExerciseCardMenuButtonStyle())
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
                .minimumScaleFactor(0.76)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(ExerciseCardMenuButtonStyle())
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
                .minimumScaleFactor(0.76)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(ExerciseCardMenuButtonStyle())
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
            Text(usesSideReps ? "\(repUnitTitle) L/R" : repUnitTitle)
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
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text("Shared target")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)

                Spacer()

                HStack(spacing: 0) {
                    Text("Range")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .padding(.trailing, 16)

                    Toggle("", isOn: Binding(
                        get: { compactUsesRange },
                        set: { setCompactRangeMode($0) }
                    ))
                    .labelsHidden()
                    .tint(Theme.accent)
                    .scaleEffect(0.82)
                    .frame(width: 48, height: 28, alignment: .trailing)
                }
                .fixedSize(horizontal: true, vertical: false)
            }

            if compactUsesRange {
                HStack(spacing: 8) {
                    compactField(
                        "Min \(repUnit)",
                        field: .repsMin,
                        value: rangeBinding(field: .reps, side: .min),
                        placeholder: rangePlaceholder(field: .reps, side: .min),
                        useFallbackPlaceholder: false
                    )
                    compactField(
                        "Max \(repUnit)",
                        field: .repsMax,
                        value: rangeBinding(field: .reps, side: .max),
                        placeholder: rangePlaceholder(field: .reps, side: .max),
                        useFallbackPlaceholder: false
                    )
                }
            } else {
                compactField("All sets", field: .reps, value: compactBinding(field: .reps))
            }

            HStack(spacing: 8) {
                Text("\(item.sets.count) \(item.sets.count == 1 ? "set" : "sets")")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.muted)
                Spacer()
                Button {
                    addSet()
                } label: {
                    Label("Add", systemImage: "plus")
                }
                .buttonStyle(CompactTargetButtonStyle())
                Button(role: .destructive) {
                    removeSet(item.sets.count - 1)
                } label: {
                    Label("Remove", systemImage: "xmark")
                }
                .buttonStyle(CompactTargetButtonStyle())
                .disabled(item.sets.count <= 1)
            }
        }
        .padding(10)
        .background(Theme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }

    private enum CompactRepField: Hashable {
        case reps
        case repsMin
        case repsMax
        case left
        case right
    }

    private enum CompactRangeSide {
        case min
        case max
    }

    private var compactUsesRange: Bool {
        return repRange(compactValue(field: .reps)) != nil
    }

    private func compactField(
        _ label: String,
        field: CompactRepField,
        value: Binding<String>,
        placeholder providedPlaceholder: RepsFieldPlaceholder? = nil,
        useFallbackPlaceholder: Bool = true
    ) -> some View {
        let placeholder = providedPlaceholder ?? (useFallbackPlaceholder ? compactPlaceholder(field: field) : nil)
        let isFocused = focusedCompactField == field

        return VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .heavy))
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
            ZStack {
                if value.wrappedValue.isEmpty, !isFocused {
                    if let placeholder {
                        RepsFieldPlaceholderView(value: placeholder)
                            .padding(.horizontal, 4)
                            .frame(maxWidth: .infinity)
                            .allowsHitTesting(false)
                    } else if useFallbackPlaceholder {
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
                    .frame(height: 36)
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
                let sideValue = side == .min ? (range?.min ?? value) : (range?.max ?? "")
                let focusField = compactRangeFocusField(side)
                if RepsFieldPlaceholder(rawValue: sideValue) != nil, !editedCompactFields.contains(focusField) {
                    return ""
                }
                return sideValue
            },
            set: { value in
                editedCompactFields.insert(compactRangeFocusField(side))
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
        case .reps, .repsMin, .repsMax:
            if let placeholderReps = first.placeholderReps {
                return placeholderReps
            }
            return firstFilled([
                first.placeholderRepsLeft,
                first.repsLeft,
                first.placeholderRepsRight,
                first.repsRight,
                first.reps
            ]) ?? ""
        case .left:
            return first.placeholderRepsLeft ?? first.repsLeft ?? first.placeholderReps ?? first.reps ?? ""
        case .right:
            return first.placeholderRepsRight ?? first.repsRight ?? first.placeholderReps ?? first.reps ?? ""
        }
    }

    private func firstFilled(_ values: [String?]) -> String? {
        values
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    private func sharedRepsValue(for setIndex: Int) -> String {
        guard item.sets.indices.contains(setIndex) else { return "" }
        let set = item.sets[setIndex]
        guard planningMode else { return set.reps ?? "" }
        if let placeholderReps = set.placeholderReps {
            return placeholderReps
        }
        return firstFilled([
            set.placeholderRepsLeft,
            set.repsLeft,
            set.placeholderRepsRight,
            set.repsRight,
            set.reps
        ]) ?? ""
    }

    private func updateSharedRepsValue(_ value: String, for setIndex: Int) {
        guard item.sets.indices.contains(setIndex) else { return }
        if planningMode {
            item.sets[setIndex].placeholderReps = value
            item.sets[setIndex].reps = nil
            item.sets[setIndex].repsLeft = nil
            item.sets[setIndex].repsRight = nil
            item.sets[setIndex].placeholderRepsLeft = nil
            item.sets[setIndex].placeholderRepsRight = nil
        } else {
            item.sets[setIndex].reps = value
        }
        onTextChanged?()
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

    private func rangePlaceholder(field: CompactRepField, side: CompactRangeSide) -> RepsFieldPlaceholder? {
        let value = compactValue(field: field)
        let range = repRange(value)
        let sideValue = side == .min ? (range?.min ?? value) : (range?.max ?? "")
        return RepsFieldPlaceholder(rawValue: sideValue)
    }

    private func compactRangeFocusField(_ side: CompactRangeSide) -> CompactRepField {
        side == .min ? .repsMin : .repsMax
    }

    private func updateAllCompactValues(field: CompactRepField, value: String) {
        for index in item.sets.indices {
            switch field {
            case .reps, .repsMin, .repsMax:
                item.sets[index].placeholderReps = value
                item.sets[index].reps = nil
                item.sets[index].repsLeft = nil
                item.sets[index].repsRight = nil
                item.sets[index].placeholderRepsLeft = nil
                item.sets[index].placeholderRepsRight = nil
            case .left:
                item.sets[index].placeholderRepsLeft = value
            case .right:
                item.sets[index].placeholderRepsRight = value
            }
        }
    }

    private func setCompactRangeMode(_ enabled: Bool) {
        let fields: [CompactRepField] = [.reps]
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

                if usesSideReps {
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
                            get: { sharedRepsValue(for: setIndex) },
                            set: { value in
                                updateSharedRepsValue(value, for: setIndex)
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
            repsLeft: planningMode ? nil : last.repsLeft,
            repsRight: planningMode ? nil : last.repsRight,
            weight: last.weight ?? "",
            placeholderReps: last.placeholderReps,
            placeholderRepsLeft: planningMode ? nil : last.placeholderRepsLeft,
            placeholderRepsRight: planningMode ? nil : last.placeholderRepsRight,
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

private struct ExerciseCardMenuButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 10)
            .frame(minHeight: 40)
            .background(Theme.background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

private struct CompactTargetButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 10)
            .frame(minHeight: 32)
            .background(Theme.background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
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
        .split(maxSplits: 1, omittingEmptySubsequences: false, whereSeparator: { $0 == "-" || $0 == "–" })
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
    guard parts.count == 2 else { return nil }
    return CompactRepRange(min: parts[0], max: parts[1])
}

private func repRangeValue(min: String, max: String) -> String {
    let cleanMin = min.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanMax = max.trimmingCharacters(in: .whitespacesAndNewlines)
    return "\(cleanMin)-\(cleanMax)"
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
