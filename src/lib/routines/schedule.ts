import type {
  RoutineCustomMode,
  RoutineFrequency,
  RoutineMonthMode,
  RoutineSchedule,
  RoutineTimeBlock,
  RoutineTimeMode,
  RoutineUnit,
} from "@/types/routines";

/**
 * Pure routine scheduling — no Firestore, no timezone guessing. Used by the
 * server (generation, validation, history), the Calendar projection and the
 * editor preview, so all three always agree on which dates a routine runs.
 *
 * Dates are `YYYY-MM-DD` calendar dates; all arithmetic is done on UTC
 * midnights so DST never shifts a day.
 */

const DAY_MS = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

export function utcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, n: number): string {
  return utcToYmd(new Date(ymdToUtc(ymd).getTime() + n * DAY_MS));
}

export function daysBetweenYmd(from: string, to: string): number {
  return Math.round((ymdToUtc(to).getTime() - ymdToUtc(from).getTime()) / DAY_MS);
}

export function weekdayOf(ymd: string): number {
  return ymdToUtc(ymd).getUTCDay();
}

/** Sunday that starts the week containing `ymd`. */
export function weekStartYmd(ymd: string): string {
  return addDaysYmd(ymd, -weekdayOf(ymd));
}

export function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function monthEndYmd(ymd: string): string {
  const d = ymdToUtc(monthStartYmd(ymd));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return utcToYmd(d);
}

function lastDayOfMonth(ymd: string): number {
  return Number(monthEndYmd(ymd).slice(8, 10));
}

/** Calendar date "now" in a timezone (falls back to UTC for an unknown zone). */
export function todayInTimeZone(timeZone: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return utcToYmd(now);
  }
}

/** The UTC instant of a wall-clock time on a date in a timezone. */
export function zonedDateTimeToUtc(
  ymd: string,
  hhmm: string,
  timeZone: string | null | undefined
): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
    h,
    m
  );
  const offsetAt = (instant: number) => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone || "UTC",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(new Date(instant));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
      return asUtc - instant;
    } catch {
      return 0;
    }
  };
  // Two passes settle the offset across a DST boundary.
  let instant = guess - offsetAt(guess);
  instant = guess - offsetAt(instant);
  return new Date(instant);
}

// ── normalize / validate ─────────────────────────────────────────────────────

export class ScheduleError extends Error {}

function intList(v: unknown, min: number, max: number, allowNegOne = false): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const x of v) {
    const n = typeof x === "string" ? Number(x) : x;
    if (typeof n !== "number" || !Number.isInteger(n)) continue;
    if ((n >= min && n <= max) || (allowNegOne && n === -1)) out.add(n);
  }
  return [...out].sort((a, b) => (a === -1 ? 99 : a) - (b === -1 ? 99 : b));
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Validates an untrusted schedule and fills the evaluator fields from the
 * editor's choice. Throws ScheduleError with a user-facing message.
 */
export function normalizeSchedule(raw: unknown, todayYmd: string): RoutineSchedule {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const frequency: RoutineFrequency = (["daily", "weekly", "monthly", "custom"] as const).includes(
    r.frequency as RoutineFrequency
  )
    ? (r.frequency as RoutineFrequency)
    : "weekly";
  const startDate = isYmd(r.startDate) ? r.startDate : todayYmd;
  const endDate = isYmd(r.endDate) ? r.endDate : null;
  if (endDate && endDate < startDate) {
    throw new ScheduleError("The end date must be on or after the start date.");
  }
  const days = intList(r.days, 0, 6);
  const monthDates = intList(r.monthDates, 1, 31, true);
  const nthWeeks = intList(r.nthWeeks, 1, 5, true);
  const weekday = clampInt(r.weekday, 0, 6, weekdayOf(startDate));
  let unit: RoutineUnit;
  let interval = 1;
  let monthMode: RoutineMonthMode = r.monthMode === "weekdays" ? "weekdays" : "dates";
  let customMode: RoutineCustomMode | null = null;

  switch (frequency) {
    case "daily":
      unit = "day";
      interval = clampInt(r.interval, 1, 30, 1);
      break;
    case "weekly":
      unit = "week";
      interval = clampInt(r.interval, 1, 12, 1);
      break;
    case "monthly":
      unit = "month";
      interval = clampInt(r.interval, 1, 12, 1);
      break;
    case "custom": {
      const cm = (["weeks", "nthWeekday", "months", "dates"] as const).includes(
        r.customMode as RoutineCustomMode
      )
        ? (r.customMode as RoutineCustomMode)
        : "weeks";
      customMode = cm;
      if (cm === "weeks") {
        unit = "week";
        interval = clampInt(r.interval, 1, 12, 2);
      } else {
        unit = "month";
        if (cm === "nthWeekday") monthMode = "weekdays";
        else monthMode = "dates";
        interval = cm === "months" ? clampInt(r.interval, 1, 12, 3) : 1;
      }
      break;
    }
  }

  const schedule: RoutineSchedule = {
    frequency,
    customMode,
    unit,
    interval,
    days: [],
    monthMode,
    monthDates: [],
    nthWeeks: [],
    weekday,
    startDate,
    endDate,
  };

  if (unit === "day") {
    schedule.days = days.length === 7 ? [] : days;
  } else if (unit === "week") {
    if (days.length === 0) throw new ScheduleError("Choose at least one day of the week.");
    schedule.days = days;
  } else if (monthMode === "weekdays") {
    if (nthWeeks.length === 0) throw new ScheduleError("Choose which weeks of the month (for example 1st and 3rd).");
    schedule.nthWeeks = nthWeeks;
    schedule.weekday = weekday;
  } else {
    const dates =
      customMode === "months" && monthDates.length === 0
        ? [Number(startDate.slice(8, 10))]
        : monthDates;
    if (dates.length === 0) throw new ScheduleError("Choose at least one day of the month.");
    schedule.monthDates = customMode === "months" ? dates.slice(0, 1) : dates;
  }
  return schedule;
}

// ── evaluate ─────────────────────────────────────────────────────────────────

/** Does the schedule (ignoring project windows) fall on this date? */
export function occursOn(s: RoutineSchedule, ymd: string): boolean {
  if (ymd < s.startDate) return false;
  if (s.endDate && ymd > s.endDate) return false;
  const wd = weekdayOf(ymd);
  const interval = Math.max(1, s.interval || 1);

  if (s.unit === "day") {
    if (daysBetweenYmd(s.startDate, ymd) % interval !== 0) return false;
    return s.days.length === 0 || s.days.includes(wd);
  }
  if (s.unit === "week") {
    const weeks = daysBetweenYmd(weekStartYmd(s.startDate), weekStartYmd(ymd)) / 7;
    if (weeks % interval !== 0) return false;
    const days = s.days.length ? s.days : [weekdayOf(s.startDate)];
    return days.includes(wd);
  }
  // month
  const months =
    (Number(ymd.slice(0, 4)) - Number(s.startDate.slice(0, 4))) * 12 +
    (Number(ymd.slice(5, 7)) - Number(s.startDate.slice(5, 7)));
  if (months % interval !== 0) return false;
  const dom = Number(ymd.slice(8, 10));
  const last = lastDayOfMonth(ymd);
  if (s.monthMode === "weekdays") {
    if (wd !== s.weekday) return false;
    const nth = Math.ceil(dom / 7);
    return s.nthWeeks.includes(nth) || (s.nthWeeks.includes(-1) && dom + 7 > last);
  }
  return s.monthDates.some((d) => {
    const target = d === -1 || d > last ? last : d;
    return target === dom;
  });
}

/** Scheduled dates in [from, to] (inclusive), optionally clipped to a window end. */
export function occurrencesBetween(
  s: RoutineSchedule,
  from: string,
  to: string,
  windowEnd: string | null = null,
  limit = 400
): string[] {
  const out: string[] = [];
  let d = from < s.startDate ? s.startDate : from;
  const end = windowEnd && windowEnd < to ? windowEnd : to;
  let guard = 0;
  while (d <= end && out.length < limit && guard < 1200) {
    if (occursOn(s, d)) out.push(d);
    d = addDaysYmd(d, 1);
    guard++;
  }
  return out;
}

/** First scheduled date on or after `from` within ~3 years (null = none). */
export function nextOccurrenceOnOrAfter(
  s: RoutineSchedule,
  from: string,
  windowEnd: string | null = null
): string | null {
  return occurrencesBetween(s, from, addDaysYmd(from, 1100), windowEnd, 1)[0] ?? null;
}

/** Last scheduled date on or before `to` within `lookbackDays`. */
export function previousOccurrenceOnOrBefore(
  s: RoutineSchedule,
  to: string,
  lookbackDays = 400
): string | null {
  let d = to;
  for (let i = 0; i <= lookbackDays && d >= s.startDate; i++) {
    if (occursOn(s, d)) return d;
    d = addDaysYmd(d, -1);
  }
  return null;
}

// ── describe ─────────────────────────────────────────────────────────────────

export function ordinal(n: number): string {
  if (n === -1) return "last";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

function daysLabel(days: number[]): string {
  const key = [...days].sort().join(",");
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  return days.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

function dayOfMonthLabel(d: number): string {
  return d === -1 ? "last day" : ordinal(d);
}

/** Short card label: "Daily", "Weekly (Mon)", "Monthly (1st)", "1st & 3rd Thu". */
export function describeSchedule(s: RoutineSchedule): string {
  const n = Math.max(1, s.interval || 1);
  if (s.unit === "day") {
    const base = n === 1 ? "Daily" : `Every ${n} days`;
    if (s.days.length === 0) return base;
    return n === 1 ? daysLabel(s.days) : `${base} (${daysLabel(s.days)})`;
  }
  if (s.unit === "week") {
    const base = n === 1 ? "Weekly" : `Every ${n} weeks`;
    return `${base} (${daysLabel(s.days)})`;
  }
  const base = n === 1 ? "Monthly" : `Every ${n} months`;
  if (s.monthMode === "weekdays") {
    return `${base} (${joinList(s.nthWeeks.map((w) => ordinal(w)))} ${WEEKDAY_SHORT[s.weekday]})`;
  }
  return `${base} (${joinList(s.monthDates.map(dayOfMonthLabel))})`;
}

/** Long sentence for the Schedule tab. */
export function describeScheduleLong(s: RoutineSchedule): string {
  const n = Math.max(1, s.interval || 1);
  if (s.unit === "day") {
    const every = n === 1 ? "Every day" : `Every ${n} days`;
    return s.days.length ? `${every}, on ${s.days.map((d) => WEEKDAY_LONG[d]).join(", ")}` : every;
  }
  if (s.unit === "week") {
    const every = n === 1 ? "Every week" : `Every ${n} weeks`;
    return `${every} on ${joinList(s.days.map((d) => WEEKDAY_LONG[d]))}`;
  }
  const every = n === 1 ? "Every month" : `Every ${n} months`;
  if (s.monthMode === "weekdays") {
    return `${every} on the ${joinList(s.nthWeeks.map((w) => ordinal(w)))} ${WEEKDAY_LONG[s.weekday]}`;
  }
  return `${every} on the ${joinList(s.monthDates.map(dayOfMonthLabel))}`;
}

export function describeTime(
  mode: RoutineTimeMode,
  block: RoutineTimeBlock | null,
  time: string | null
): string {
  if (mode === "time" && time) return formatClock(time);
  if (mode === "block" && block) return block === "am" ? "AM" : block === "pm" ? "PM" : "Midday";
  return "Anytime";
}

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Time block a specific time falls in (for the Calendar's Time Blocks panel). */
export function blockForTime(hhmm: string): RoutineTimeBlock {
  const h = Number(hhmm.slice(0, 2));
  if (h < 11) return "am";
  if (h < 14) return "midday";
  return "pm";
}

export function isClock(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** "Mon, Sep 21" for a YYYY-MM-DD. */
export function formatYmd(ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  return ymdToUtc(ymd).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
