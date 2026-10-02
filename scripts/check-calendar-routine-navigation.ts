import assert from "node:assert/strict";
import { routineCalendarDate, routineCalendarPath } from "../src/lib/calendar/navigation";

assert.equal(
  routineCalendarPath("routine/with spaces", "2026-10-02"),
  "/projects/routines/routine%2Fwith%20spaces?date=2026-10-02"
);
assert.equal(routineCalendarPath("routine-id", null), "/projects/routines/routine-id");
assert.equal(routineCalendarDate("2026-10-02"), "2026-10-02");
assert.equal(routineCalendarDate("not-a-date"), null);

console.log("Calendar Routine navigation checks passed (4/4)");
