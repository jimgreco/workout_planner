import Foundation

@main struct WorkoutSummaryCheck {
    static func main() {
        let sets = [
            WorkoutSet(repsLeft: "8", repsRight: "6", weight: "10", rir: "", setType: "warmup", completion: "recorded"),
            WorkoutSet(reps: "8", weight: "20", completion: "skipped"),
            WorkoutSet(placeholderReps: "99", placeholderWeight: "999", completion: "unrecorded"),
        ]
        let log = WorkoutLog(id: "copy", name: "Push", date: "2026-10-15", notes: "Hotel gym", exerciseItems: [ExerciseItem(exerciseId: "bench", weightType: "bar_double", sets: sets), ExerciseItem(exerciseId: "removed", sets: [])])
        let text = workoutSummary(log, exercises: [Exercise(id: "bench", name: "Bench Press")])
        precondition(text.contains("Warmup · 8/6 x 10 lbs (bar + 2x)"))
        precondition(text.contains("Skipped · 8 x 20 lbs (bar + 2x)"))
        precondition(text.contains("Not recorded · - x -"))
        precondition(text.contains("Unknown exercise\n\nNotes: Hotel gym"))
        precondition(!text.contains("RIR") && !text.contains("999") && !text.contains("99"))
        print("PASS workout summary preserves recorded, skipped, unrecorded and warmup evidence")
    }
}
