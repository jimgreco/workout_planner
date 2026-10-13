import Foundation

@main struct HistorySearchCheck {
    static func main() {
        let exercises = [Exercise(id: "bench", name: "Bench Press")]
        let log = WorkoutLog(id: "history", name: "Push Session", date: "2026-10-12", notes: "Hotel vacation", exerciseItems: [ExerciseItem(exerciseId: "bench", sets: [])])
        for query in ["", "  ", "BENCH", "push", "2026-10-12", "  bench vacation ", "Hotel session"] {
            precondition(matchesHistorySearch(log, query: query, exercises: exercises), "Missing match: \(query)")
        }
        precondition(!matchesHistorySearch(log, query: "bench missing", exercises: exercises))
        precondition(!matchesHistorySearch(log, query: "squat", exercises: exercises))
        precondition(!matchesHistorySearch(log, query: "bench", exercises: []))
        print("PASS History search: names, notes, dates, exercise names, all-word matching, whitespace and removed exercises")
    }
}
