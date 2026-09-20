import Foundation

@main
struct ProgramScheduleCheck {
    static func main() throws {
        let today = DateHelpers.todayString()
        func day(_ n: Int) -> String { ProgramCyclePlanner.shiftedDay(today, by: n) }
        let templates = [WorkoutTemplate(id: "a", name: "Push"), WorkoutTemplate(id: "b", name: "Pull"), WorkoutTemplate(id: "c", name: "Legs")]
        var p = TrainingProgram(name: "Program", schedule: [ProgramScheduleItem(templateId: "a"), ProgramScheduleItem(templateId: "b")], startDate: today)
        let original = p.schedule
        func sequence(_ program: TrainingProgram) -> [String] {
            ProgramCyclePlanner.upcomingSchedule(program: program, templates: templates, logs: [], days: 6).map { $0.template?.id ?? "" }
        }
        p = ProgramCyclePlanner.editingUpcoming(p, date: day(1), type: "insert", templateId: "c", logs: [])!
        precondition(sequence(p) == ["a", "c", "b", "a", "b", "a"])
        p = ProgramCyclePlanner.editingUpcoming(p, date: day(1), type: "insert", logs: [])!
        p = ProgramCyclePlanner.editingUpcoming(p, date: day(2), type: "swap", logs: [])!
        precondition(sequence(p) == ["a", "", "b", "c", "a", "b"])
        p = ProgramCyclePlanner.editingUpcoming(p, date: day(1), type: "delete", logs: [])!
        precondition(sequence(p) == ["a", "b", "c", "a", "b", "a"])
        precondition(p.schedule == original)
        let decoded = try JSONDecoder().decode(TrainingProgram.self, from: JSONEncoder().encode(p))
        precondition(sequence(decoded) == sequence(p))
        p = ProgramCyclePlanner.editingUpcoming(p, date: today, type: "insert", templateId: "c", logs: [])!
        precondition(ProgramCyclePlanner.nextWorkout(program: p, templates: templates, logs: [])?.template.id == "c")
        precondition(!ProgramCyclePlanner.canEditUpcoming(p, date: day(-1), type: "delete", logs: []))
        print("Program schedule checks passed")
    }
}
