"use client";

import { CalendarClock, Clock } from "lucide-react";
import { tenantBrandStyle, type TenantDisplayFont } from "@/lib/brand/tenant-brand";
import { PoweredByMagnetix } from "@/components/brand/powered-by-magnetix";

/**
 * Live preview of the public booking page's tenant branding (approved
 * Section 4.8 "What the tenant controls"). A miniature of the real page built
 * from the SAME tenant-surface classes and tenantBrandStyle(), so what the
 * operator sees here is what visitors get: logo + name lockup, accent on the
 * selected day / available days / chosen time / Next, the display font, and
 * the soft wash derived from the accent. Structure is fixed — only branding
 * varies. Static sample dates; no data is read.
 */
export function BookingAppearancePreview({
  name,
  logoUrl,
  accentColor,
  displayFont,
  pageTitle,
  durationMinutes,
}: {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  displayFont: TenantDisplayFont | null;
  pageTitle: string;
  durationMinutes: number;
}) {
  const style = tenantBrandStyle({ name, logoUrl, primary: accentColor, displayFont });
  const available = new Set([14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28]);
  const selected = 15;
  const days = Array.from({ length: 35 }, (_, i) => i - 3); // month starts on a Thursday

  return (
    <div
      aria-label="Booking page preview"
      role="img"
      className="tenant-surface tenant-wash overflow-hidden rounded-xl border p-4 select-none"
      style={style}
    >
      <div className="mb-3 flex items-center justify-center gap-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-6 w-auto max-w-[120px] rounded object-contain" />
        ) : (
          <>
            <span className="tenant-mark flex size-6 items-center justify-center rounded-full">
              <CalendarClock className="size-3" />
            </span>
            <span className="tenant-display truncate text-sm">{name}</span>
          </>
        )}
      </div>

      <div className="tenant-card grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.7fr)] overflow-hidden text-overline leading-tight">
        <div className="tenant-divider flex flex-col gap-1.5 border-r p-2.5">
          <p className="truncate text-muted-foreground">{name}</p>
          <p className="tenant-display text-body-sm leading-tight">{pageTitle || "Discovery call"}</p>
          <p className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-2.5" /> {durationMinutes} minutes
          </p>
        </div>
        <div className="p-2.5">
          <p className="mb-1.5 font-semibold">October</p>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {days.map((d, i) =>
              d < 1 || d > 31 ? (
                <span key={i} />
              ) : (
                <span
                  key={i}
                  className={
                    d === selected
                      ? "tenant-button rounded py-0.5 font-semibold"
                      : available.has(d)
                        ? "tenant-soft rounded py-0.5 font-semibold"
                        : "py-0.5 text-muted-foreground/70"
                  }
                >
                  {d}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="tenant-divider flex flex-col gap-1 border-l p-2">
          <p className="mb-0.5 font-semibold">Thu, Oct 15</p>
          <span className="tenant-choice rounded py-1 text-center font-semibold">9:00 AM</span>
          <span className="flex gap-0.5">
            <span className="tenant-choice tenant-choice-picked flex-1 rounded py-1 text-center font-semibold">10:30</span>
            <span className="tenant-button flex-1 rounded py-1 text-center font-semibold">Next</span>
          </span>
          <span className="tenant-choice rounded py-1 text-center font-semibold">1:00 PM</span>
        </div>
      </div>

      <div className="mt-3 flex justify-center [&_p]:text-overline">
        <PoweredByMagnetix />
      </div>
    </div>
  );
}
