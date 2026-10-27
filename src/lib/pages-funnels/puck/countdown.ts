export type CountdownState = "unconfigured" | "active" | "expired";

export function splitCountdownTarget(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return { date: match?.[1] ?? "", time: match?.[2] ?? "" };
}

export function joinCountdownTarget(date: string, time: string) {
  return date && time ? `${date}T${time}` : date ? `${date}T00:00` : "";
}

export function parseCountdownTarget(value: string, timezone: string): number {
  if (!value) return 0;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return Date.parse(value);
  const naive = Date.parse(`${value.length === 16 ? `${value}:00` : value}Z`);
  if (!Number.isFinite(naive)) return 0;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(naive));
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    return (
      naive -
      (Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second")
      ) -
        naive)
    );
  } catch {
    return naive;
  }
}

export function getCountdownState(
  targetAt: string,
  now = Date.now(),
  timezone = "UTC"
): CountdownState {
  if (!targetAt) return "unconfigured";
  return parseCountdownTarget(targetAt, timezone) > now ? "active" : "expired";
}
