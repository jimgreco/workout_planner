import Foundation

@main struct WorkoutPauseCheck {
    static func main() throws {
        let start = workoutTimestamp("2026-10-05T10:00:00.000Z")!
        func at(_ seconds: Double) -> Date { start.addingTimeInterval(seconds) }
        let live = WorkoutSet(reps: "8", weight: "100", restStartTime: at(50).timeIntervalSince1970 * 1000, rir: "0", completion: "recorded")
        let previous = WorkoutSet(reps: "10", weight: "90", restDuration: 45, rir: nil, completion: "recorded")
        var log = WorkoutLog(id: "pause", name: "Pause check", date: "2026-10-05", notes: "Keep me", exerciseItems: [ExerciseItem(exerciseId: "bench", weightType: "weight", restTargetSeconds: 90, sets: [previous, live])], startTime: "2026-10-05T10:00:00.000Z", status: "active")
        let original = log
        log.pause(at: at(60))
        log.pause(at: at(90))
        precondition(log.pausedAt == at(60).timeIntervalSince1970 * 1000)
        precondition(log.exerciseItems == original.exerciseItems)
        precondition(formatDuration(startTime: log.startTime, pausedAt: log.pausedAt, now: at(3600)) == "1m")
        precondition(restTimeText(startTime: live.restStartTime, duration: nil, targetSeconds: 90, now: at(60)) == "01:20")
        // Relaunch / background restoration is driven by persisted timestamps.
        log = try JSONDecoder().decode(WorkoutLog.self, from: JSONEncoder().encode(log))
        log.resume(at: at(3660))
        precondition(log.pausedAt == nil && log.pausedDurationMs == 3_600_000)
        let resumedRest = log.exerciseItems[0].sets[1]
        precondition(restTimeText(startTime: resumedRest.restStartTime, duration: nil, targetSeconds: 90, now: at(3660)) == "01:20")
        let resumed = log
        log.resume(at: at(3670))
        precondition(log == resumed)
        log.pause(at: at(3720))
        log.resume(at: at(3840))
        precondition(log.pausedDurationMs == 3_720_000)
        precondition(formatDuration(startTime: log.startTime, pausedDurationMs: log.pausedDurationMs, now: at(3840)) == "2m")
        log.pause(at: at(3900))
        log.finishTiming(at: at(7500))
        log.endTime = "2026-10-05T12:05:00.000Z"
        log.status = "finished"
        precondition(log.pausedAt == nil && log.pausedDurationMs == 7_320_000)
        precondition(formatDuration(startTime: log.startTime, endTime: log.endTime, pausedDurationMs: log.pausedDurationMs) == "3m")
        precondition(log.exerciseItems[0].sets[1].restDuration == 130)
        precondition(log.exerciseItems[0].sets[1].restStartTime == nil)
        precondition(log.exerciseItems[0].sets[0] == previous)
        precondition(log.exerciseItems[0].sets[1].rir == "0")
        precondition(log.startTime == original.startTime && log.notes == original.notes)
        let finished = log
        log.pause(at: at(7600))
        precondition(log == finished)
        var planning = original; planning.status = "planning"
        planning.pause(at: at(10))
        precondition(planning.pausedAt == nil)
        let legacy = "{\"id\":\"old\",\"name\":\"Old\",\"date\":\"2026-10-05\",\"exerciseItems\":[],\"startTime\":\"2026-10-05T10:00:00Z\"}"
        let decoded = try JSONDecoder().decode(WorkoutLog.self, from: Data(legacy.utf8))
        precondition(decoded.pausedAt == nil && decoded.pausedDurationMs == nil)
        precondition(formatDuration(startTime: decoded.startTime, now: at(600)) == "10m")
        print("PASS workout pause: repeated transitions, frozen elapsed/rest, relaunch, finish while paused, legacy decoding, original timestamps and set evidence")
    }
}
