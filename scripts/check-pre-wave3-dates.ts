/**
 * Pre-Wave-3 cleanup (2026-10-15) — pure regression checks, no network/DB.
 *   1. My Tasks buckets: Upcoming = open tasks with a due date AFTER today only.
 *   2. Decoder birth dates: a date-only value never shifts a day in any timezone.
 * Run: pnpm exec tsx scripts/check-pre-wave3-dates.ts
 */
import assert from "node:assert/strict";
import { inStatusBucket, taskStatus, dayStart, type MyTaskBucket } from "../src/lib/tasks/my-tasks-buckets";
import { formatDateOnly } from "../src/lib/energetic-decoder/date-only";

let pass = 0;
function check(label: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  PASS  ${label}`);
}

// ── 1. My Tasks buckets ───────────────────────────────────────────────
console.log("My Tasks buckets");
const now = new Date(2026, 9, 15, 10, 0, 0); // Thu 15 Oct 2026, 10:00 local
const today = dayStart(now);
const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo, d, h, 0, 0);
type Case = { completed: boolean; dueAt: Date | null; autoRollover?: boolean };
const cases: Record<string, Case> = {
  todayRolloverOn: { completed: false, dueAt: at(2026, 9, 15, 18), autoRollover: true },
  todayRolloverOff: { completed: false, dueAt: at(2026, 9, 15, 8), autoRollover: false },
  yesterdayRolloverOn: { completed: false, dueAt: at(2026, 9, 14), autoRollover: true },
  yesterdayRolloverOff: { completed: false, dueAt: at(2026, 9, 14), autoRollover: false },
  yesterdayRolloverUnset: { completed: false, dueAt: at(2026, 9, 14) },
  future: { completed: false, dueAt: at(2026, 9, 16) },
  futureFar: { completed: false, dueAt: at(2027, 0, 5), autoRollover: true },
  noDueDate: { completed: false, dueAt: null, autoRollover: true },
  completedFuture: { completed: true, dueAt: at(2026, 9, 20), autoRollover: true },
  completedPast: { completed: true, dueAt: at(2026, 9, 10), autoRollover: true },
};
const buckets: MyTaskBucket[] = ["today", "overdue", "upcoming", "done"];
const where = (name: string) => {
  const c = cases[name];
  return buckets.filter((b) => inStatusBucket(b, taskStatus(c as never, now.getTime(), today), c));
};

check("due today + rollover ON → Due today only", () => assert.deepEqual(where("todayRolloverOn"), ["today"]));
check("due today + rollover OFF → Due today only", () => assert.deepEqual(where("todayRolloverOff"), ["today"]));
check("yesterday + rollover ON → Due today AND Overdue (rollover keeps it in today's work)", () =>
  assert.deepEqual(where("yesterdayRolloverOn"), ["today", "overdue"]));
check("yesterday + rollover OFF → Overdue ONLY (not Due today)", () => assert.deepEqual(where("yesterdayRolloverOff"), ["overdue"]));
check("yesterday + rollover unset (legacy) → Overdue ONLY (rollover is OFF unless enabled)", () =>
  assert.deepEqual(where("yesterdayRolloverUnset"), ["overdue"]));
check("future due date → Upcoming only", () => {
  assert.deepEqual(where("future"), ["upcoming"]);
  assert.deepEqual(where("futureFar"), ["upcoming"]);
});
check("no due date → none of Due today / Overdue / Upcoming", () => assert.deepEqual(where("noDueDate"), []));
check("completed → Completed only", () => {
  assert.deepEqual(where("completedFuture"), ["done"]);
  assert.deepEqual(where("completedPast"), ["done"]);
});

// ── 2. Decoder date-only formatting across timezones ──────────────────
console.log("Decoder birth dates");
const ZONES = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver",
  "America/Chicago", "America/New_York", "UTC", "Europe/London", "Asia/Tokyo", "Pacific/Kiritimati",
];
const original = process.env.TZ;
for (const tz of ZONES) {
  process.env.TZ = tz;
  check(`${tz}: 1991-02-28 → Feb 28, 1991`, () => assert.equal(formatDateOnly("1991-02-28", "en-US"), "Feb 28, 1991"));
  check(`${tz}: DST-boundary dates keep their day`, () => {
    assert.equal(formatDateOnly("2026-03-08", "en-US"), "Mar 8, 2026"); // US spring-forward
    assert.equal(formatDateOnly("2026-11-01", "en-US"), "Nov 1, 2026"); // US fall-back
    assert.equal(formatDateOnly("2000-01-01", "en-US"), "Jan 1, 2000");
    assert.equal(formatDateOnly("1999-12-31", "en-US"), "Dec 31, 1999");
  });
}
process.env.TZ = "America/New_York";
check("sanity: the OLD parsing really did shift a day in a US zone", () =>
  assert.equal(new Date("1991-02-28").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), "Feb 27, 1991"));
check("non-date-only input is shown as-is, empty as an em dash", () => {
  assert.equal(formatDateOnly("unknown", "en-US"), "unknown");
  assert.equal(formatDateOnly("", "en-US"), "—");
  assert.equal(formatDateOnly(null, "en-US"), "—");
});
process.env.TZ = original;

console.log(`\n${pass} passed, 0 failed.`);
