import { utcFromWallClock } from "@/lib/booking/availability";

const DATE_TIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

/** Interpret a datetime-local wall clock in an explicit IANA timezone. */
export function parseWebinarDateTime(
  value: string,
  timezone: string
): Date | null {
  if (!isValidTimezone(timezone)) return null;
  const match = DATE_TIME_LOCAL_RE.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;

  const candidate = utcFromWallClock(
    year,
    month,
    day,
    hour * 60 + minute,
    timezone
  );
  candidate.setUTCSeconds(second);

  // Reject calendar dates normalised by Date.UTC and nonexistent DST wall clocks.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(candidate);
  const actual = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  return [
    actual.year === yearText,
    actual.month === monthText,
    actual.day === dayText,
    actual.hour === hourText || (actual.hour === "24" && hourText === "00"),
    actual.minute === minuteText,
    actual.second === (secondText ?? "00"),
  ].every(Boolean)
    ? candidate
    : null;
}

export function validateWebinarSchedule(input: {
  startAt: string;
  endAt: string;
  timezone: string;
  now?: Date;
}) {
  const startAt = parseWebinarDateTime(input.startAt, input.timezone);
  const endAt = parseWebinarDateTime(input.endAt, input.timezone);
  if (!startAt || !endAt)
    return { ok: false as const, error: "Enter valid start and end times." };
  if (startAt <= (input.now ?? new Date()))
    return { ok: false as const, error: "Start time must be in the future." };
  if (endAt <= startAt)
    return {
      ok: false as const,
      error: "End time must be later than start time.",
    };
  return { ok: true as const, startAt, endAt };
}
