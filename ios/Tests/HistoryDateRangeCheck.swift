import Foundation

@main struct HistoryDateRangeCheck {
    static func main() {
        let cases: [(HistoryDateRange, String, String, String)] = [
            (.week, "2026-11-02", "2026-10-27", "2026-10-26"),
            (.month, "2026-03-10", "2026-02-09", "2026-02-08"),
            (.quarter, "2027-01-01", "2026-10-04", "2026-10-03"),
            (.week, "2028-03-01", "2028-02-24", "2028-02-23")
        ]
        for (range, today, first, before) in cases {
            precondition(range.includes(first, today: today))
            precondition(range.includes(today, today: today))
            precondition(!range.includes(before, today: today))
            precondition(!range.includes("2099-01-01", today: today))
            precondition(HistoryDateRange.all.includes(before, today: today))
        }
        print("PASS History date range: inclusive days, month/year/leap/DST boundaries, future exclusion, All time")
    }
}
