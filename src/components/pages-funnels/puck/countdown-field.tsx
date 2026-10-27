"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/system/option-select";
import {
  joinCountdownTarget,
  splitCountdownTarget,
} from "@/lib/pages-funnels/puck/countdown";

export function CountdownDateTimeFieldEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = splitCountdownTarget(value ?? "");
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1.5">
        <Label className="text-xs font-semibold">Date</Label>
        <input
          aria-label="Countdown date"
          type="date"
          value={parsed.date}
          onChange={(e) =>
            onChange(joinCountdownTarget(e.target.value, parsed.time))
          }
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        />
      </label>
      <label className="space-y-1.5">
        <Label className="text-xs font-semibold">Time</Label>
        <input
          aria-label="Countdown time"
          type="time"
          value={parsed.time}
          onChange={(e) =>
            onChange(joinCountdownTarget(parsed.date, e.target.value))
          }
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        />
      </label>
    </div>
  );
}

export function TimezoneFieldEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const timezone =
    value || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const zones = useMemo(() => {
    const current = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const common = [
      "UTC",
      current,
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
      (
        Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
      ).supportedValuesOf?.("timeZone") ?? [];
    return [...new Set([...common, ...supported])].sort((a, b) =>
      a.localeCompare(b)
    );
  }, []);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Timezone</Label>
      <OptionSelect
        size="sm"
        className="w-full"
        aria-label="Countdown timezone"
        value={timezone}
        onChange={(next) => onChange(next ?? "UTC")}
        options={zones.map((zone) => ({ value: zone, label: zone }))}
      />
    </div>
  );
}
