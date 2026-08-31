import { utcFromWallClock } from "@/lib/booking/availability";

const DATE_TIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

/** Converts a datetime-local wall clock into an absolute instant in an IANA timezone. */
export function parseCommunityEventDateTime(value: string, timezone: string) {
  if (!validTimezone(timezone)) return null;
  const match = DATE_TIME_LOCAL_RE.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const [year, month, day, hour, minute, second] = [
    Number(yearText),
    Number(monthText),
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText ?? "0"),
  ];
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
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(candidate)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  return values.year === yearText &&
    values.month === monthText &&
    values.day === dayText &&
    (values.hour === hourText || (values.hour === "24" && hourText === "00")) &&
    values.minute === minuteText &&
    values.second === (secondText ?? "00")
    ? candidate
    : null;
}

export function validateCommunityEventSchedule(input: {
  startAt: string;
  endAt: string;
  timezone: string;
  now?: Date;
}) {
  const startAt = parseCommunityEventDateTime(input.startAt, input.timezone);
  const endAt = parseCommunityEventDateTime(input.endAt, input.timezone);
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
