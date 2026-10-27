const CITY_LABELS: Record<string, string> = {
  UTC: "Coordinated Universal Time",
  "America/New_York": "Eastern Time — New York",
  "America/Chicago": "Central Time — Chicago",
  "America/Denver": "Mountain Time — Denver",
  "America/Los_Angeles": "Pacific Time — Los Angeles",
  "America/Phoenix": "Arizona Time — Phoenix",
  "America/Anchorage": "Alaska Time — Anchorage",
  "Pacific/Honolulu": "Hawaii Time — Honolulu",
  "America/Toronto": "Eastern Time — Toronto",
  "Europe/London": "Greenwich Mean Time — London",
  "Europe/Paris": "Central European Time — Paris",
  "Asia/Tokyo": "Japan Standard Time — Tokyo",
  "Australia/Sydney": "Australian Eastern Time — Sydney",
};

function offsetLabel(zone: string, date: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .find((item) => item.type === "timeZoneName")?.value;
    if (!part || part === "GMT") return "UTC+00:00";
    return part.replace("GMT", "UTC").replace(/:00$/, ":00");
  } catch {
    return "UTC";
  }
}

function fallbackLabel(zone: string): string {
  const city = zone.split("/").at(-1)?.replaceAll("_", " ") ?? zone;
  return city.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function timezoneDisplayLabel(zone: string, date = new Date()): string {
  return `${CITY_LABELS[zone] ?? fallbackLabel(zone)} (${offsetLabel(zone, date)})`;
}

export function timezoneSearchText(zone: string, label = timezoneDisplayLabel(zone)) {
  return `${zone} ${label} ${zone.replaceAll("_", " ").replaceAll("/", " ")}`.toLowerCase();
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function supportedTimezones(current: string): string[] {
  const common = [
    "UTC",
    browserTimezone(),
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
  const supported =
    (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.("timeZone") ?? [];
  return [...new Set([...common, ...supported, current].filter(Boolean))].sort(
    (a, b) => timezoneDisplayLabel(a).localeCompare(timezoneDisplayLabel(b)),
  );
}
