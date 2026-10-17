import Foundation

@main struct RoutineSearchCheck {
    static func main() {
        let exercises = [
            Exercise(id: "bench", name: "Bench Press", muscleGroup: "Chest"),
            Exercise(id: "row", name: "Cable Row", muscleGroup: "Back"),
            Exercise(id: "squat", name: "Squat", muscleGroup: "Quads"),
        ]
        let routines = [
            WorkoutTemplate(id: "upper", name: "Upper Day", description: "Short hotel session", exerciseItems: [ExerciseItem(exerciseId: "bench", sets: []), ExerciseItem(exerciseId: "row", sets: [])]),
            WorkoutTemplate(id: "lower", name: "Lower Day", description: nil, exerciseItems: [ExerciseItem(exerciseId: "squat", sets: [])]),
            WorkoutTemplate(id: "retired", name: "Old Routine", description: nil, exerciseItems: [ExerciseItem(exerciseId: "removed", sets: [])]),
        ]
        for query in ["UPPER", "hotel", "bench", "chest", "  HOTEL\tchest\nrow "] {
            precondition(filterRoutines(routines, query: query, exercises: exercises) == [routines[0]], "Missing match: \(query)")
        }
        precondition(filterRoutines(routines, query: "quads lower", exercises: exercises) == [routines[1]])
        precondition(filterRoutines(routines, query: "chest squat", exercises: exercises).isEmpty)
        precondition(filterRoutines(routines, query: "day", exercises: exercises) == Array(routines.prefix(2)))
        for query in ["", " \t\n"] {
            precondition(filterRoutines(routines, query: query, exercises: exercises) == routines)
        }
        precondition(filterRoutines(routines, query: "old", exercises: exercises) == [routines[2]])
        precondition(filterRoutines(routines, query: "removed", exercises: exercises).isEmpty)
        precondition(filterRoutines(routines, query: "bench", exercises: []).isEmpty)
        precondition(filterRoutines([], query: "day", exercises: exercises).isEmpty)
        print("PASS Routine search: all fields, all-word matching, whitespace, ordering, removed exercises, and unchanged routines")
    }
}
