"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  joinCountdownTarget,
  splitCountdownTarget,
} from "@/lib/pages-funnels/puck/countdown";
import {
  browserTimezone,
  supportedTimezones,
  timezoneDisplayLabel,
  timezoneSearchText,
} from "@/lib/pages-funnels/puck/timezone-labels";
import {
  SLIDER_INTERVAL_MAX_SECONDS,
  SLIDER_INTERVAL_MIN_SECONDS,
  sliderIntervalMsToSeconds,
  sliderIntervalSecondsToMs,
} from "@/lib/pages-funnels/puck/slider";

export function SliderIntervalFieldEditor({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Time between slides</Label>
      <div className="flex items-center gap-2">
        <input
          aria-label="Time between slides"
          type="number"
          min={SLIDER_INTERVAL_MIN_SECONDS}
          max={SLIDER_INTERVAL_MAX_SECONDS}
          step={1}
          value={sliderIntervalMsToSeconds(value)}
          onChange={(event) =>
            onChange(sliderIntervalSecondsToMs(Number(event.target.value)))
          }
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        />
        <span className="text-muted-foreground text-sm">seconds</span>
      </div>
      <p className="text-muted-foreground text-caption">
        Choose 3–60 seconds between automatic slide changes.
      </p>
    </div>
  );
}

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
  const timezone = value || browserTimezone();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => supportedTimezones(timezone), [timezone]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? zones.filter((zone) => timezoneSearchText(zone).includes(needle))
      : zones;
  }, [query, zones]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Timezone</Label>
      <div className="relative">
        <input
          aria-label="Search timezones"
          role="combobox"
          aria-expanded={open}
          aria-controls="countdown-timezone-options"
          value={open ? query : timezoneDisplayLabel(timezone)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 0)}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          placeholder="Search by city, region, or UTC offset"
        />
        {open && (
          <div
            id="countdown-timezone-options"
            role="listbox"
            className="border-border bg-popover absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border p-1 shadow-pop"
          >
            {matches.length ? (
              matches.slice(0, 80).map((zone) => (
                <button
                  type="button"
                  key={zone}
                  role="option"
                  aria-selected={zone === timezone}
                  className="hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(zone);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {timezoneDisplayLabel(zone)}
                </button>
              ))
            ) : (
              <p className="text-muted-foreground px-2 py-2 text-sm">
                No timezones found.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-caption">
        Search by city, region, or UTC offset. The saved value stays a canonical timezone.
      </p>
    </div>
  );
}
