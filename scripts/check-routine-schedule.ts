/**
 * Routines — pure schedule checks (no Firestore, no network). Covers the
 * recurrence math every other layer relies on: daily / weekly / monthly /
 * custom schedules, "1st & 3rd Thursday", month-end clamping, every-N
 * intervals, start / end windows, validation, labels, and timezone-safe
 * wall-clock conversion across DST.
 *
 * Run: pnpm exec tsx scripts/check-routine-schedule.ts
 */
import assert from "node:assert/strict";
import {
  describeSchedule,
  describeScheduleLong,
  nextOccurrenceOnOrAfter,
  normalizeSchedule,
  occurrencesBetween,
  previousOccurrenceOnOrBefore,
  ScheduleError,
  todayInTimeZone,
  weekStartYmd,
  zonedDateTimeToUtc,
  blockForTime,
  isYmd,
} from "../src/lib/routines/schedule";

let passes = 0;
let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label} — ${(err as Error).message}`);
  }
}

const T = "2026-09-01"; // a Tuesday

check("daily: every day from the start date, nothing before it", () => {
  const s = normalizeSchedule({ frequency: "daily", days: [0, 1, 2, 3, 4, 5, 6], startDate: T }, T);
  assert.deepEqual(s.days, [], "all seven days collapse to 'every day'");
  assert.deepEqual(occurrencesBetween(s, "2026-08-30", "2026-09-04"), ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
});

check("daily on weekdays only (Morning Power Routine)", () => {
  const s = normalizeSchedule({ frequency: "daily", days: [1, 2, 3, 4, 5], startDate: T }, T);
  assert.deepEqual(occurrencesBetween(s, "2026-09-05", "2026-09-08"), ["2026-09-07", "2026-09-08"]);
  assert.equal(describeSchedule(s), "Weekdays");
});

check("every 3 days counts from the start date", () => {
  const s = normalizeSchedule({ frequency: "daily", interval: 3, startDate: T }, T);
  assert.deepEqual(occurrencesBetween(s, T, "2026-09-10"), ["2026-09-01", "2026-09-04", "2026-09-07", "2026-09-10"]);
});

check("weekly on Monday (Weekly CEO Reset)", () => {
  const s = normalizeSchedule({ frequency: "weekly", days: [1], startDate: T }, T);
  assert.deepEqual(occurrencesBetween(s, T, "2026-09-30"), ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  assert.equal(describeSchedule(s), "Weekly (Mon)");
});

check("weekly Mon/Wed/Fri", () => {
  const s = normalizeSchedule({ frequency: "weekly", days: [5, 1, 3], startDate: T }, T);
  assert.deepEqual(s.days, [1, 3, 5]);
  assert.deepEqual(occurrencesBetween(s, "2026-09-07", "2026-09-13"), ["2026-09-07", "2026-09-09", "2026-09-11"]);
  assert.equal(describeSchedule(s), "Weekly (Mon, Wed, Fri)");
});

check("custom every 2 weeks on Tuesday skips alternate weeks", () => {
  const s = normalizeSchedule({ frequency: "custom", customMode: "weeks", interval: 2, days: [2], startDate: T }, T);
  assert.equal(s.unit, "week");
  assert.deepEqual(occurrencesBetween(s, T, "2026-10-01"), ["2026-09-01", "2026-09-15", "2026-09-29"]);
});

check("weekly requires at least one day", () => {
  assert.throws(() => normalizeSchedule({ frequency: "weekly", days: [], startDate: T }, T), ScheduleError);
});

check("monthly on the 1st (Monthly Personal Check-In)", () => {
  const s = normalizeSchedule({ frequency: "monthly", monthMode: "dates", monthDates: [1], startDate: T }, T);
  assert.deepEqual(occurrencesBetween(s, T, "2026-12-31"), ["2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"]);
  assert.equal(describeSchedule(s), "Monthly (1st)");
});

check("monthly on the 31st falls on the last day of short months", () => {
  const s = normalizeSchedule({ frequency: "monthly", monthDates: [31], startDate: "2026-01-01" }, T);
  assert.deepEqual(occurrencesBetween(s, "2026-01-01", "2026-05-31"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
});

check("monthly on the last day (-1), including a leap February", () => {
  const s = normalizeSchedule({ frequency: "monthly", monthDates: [-1], startDate: "2028-01-01" }, T);
  assert.deepEqual(occurrencesBetween(s, "2028-02-01", "2028-03-31"), ["2028-02-29", "2028-03-31"]);
  assert.equal(describeSchedule(s), "Monthly (last day)");
});

check("custom: 1st and 3rd Thursday of each month", () => {
  const s = normalizeSchedule({ frequency: "custom", customMode: "nthWeekday", nthWeeks: [3, 1], weekday: 4, startDate: T }, T);
  assert.equal(s.monthMode, "weekdays");
  assert.deepEqual(s.nthWeeks, [1, 3]);
  assert.deepEqual(occurrencesBetween(s, T, "2026-11-30"), [
    "2026-09-03", "2026-09-17",
    "2026-10-01", "2026-10-15",
    "2026-11-05", "2026-11-19",
  ]);
  assert.equal(describeSchedule(s), "Monthly (1st & 3rd Thu)");
  assert.equal(describeScheduleLong(s), "Every month on the 1st & 3rd Thursday");
});

check("custom: last Friday of the month", () => {
  const s = normalizeSchedule({ frequency: "custom", customMode: "nthWeekday", nthWeeks: [-1], weekday: 5, startDate: T }, T);
  assert.deepEqual(occurrencesBetween(s, T, "2026-10-31"), ["2026-09-25", "2026-10-30"]);
});

check("custom: every 3 months on the start date's day", () => {
  const s = normalizeSchedule({ frequency: "custom", customMode: "months", interval: 3, startDate: "2026-09-15" }, T);
  assert.deepEqual(s.monthDates, [15]);
  assert.deepEqual(occurrencesBetween(s, "2026-09-01", "2027-06-30"), ["2026-09-15", "2026-12-15", "2027-03-15", "2027-06-15"]);
});

check("custom: specific dates (1st and 15th)", () => {
  const s = normalizeSchedule({ frequency: "custom", customMode: "dates", monthDates: [15, 1], startDate: T }, T);
  assert.deepEqual(occurrencesBetween(s, T, "2026-10-20"), ["2026-09-01", "2026-09-15", "2026-10-01", "2026-10-15"]);
  assert.equal(describeSchedule(s), "Monthly (1st & 15th)");
});

check("custom nth weekday requires chosen weeks", () => {
  assert.throws(() => normalizeSchedule({ frequency: "custom", customMode: "nthWeekday", nthWeeks: [], weekday: 4, startDate: T }, T), ScheduleError);
});

check("no end date by default; end date is honoured when set", () => {
  const open = normalizeSchedule({ frequency: "weekly", days: [1], startDate: T }, T);
  assert.equal(open.endDate, null);
  assert.equal(nextOccurrenceOnOrAfter(open, "2029-01-01"), "2029-01-01");
  const ends = normalizeSchedule({ frequency: "weekly", days: [1], startDate: T, endDate: "2026-09-15" }, T);
  assert.deepEqual(occurrencesBetween(ends, T, "2026-12-31"), ["2026-09-07", "2026-09-14"]);
  assert.equal(nextOccurrenceOnOrAfter(ends, "2026-09-15"), null);
  assert.throws(() => normalizeSchedule({ frequency: "weekly", days: [1], startDate: T, endDate: "2026-08-01" }, T), ScheduleError);
});

check("a window end (project due date) clips occurrences", () => {
  const s = normalizeSchedule({ frequency: "daily", startDate: T }, T);
  assert.deepEqual(occurrencesBetween(s, T, "2026-09-30", "2026-09-03"), ["2026-09-01", "2026-09-02", "2026-09-03"]);
});

check("next / previous occurrence helpers", () => {
  const s = normalizeSchedule({ frequency: "weekly", days: [1], startDate: T }, T);
  assert.equal(nextOccurrenceOnOrAfter(s, "2026-09-08"), "2026-09-14");
  assert.equal(previousOccurrenceOnOrBefore(s, "2026-09-13"), "2026-09-07");
  assert.equal(previousOccurrenceOnOrBefore(s, "2026-09-05"), null, "nothing before the start");
});

check("untrusted input is sanitized (bad days, huge interval, bad dates)", () => {
  const s = normalizeSchedule({ frequency: "weekly", days: [1, 9, -3, "2", 1.5], interval: 999, startDate: "2026-02-31" }, T);
  assert.deepEqual(s.days, [1, 2]);
  assert.equal(s.interval, 12);
  assert.equal(s.startDate, T, "invalid start date falls back to today");
  const unknown = normalizeSchedule({ frequency: "hourly", days: [3] }, T);
  assert.equal(unknown.frequency, "weekly");
});

check("date helpers", () => {
  assert.equal(weekStartYmd("2026-09-24"), "2026-09-20");
  assert.equal(isYmd("2026-02-29"), false);
  assert.equal(isYmd("2028-02-29"), true);
  assert.equal(todayInTimeZone("Asia/Tokyo", new Date("2026-09-27T20:00:00Z")), "2026-09-28");
  assert.equal(todayInTimeZone("America/Los_Angeles", new Date("2026-09-28T03:00:00Z")), "2026-09-27");
  assert.equal(todayInTimeZone("Not/AZone", new Date("2026-09-28T03:00:00Z")), "2026-09-28");
});

check("specific times convert in the sub-account's timezone, across DST", () => {
  // New York: EDT (UTC-4) before Nov 1 2026, EST (UTC-5) after.
  assert.equal(zonedDateTimeToUtc("2026-10-30", "09:00", "America/New_York").toISOString(), "2026-10-30T13:00:00.000Z");
  assert.equal(zonedDateTimeToUtc("2026-11-02", "09:00", "America/New_York").toISOString(), "2026-11-02T14:00:00.000Z");
  assert.equal(zonedDateTimeToUtc("2026-09-28", "12:00", "UTC").toISOString(), "2026-09-28T12:00:00.000Z");
});

check("a specific time maps to the right time block", () => {
  assert.equal(blockForTime("07:30"), "am");
  assert.equal(blockForTime("12:15"), "midday");
  assert.equal(blockForTime("18:00"), "pm");
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
