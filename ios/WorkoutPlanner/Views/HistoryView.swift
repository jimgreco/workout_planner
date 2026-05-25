import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var store: WorkoutStore
    @Binding var selectedPage: AppPage
    @State private var viewMode: HistoryMode = .list
    @State private var expandedId: String?
    @State private var deleteTarget: WorkoutLog?
    @State private var calendarMonth = Date()
    @State private var selectedDate: String?

    private var finishedLogs: [WorkoutLog] {
        store.logs
            .filter { $0.status == "finished" }
            .sorted { lhs, rhs in
                if lhs.date == rhs.date { return (lhs.endTime ?? "") > (rhs.endTime ?? "") }
                return lhs.date > rhs.date
            }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Picker("", selection: $viewMode) {
                        Label("List", systemImage: "list.bullet").tag(HistoryMode.list)
                        Label("Calendar", systemImage: "calendar").tag(HistoryMode.calendar)
                    }
                    .pickerStyle(.segmented)

                    if viewMode == .list {
                        listView
                    } else {
                        calendarView
                    }
                }
                .padding(16)
            }
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.large)
        }
        .alert("Delete Workout", isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                guard let target = deleteTarget else { return }
                Task {
                    do {
                        try await store.deleteLog(target.id)
                        if expandedId == target.id { expandedId = nil }
                        deleteTarget = nil
                    } catch {
                        store.errorMessage = error.localizedDescription
                    }
                }
            }
        } message: {
            Text("Delete \(deleteTarget?.name ?? "this workout")? This cannot be undone.")
        }
    }

    @ViewBuilder
    private var listView: some View {
        if finishedLogs.isEmpty {
            EmptyState(icon: "calendar", text: "No finished workouts yet. Complete a workout to see it here!")
        } else {
            VStack(spacing: 12) {
                ForEach(finishedLogs) { log in
                    HistoryItemView(
                        log: log,
                        exercises: store.exercises,
                        isExpanded: expandedId == log.id,
                        onToggle: { expandedId = expandedId == log.id ? nil : log.id },
                        onEdit: {
                            store.setEditingLog(log)
                            selectedPage = .log
                        },
                        onDelete: { deleteTarget = log }
                    )
                }
            }
        }
    }

    private var calendarView: some View {
        VStack(spacing: 20) {
            HStack(spacing: 12) {
                IconCircleButton(systemName: "chevron.left") {
                    calendarMonth = Calendar.current.date(byAdding: .month, value: -1, to: calendarMonth) ?? calendarMonth
                }
                Text(calendarMonth.formatted(.dateTime.month(.wide).year()))
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(Theme.text)
                    .frame(minWidth: 180)
                IconCircleButton(systemName: "chevron.right") {
                    calendarMonth = Calendar.current.date(byAdding: .month, value: 1, to: calendarMonth) ?? calendarMonth
                }
            }
            .frame(maxWidth: .infinity)

            CalendarGrid(
                month: calendarMonth,
                logsByDate: logsByDate,
                selectedDate: $selectedDate
            )

            if let selectedDate {
                VStack(alignment: .leading, spacing: 12) {
                    Text(DateHelpers.date(from: selectedDate).formatted(.dateTime.weekday(.wide).month(.wide).day()))
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(Theme.text)

                    let logs = logsByDate[selectedDate] ?? []
                    if logs.isEmpty {
                        EmptyState(icon: "calendar.badge.exclamationmark", text: "No workouts logged on this day.")
                    } else {
                        ForEach(logs) { log in
                            HistoryItemView(
                                log: log,
                                exercises: store.exercises,
                                isExpanded: expandedId == log.id,
                                onToggle: { expandedId = expandedId == log.id ? nil : log.id },
                                onEdit: {
                                    store.setEditingLog(log)
                                    selectedPage = .log
                                },
                                onDelete: { deleteTarget = log }
                            )
                        }
                    }
                }
            }
        }
    }

    private var logsByDate: [String: [WorkoutLog]] {
        Dictionary(grouping: finishedLogs, by: \.date)
    }
}

private enum HistoryMode {
    case list
    case calendar
}

private struct HistoryItemView: View {
    let log: WorkoutLog
    let exercises: [Exercise]
    let isExpanded: Bool
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            if log.hasPB == true {
                                Image(systemName: "star.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.accent)
                            }
                            Text(log.name)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                        }
                        Text(DateHelpers.date(from: log.date).formatted(.dateTime.weekday(.wide).month(.abbreviated).day().year()))
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted)
                    }

                    Spacer()

                    Text(formatDuration(startTime: log.startTime, endTime: log.endTime))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                    Text("\(log.exerciseItems.count) ex")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
                .padding(16)
            }

            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(log.exerciseItems) { item in
                        if let exercise = exercises.first(where: { $0.id == item.exerciseId }) {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) {
                                    if log.pbExerciseIds?.contains(item.exerciseId) == true {
                                        Image(systemName: "star.fill")
                                            .font(.system(size: 12))
                                            .foregroundStyle(Theme.accent)
                                    }
                                    Text(exercise.name)
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundStyle(Theme.text)
                                    Badge(text: exercise.muscleGroup)
                                    if let group = item.supersetGroup, !group.isEmpty {
                                        Badge(text: "SS \(group)")
                                    }
                                }

                                FlowLayout(spacing: 6) {
                                    ForEach(item.sets.indices, id: \.self) { index in
                                        let set = item.sets[index]
                                        Text(setLabel(set, weightType: item.weightType))
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(Theme.text)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Theme.surface)
                                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }

                    if let notes = log.notes, !notes.isEmpty {
                        Text("\"\(notes)\"")
                            .font(.system(size: 13))
                            .italic()
                            .foregroundStyle(Theme.muted)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    }

                    HStack(spacing: 8) {
                        Button(action: onEdit) {
                            Label("Edit", systemImage: "pencil")
                        }
                        .buttonStyle(SecondaryButtonStyle(compact: true))
                        IconCircleButton(systemName: "trash", tint: Theme.danger, action: onDelete)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) {
                    Rectangle().fill(Theme.border).frame(height: 1)
                }
            }
        }
        .background(Theme.background)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                .stroke(isExpanded ? Theme.text : Theme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .shadow(color: .black.opacity(isExpanded ? 0.12 : 0.06), radius: isExpanded ? 10 : 4, x: 0, y: 2)
    }

    private func setLabel(_ set: WorkoutSet, weightType: String?) -> String {
        let reps = (set.reps?.isEmpty == false ? set.reps : "-") ?? "-"
        let effort = [
            set.rpe?.isEmpty == false ? "RPE \(set.rpe!)" : nil,
            set.rir?.isEmpty == false ? "RIR \(set.rir!)" : nil,
        ].compactMap { $0 }.joined(separator: " · ")
        let effortSuffix = effort.isEmpty ? "" : " · \(effort)"
        let typePrefix = set.setType == nil || set.setType == "working" ? "" : "\(setTypeLabel(set.setType)) · "
        if weightType == "none" {
            return "\(typePrefix)\(reps) reps\(effortSuffix)"
        }
        let weight = (set.weight?.isEmpty == false ? set.weight : "-") ?? "-"
        let suffix = weightType == "double" ? " lbs (2x)" : " lbs"
        return "\(typePrefix)\(reps) x \(weight)\(weight == "-" ? "" : suffix)\(effortSuffix)"
    }
}

private struct CalendarGrid: View {
    let month: Date
    let logsByDate: [String: [WorkoutLog]]
    @Binding var selectedDate: String?

    private let dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 6) {
            ForEach(dayLabels, id: \.self) { label in
                Text(label)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 2)
            }

            ForEach(cells.indices, id: \.self) { index in
                let cell = cells[index]
                CalendarCell(
                    cell: cell,
                    logs: cell.dateString.flatMap { logsByDate[$0] } ?? [],
                    isSelected: cell.dateString == selectedDate,
                    onTap: {
                        guard cell.isCurrentMonth, let dateString = cell.dateString else { return }
                        selectedDate = selectedDate == dateString ? nil : dateString
                    }
                )
            }
        }
    }

    private var cells: [CalendarDayCell] {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.year, .month], from: month)
        let first = calendar.date(from: components) ?? month
        let daysInMonth = calendar.range(of: .day, in: .month, for: first)?.count ?? 30
        let firstWeekday = calendar.component(.weekday, from: first)
        let previousMonth = calendar.date(byAdding: .month, value: -1, to: first) ?? first
        let daysInPreviousMonth = calendar.range(of: .day, in: .month, for: previousMonth)?.count ?? 30
        var values: [CalendarDayCell] = []

        if firstWeekday > 1 {
            for offset in stride(from: firstWeekday - 2, through: 0, by: -1) {
                values.append(CalendarDayCell(day: daysInPreviousMonth - offset, isCurrentMonth: false, dateString: nil))
            }
        }

        for day in 1...daysInMonth {
            let date = calendar.date(byAdding: .day, value: day - 1, to: first) ?? first
            values.append(CalendarDayCell(day: day, isCurrentMonth: true, dateString: DateHelpers.dayString(from: date)))
        }

        var nextMonthDay = 1
        while values.count % 7 != 0 {
            values.append(CalendarDayCell(day: nextMonthDay, isCurrentMonth: false, dateString: nil))
            nextMonthDay += 1
        }

        return values
    }
}

private struct CalendarDayCell {
    let day: Int
    let isCurrentMonth: Bool
    let dateString: String?
}

private struct CalendarCell: View {
    let cell: CalendarDayCell
    let logs: [WorkoutLog]
    let isSelected: Bool
    let onTap: () -> Void

    private var isToday: Bool {
        cell.dateString == DateHelpers.todayString()
    }

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottom) {
                Text("\(cell.day)")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(isSelected ? Theme.background : cell.isCurrentMonth ? Theme.text : Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                HStack(spacing: 2) {
                    if !logs.isEmpty {
                        Circle()
                            .fill(isSelected ? Theme.background : Theme.accent)
                            .frame(width: 4, height: 4)
                    }
                    if logs.contains(where: { $0.hasPB == true }) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(isSelected ? Theme.background : Theme.accent)
                    }
                    if logs.count > 1 {
                        Text("\(logs.count)")
                            .font(.system(size: 8, weight: .heavy))
                            .foregroundStyle(isSelected ? Theme.background : Theme.accent)
                    }
                }
                .frame(height: 10)
                .padding(.bottom, 4)
            }
            .frame(height: 44)
            .frame(maxWidth: .infinity)
            .background(isSelected ? Theme.text : !logs.isEmpty ? Theme.accent.opacity(0.08) : Theme.background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(isToday ? Theme.text : logs.isEmpty ? Theme.border : Theme.accent.opacity(0.25), lineWidth: isToday ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .opacity(cell.isCurrentMonth ? 1 : 0.2)
        }
        .buttonStyle(.plain)
        .disabled(!cell.isCurrentMonth)
    }
}
