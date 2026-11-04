"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, CalendarPlus, ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { OptionSelect } from "@/components/system/option-select";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { subscribeToBookingPages } from "@/lib/firestore/booking-pages";
import { Hint } from "@/components/pages-funnels/puck/color-controls";
import {
  BOOKING_BUTTON_LABEL_MAX,
  normalizeBookingButton,
  normalizeBookingDisplay,
  type BookingButton,
  type BookingDisplay,
  type BookingDisplayMode,
} from "@/lib/pages-funnels/booking-block";
import type { BookingPage } from "@/types/booking";

/**
 * Booking block settings (Wave 2B-2). The block only chooses an existing
 * Booking Page and how to present it — availability, duration, questions and
 * confirmation are edited on the Booking Page itself (linked from here), never
 * in the page builder.
 *
 * The list is the same client subscription the Booking list page uses
 * (`subscribeToBookingPages`, the builder's own workspace, member rules), so
 * only this workspace's Booking Pages can be chosen; the stored value is the
 * Booking Page's slug (its immutable id).
 */
export function BookingSourceFieldEditor({
  value,
  onChange,
  usage = "block",
}: {
  value: string | undefined;
  onChange: (slug: string) => void;
  /** "link" = a Button / Image / menu-button destination (shared action picker). */
  usage?: "block" | "link";
}) {
  const sub = useOptionalSubAccount();
  const [pages, setPages] = useState<BookingPage[] | null>(null);
  useEffect(() => {
    if (!sub?.subAccountId) return;
    return subscribeToBookingPages(sub.subAccountId, setPages, () => setPages([]));
  }, [sub?.subAccountId]);

  const slug = value ?? "";
  const selected = pages?.find((p) => p.slug === slug) ?? null;
  const stale = !!slug && pages !== null && !selected;

  if (!sub) return <Hint>Booking pages aren&apos;t available here.</Hint>;
  if (pages === null) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded-md border p-2.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Loading booking pages…
      </div>
    );
  }
  if (pages.length === 0 && !slug) {
    return (
      <div className="border-border bg-muted/40 flex flex-col items-start gap-2 rounded-md border border-dashed p-3" data-booking-source-empty="">
        <p className="text-muted-foreground text-xs">No booking pages yet in this workspace.</p>
        <a href={sub.saPath("/booking/new")} target="_blank" rel="noreferrer" className="text-primary flex items-center gap-1 text-xs font-medium hover:underline">
          <CalendarPlus className="size-3.5" aria-hidden="true" /> Create a booking page
        </a>
      </div>
    );
  }

  const options = pages.map((p) => ({ value: p.slug, label: p.status === "published" ? p.name : `${p.name} (draft)` }));
  // A deleted page keeps its stored id (never silently retargeted) until the owner picks another.
  if (stale) options.unshift({ value: slug, label: "Unavailable booking page" });

  return (
    <div className="space-y-1.5" data-booking-source-field="">
      <OptionSelect
        size="sm"
        className="w-full"
        aria-label="Booking page"
        value={slug || null}
        onChange={(v) => onChange(v ?? "")}
        options={options}
        noneLabel="Select a booking page…"
      />
      {stale ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-700" role="status">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          This booking page was deleted or isn&apos;t in this workspace. Choose another one.
        </p>
      ) : selected && selected.status !== "published" ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-700" role="status">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {usage === "link"
            ? "Draft booking page — visitors only get this link once it\u2019s published."
            : "Draft booking page — visitors won\u2019t see this block until it\u2019s published."}
        </p>
      ) : (
        <Hint>
          {usage === "link"
            ? "Opens this booking page — availability, questions and confirmation come from it."
            : "Uses this booking page\u2019s own availability, questions and confirmation."}
        </Hint>
      )}
      {selected ? (
        <a
          href={sub.saPath(`/booking/${selected.slug}`)}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <ExternalLink className="size-3" aria-hidden="true" /> Open booking page settings
        </a>
      ) : null}
    </div>
  );
}

export function BookingLayoutFieldEditor({ value, onChange }: { value: BookingDisplayMode | undefined; onChange: (mode: BookingDisplayMode) => void }) {
  const mode = value === "button" ? "button" : "embed";
  return (
    <div className="space-y-1.5" data-booking-layout-field="">
      <SegmentedControl<BookingDisplayMode>
        value={mode}
        onChange={onChange}
        options={[
          { value: "embed", label: "Calendar + times" },
          { value: "button", label: "Button only" },
        ]}
      />
      <Hint>
        {mode === "embed"
          ? "Visitors pick a day and time and book right on this page."
          : "A button that opens the booking page."}
      </Hint>
    </div>
  );
}

const DISPLAY_SWITCHES: { key: keyof BookingDisplay; label: string }[] = [
  { key: "showTitle", label: "Show business and booking name" },
  { key: "showDescription", label: "Show description" },
  { key: "showDetails", label: "Show details (duration, deposit)" },
  { key: "card", label: "Show inside a card" },
];

export function BookingDisplayFieldEditor({ value, onChange }: { value: unknown; onChange: (display: BookingDisplay) => void }) {
  const display = normalizeBookingDisplay(value);
  return (
    <div className="space-y-2.5" data-booking-display-field="">
      {DISPLAY_SWITCHES.map(({ key, label }) => (
        <label key={key} className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold">{label}</span>
          <Switch aria-label={label} checked={display[key]} onCheckedChange={(checked) => onChange({ ...display, [key]: checked })} />
        </label>
      ))}
      <Hint>The name, description and duration come from the booking page.</Hint>
    </div>
  );
}

export function BookingButtonFieldEditor({ value, onChange }: { value: unknown; onChange: (button: BookingButton) => void }) {
  const button = normalizeBookingButton(value);
  const raw = value && typeof value === "object" && typeof (value as BookingButton).label === "string" ? (value as BookingButton).label : button.label;
  const labelId = `booking-button-${useId().replace(/:/g, "")}`;
  return (
    <div className="space-y-3" data-booking-button-field="">
      <div className="space-y-1.5">
        <Label htmlFor={labelId} className="text-xs font-semibold">Button label</Label>
        <Input
          id={labelId}
          value={raw}
          maxLength={BOOKING_BUTTON_LABEL_MAX}
          onChange={(e) => onChange({ ...button, label: e.target.value })}
          className="text-caption h-8"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Button style</Label>
        <SegmentedControl<BookingButton["style"]>
          value={button.style}
          onChange={(style) => onChange({ ...button, style })}
          options={[
            { value: "primary", label: "Primary" },
            { value: "secondary", label: "Secondary" },
            { value: "outline", label: "Outline" },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Alignment</Label>
        <SegmentedControl<BookingButton["align"]>
          value={button.align}
          onChange={(align) => onChange({ ...button, align })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
        />
      </div>
    </div>
  );
}
