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
const cases: Record<string, { completed: boolean; dueAt: Date | null }> = {
  A_dueYesterday: { completed: false, dueAt: at(2026, 9, 14) },
  B_dueToday: { completed: false, dueAt: at(2026, 9, 15, 18) },
  B2_dueTodayEarlier: { completed: false, dueAt: at(2026, 9, 15, 8) },
  C_dueTomorrow: { completed: false, dueAt: at(2026, 9, 16) },
  C2_dueNextYear: { completed: false, dueAt: at(2027, 0, 5) },
  D_noDueDate: { completed: false, dueAt: null },
  E_completedFuture: { completed: true, dueAt: at(2026, 9, 20) },
};
const buckets: MyTaskBucket[] = ["today", "overdue", "upcoming", "done"];
const where = (name: string) =>
  buckets.filter((b) => inStatusBucket(b, taskStatus(cases[name] as never, now.getTime(), today)));

check("A. due yesterday → Overdue (and the legacy Due-today list, which has always included overdue)", () =>
  assert.deepEqual(where("A_dueYesterday"), ["today", "overdue"]));
check("B. due today → Due today only", () => {
  assert.deepEqual(where("B_dueToday"), ["today"]);
  assert.deepEqual(where("B2_dueTodayEarlier"), ["today"]);
});
check("C. due tomorrow / later → Upcoming only", () => {
  assert.deepEqual(where("C_dueTomorrow"), ["upcoming"]);
  assert.deepEqual(where("C2_dueNextYear"), ["upcoming"]);
});
check("D. no due date → NOT Upcoming (in no status bucket)", () => assert.deepEqual(where("D_noDueDate"), []));
check("E. completed future-dated → Completed only, NOT Upcoming", () => assert.deepEqual(where("E_completedFuture"), ["done"]));

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
