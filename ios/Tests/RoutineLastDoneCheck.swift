import Foundation

@main struct RoutineLastDoneCheck {
    static func main() {
        let template = WorkoutTemplate(id: "push", name: "Push Day")
        func log(_ id: String, _ name: String, _ date: String, _ status: String) -> WorkoutLog {
            var log = WorkoutLog(id: id, name: name, date: date, exerciseItems: [])
            log.status = status
            return log
        }
        let logs = [
            log("a", "push day ", "2026-10-20", "finished"),
            log("b", "Push Day", "2026-10-30", "finished"),
            log("c", "Push Day", "2026-11-02", "planning"),
            log("d", "Leg Day", "2026-11-03", "finished"),
            log("e", "Push Day", "bad", "finished"),
        ]
        precondition(routineLastDoneDate(template, logs: logs) == "2026-10-30")
        precondition(routineLastDoneDate(WorkoutTemplate(name: "Pull Day"), logs: logs) == nil)
        precondition(routineLastDoneDate(WorkoutTemplate(name: "  "), logs: logs) == nil)
        let expected: [(String?, String)] = [
            ("2026-10-30", "Last done today"),
            ("2026-10-31", "Last done yesterday"),
            ("2026-11-12", "Last done 13 days ago"),
            ("2026-11-13", "Last done Oct 30, 2026"),
            ("2026-10-01", "Last done Oct 30, 2026"),
            (nil, "Last done Oct 30, 2026"),
        ]
        for (today, label) in expected {
            let actual = routineLastDoneLabel(template, logs: logs, today: today)
            precondition(actual == label, "\(today ?? "nil"): \(actual)")
        }
        precondition(routineLastDoneLabel(WorkoutTemplate(name: "Pull Day"), logs: logs, today: "2026-11-03") == "Not done yet")
        print("PASS Routine last done: name matching, finished-only, relative and dated labels")
    }
}
