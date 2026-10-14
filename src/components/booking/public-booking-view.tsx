"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Globe,
  Info,
} from "lucide-react";
import type { BookingPage, IntakeField } from "@/types/booking";
import { readAttributionFromBrowser } from "@/lib/attribution";
import { tenantBrandStyle } from "@/lib/brand/tenant-brand";
import { PoweredByMagnetix } from "@/components/brand/powered-by-magnetix";
import { AttributionVisitLogger } from "@/components/attribution/visit-logger";

/**
 * Visitor-facing booking surface. Self-contained client component:
 * fetches availability, lets the visitor pick a day + time, collects
 * intake fields, and posts to the book endpoint.
 *
 * Slice 3 ships the picker + intake form; the submit currently shows a
 * "wired up next" placeholder. Slice 4 hooks it up to
 * POST /api/booking/[saId]/[slug]/book.
 *
 * Times are computed server-side in the page's timezone but RENDERED in
 * the visitor's browser timezone (detected at mount). A small dropdown
 * lets the visitor switch back to the page's tz if they prefer.
 */

type SlotISO = { startAt: string; endAt: string };

interface Branding {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
}

interface Props {
  subAccountId: string;
  page: Omit<BookingPage, "createdAt" | "updatedAt"> & {
    createdAt: null;
    updatedAt: null;
  };
  branding: Branding;
}

function detectBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isoDayKeyInTz(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatTimeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatShortDayInTz(dayKey: string, tz: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(anchor);
}

export function PublicBookingView({ subAccountId, page, branding }: Props) {
  const pageTz = page.timezone;
  const [viewerTz, setViewerTz] = useState(pageTz);
  const [slots, setSlots] = useState<SlotISO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotISO | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    status: "scheduled" | "awaiting_payment";
    paymentUrl: string | null;
    confirmationMessage: string | null;
    redirectUrl: string | null;
  } | null>(null);

  // Detect the visitor's timezone after hydration. The server renders
  // with `pageTz` so the markup is stable across hydration; the swap
  // happens on the client only.
  useEffect(() => {
    const detected = detectBrowserTz();
    if (detected !== pageTz) setViewerTz(detected);
  }, [pageTz]);

  // Fetch availability on mount. No date params — `computeAvailability`
  // already defaults to "now → now + page.visibleDays".
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/booking/${subAccountId}/${page.slug}/availability`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Couldn't load availability.");
        }
        const data = (await res.json()) as { slots: SlotISO[] };
        if (cancelled) return;
        setSlots(data.slots);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Load failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId, page.slug]);

  // Bucket slots by day in the viewer's tz. Re-derives when viewerTz
  // changes — the same UTC instant can sit on different calendar days
  // for visitors in different zones.
  const slotsByDay = useMemo(() => {
    const groups = new Map<string, SlotISO[]>();
    for (const s of slots) {
      const key = isoDayKeyInTz(s.startAt, viewerTz);
      const bucket = groups.get(key);
      if (bucket) bucket.push(s);
      else groups.set(key, [s]);
    }
    return [...groups.entries()]
      .map(([dateKey, list]) => ({ dateKey, slots: list }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [slots, viewerTz]);

  // First load: open the first day with slots.
  useEffect(() => {
    if (activeDay !== null) return;
    if (slotsByDay.length === 0) return;
    setActiveDay(slotsByDay[0].dateKey);
  }, [slotsByDay, activeDay]);

  const activeDaySlots = useMemo(
    () => slotsByDay.find((d) => d.dateKey === activeDay)?.slots ?? [],
    [slotsByDay, activeDay],
  );

  // Month calendar (approved Section 4.8 layout): the months that contain
  // availability, one at a time. Day keys are YYYY-MM-DD in the viewer's tz.
  const availableDays = useMemo(() => new Set(slotsByDay.map((d) => d.dateKey)), [slotsByDay]);
  const months = useMemo(() => [...new Set(slotsByDay.map((d) => d.dateKey.slice(0, 7)))], [slotsByDay]);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const shownMonth = monthKey && months.includes(monthKey) ? monthKey : (activeDay?.slice(0, 7) ?? months[0] ?? null);
  const monthIdx = shownMonth ? months.indexOf(shownMonth) : -1;
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => setTodayKey(isoDayKeyInTz(new Date().toISOString(), viewerTz)), [viewerTz]);

  const intakeRef = useRef<HTMLDivElement>(null);
  function pickDay(key: string) {
    setActiveDay(key);
    setSelectedSlot(null);
  }

  // Tenant brand (design-system tenant boundary, 2026-10-14): the booking
  // page's accent becomes the surface's --brand-primary; tenantBrandStyle()
  // computes readable on-primary text and a contrast-safe text variant, so a
  // light accent can't produce unreadable buttons. No accent = neutral.
  const brandStyle = tenantBrandStyle({
    name: branding.name,
    logoUrl: branding.logoUrl,
    primary: branding.accentColor,
  });
  const initials = branding.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main
      className="tenant-surface tenant-wash flex min-h-screen flex-col px-4 py-8 text-foreground sm:py-10"
      style={brandStyle}
    >
      <AttributionVisitLogger
        subAccountId={subAccountId}
        pageType="booking"
        pageId={page.slug}
      />

      {/* ── Tenant brand lockup — the business leads the page ── */}
      <div className="mx-auto mb-6 flex items-center justify-center gap-2.5">
        {branding.logoUrl ? (
          // Decorative; alt is the business name.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.name} className="h-10 w-auto max-w-[200px] rounded-md object-contain" />
        ) : (
          <>
            <span className="tenant-mark flex size-9 items-center justify-center rounded-full" aria-hidden="true">
              <CalendarClock className="size-4.5" />
            </span>
            <span className="tenant-display text-title-md">{branding.name}</span>
          </>
        )}
      </div>

      <article className="tenant-card mx-auto w-full max-w-[56.25rem] overflow-hidden">
        {confirmation ? (
          <div className="p-6 sm:p-10">
            <ConfirmationPanel confirmation={confirmation} page={page} />
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-[minmax(0,1fr)_12.5rem] lg:grid-cols-[17.5rem_minmax(0,1fr)_12.5rem]">
              {/* ── Who + what ── */}
              <section className="flex flex-col gap-3.5 border-b p-6 tenant-divider md:col-span-2 lg:col-span-1 lg:border-r lg:border-b-0">
                {branding.logoUrl ? null : (
                  <span className="tenant-soft flex size-11 items-center justify-center rounded-full text-sm font-semibold" aria-hidden="true">
                    {initials}
                  </span>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{branding.name}</p>
                  <h1 className="tenant-display mt-1 text-[1.75rem] leading-[1.1] text-balance">{page.name}</h1>
                </div>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    {page.durationMinutes} minutes
                  </li>
                  {page.payment ? (
                    <li className="flex items-center gap-2">
                      <span className="tenant-soft rounded-full px-2 py-0.5 text-xs font-medium">
                        {page.payment.currency} {page.payment.amount} deposit
                      </span>
                    </li>
                  ) : null}
                  <li className="flex items-center gap-2">
                    <Globe className="size-4 shrink-0" aria-hidden="true" />
                    <label className="sr-only" htmlFor="b-tz">Times shown in</label>
                    <select
                      id="b-tz"
                      value={viewerTz}
                      onChange={(e) => {
                        setViewerTz(e.target.value);
                        setActiveDay(null);
                        setSelectedSlot(null);
                        setMonthKey(null);
                      }}
                      className="min-w-0 max-w-full truncate rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value={viewerTz}>{viewerTz}</option>
                      {pageTz !== viewerTz && <option value={pageTz}>{pageTz}</option>}
                    </select>
                  </li>
                </ul>
                {page.description ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{page.description}</p>
                ) : null}
              </section>

              {/* ── Month calendar ── */}
              <section className="border-b p-6 tenant-divider md:border-b-0" aria-label="Choose a day">
                {loading ? (
                  <div className="flex h-full min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading available times…
                  </div>
                ) : loadError ? (
                  <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-700">
                    {loadError}
                  </div>
                ) : slotsByDay.length === 0 || !shownMonth ? (
                  <p className="flex min-h-56 items-center justify-center text-center text-sm text-muted-foreground">
                    No times available in the next {page.visibleDays} days. Try again soon.
                  </p>
                ) : (
                  <MonthGrid
                    monthKey={shownMonth}
                    available={availableDays}
                    activeDay={activeDay}
                    todayKey={todayKey}
                    onPick={pickDay}
                    onPrev={monthIdx > 0 ? () => setMonthKey(months[monthIdx - 1]) : undefined}
                    onNext={monthIdx >= 0 && monthIdx < months.length - 1 ? () => setMonthKey(months[monthIdx + 1]) : undefined}
                  />
                )}
              </section>

              {/* ── Times for the chosen day ── */}
              <section className="flex flex-col gap-2 p-6 tenant-divider md:border-l md:px-[1.125rem]" aria-label="Choose a time">
                {activeDay && !loading && !loadError ? (
                  <>
                    <h2 className="mb-1.5 text-sm font-semibold">{formatShortDayInTz(activeDay, viewerTz)}</h2>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-col">
                      {activeDaySlots.map((s) => {
                        const isSelected = selectedSlot?.startAt === s.startAt;
                        return isSelected ? (
                          <div key={s.startAt} className="col-span-2 flex gap-1.5 sm:col-span-3">
                            <button
                              type="button"
                              aria-pressed="true"
                              onClick={() => setSelectedSlot(null)}
                              className="tenant-choice tenant-choice-picked min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold tabular-nums"
                            >
                              {formatTimeInTz(s.startAt, viewerTz)}
                            </button>
                            <button
                              type="button"
                              onClick={() => intakeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                              className="tenant-button min-h-11 flex-1 rounded-lg border px-2 text-sm font-semibold"
                            >
                              Next
                            </button>
                          </div>
                        ) : (
                          <button
                            key={s.startAt}
                            type="button"
                            aria-pressed="false"
                            onClick={() => setSelectedSlot(s)}
                            className="tenant-choice min-h-11 rounded-lg px-2 text-sm font-semibold tabular-nums transition"
                          >
                            {formatTimeInTz(s.startAt, viewerTz)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a day to see times.</p>
                )}
              </section>
            </div>

            {/* ── Intake form (revealed after a time is picked) ── */}
            {selectedSlot ? (
              <div ref={intakeRef} className="scroll-mt-6 border-t p-6 sm:p-8 tenant-divider">
                <IntakeFormSection
                  subAccountId={subAccountId}
                  slug={page.slug}
                  slot={selectedSlot}
                  viewerTz={viewerTz}
                  page={page}
                  onConfirmed={(c) => setConfirmation(c)}
                />
              </div>
            ) : null}
          </>
        )}
      </article>

      <footer className="mx-auto mt-auto flex justify-center pt-10">
        <PoweredByMagnetix />
      </footer>
    </main>
  );
}

/** Month grid — available days tinted, the chosen day filled, today outlined. */
function MonthGrid({
  monthKey,
  available,
  activeDay,
  todayKey,
  onPick,
  onPrev,
  onNext,
}: {
  monthKey: string;
  available: Set<string>;
  activeDay: string | null;
  todayKey: string | null;
  onPick: (dayKey: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const title = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`),
  ];
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + i))),
  );
  const navBtn =
    "inline-flex size-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-40";

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-section font-semibold">{title}</h2>
        <span className="flex-1" />
        <button type="button" className={navBtn} onClick={onPrev} disabled={!onPrev} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" className={navBtn} onClick={onNext} disabled={!onNext} aria-label="Next month">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-sm">
        {weekdays.map((w) => (
          <span key={w} className="pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">
            {w}
          </span>
        ))}
        {cells.map((key, i) => {
          if (!key) return <span key={`pad-${i}`} />;
          const day = Number(key.slice(8));
          const isAvailable = available.has(key);
          const isActive = key === activeDay;
          const isToday = key === todayKey;
          const label = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
            new Date(Date.UTC(y, m - 1, day)),
          );
          return (
            <button
              key={key}
              type="button"
              disabled={!isAvailable}
              aria-pressed={isAvailable ? isActive : undefined}
              aria-label={isAvailable ? `${label} — times available` : `${label} — unavailable`}
              onClick={() => onPick(key)}
              className={[
                "flex h-10 items-center justify-center rounded-[10px] tabular-nums transition",
                isActive
                  ? "tenant-button font-semibold"
                  : isAvailable
                    ? "tenant-soft font-semibold hover:brightness-95"
                    : "cursor-default text-muted-foreground/70",
                isToday && !isActive ? "tenant-today" : "",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IntakeFormSection({
  subAccountId,
  slug,
  slot,
  viewerTz,
  page,
  onConfirmed,
}: {
  subAccountId: string;
  slug: string;
  slot: SlotISO;
  viewerTz: string;
  page: Props["page"];
  onConfirmed: (next: {
    status: "scheduled" | "awaiting_payment";
    paymentUrl: string | null;
    confirmationMessage: string | null;
    redirectUrl: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Snapshot on mount, same pattern as the hosted-form flow — before
  // anything could change window.location.
  const attributionRef = useRef(readAttributionFromBrowser());

  function setExtra(id: string, value: string) {
    setExtras((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Name, email, and phone are required.");
      return;
    }
    for (const f of page.intakeFields) {
      if (f.required && !(extras[f.id] ?? "").trim()) {
        setError(`Please answer: ${f.label}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/booking/${subAccountId}/${slug}/book`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slot,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            extras,
            attribution: attributionRef.current,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: "scheduled" | "awaiting_payment";
        paymentUrl?: string | null;
        confirmationMessage?: string | null;
        redirectUrl?: string | null;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Booking failed. Please try again.");
      }
      onConfirmed({
        status: data.status ?? "scheduled",
        paymentUrl: data.paymentUrl ?? null,
        confirmationMessage: data.confirmationMessage ?? null,
        redirectUrl: data.redirectUrl ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border bg-muted/30 p-3 text-center text-sm">
        <span className="font-medium">
          {new Intl.DateTimeFormat(undefined, {
            timeZone: viewerTz,
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(slot.startAt))}
        </span>
        <span className="text-muted-foreground"> · {page.durationMinutes} min</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="b-name" required>
          <input
            id="b-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={120}
            required
          />
        </Field>
        <Field label="Email" htmlFor="b-email" required>
          <input
            id="b-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={200}
            required
          />
        </Field>
        <Field label="Phone" htmlFor="b-phone" required className="sm:col-span-2">
          <input
            id="b-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={40}
            required
          />
        </Field>
      </div>

      {page.intakeFields.length > 0 && (
        <div className="space-y-3">
          {page.intakeFields.map((f) => (
            <ExtraField
              key={f.id}
              field={f}
              value={extras[f.id] ?? ""}
              onChange={(v) => setExtra(f.id, v)}
            />
          ))}
        </div>
      )}

      {page.payment && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            A {page.payment.currency} {page.payment.amount}
            {page.payment.description ? ` ${page.payment.description.toLowerCase()}` : ""}{" "}
            is required to confirm this booking. You&apos;ll see the PayPal
            link on the next screen.
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="tenant-button inline-flex h-11 w-full items-center justify-center border px-3 text-sm font-medium transition disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Booking…
          </>
        ) : page.payment ? (
          "Continue to payment"
        ) : (
          "Confirm booking"
        )}
      </button>
    </form>
  );
}

// Seconds the confirmation panel stays visible before an auto-redirect
// fires — long enough for the booking to visibly succeed + any pixel on
// this page to fire, short enough to feel like a hand-off.
const REDIRECT_COUNTDOWN_SECONDS = 3;

function ConfirmationPanel({
  confirmation,
  page,
}: {
  confirmation: {
    status: "scheduled" | "awaiting_payment";
    paymentUrl: string | null;
    confirmationMessage: string | null;
    redirectUrl: string | null;
  };
  page: Props["page"];
}) {
  const pending = confirmation.status === "awaiting_payment";

  // Auto-redirect only for confirmed (non-pending) bookings carrying a
  // redirect URL. Pending/paid holds never redirect (defense-in-depth on
  // top of the server already nulling redirectUrl for them) so the
  // PayPal CTA stays put.
  const willRedirect = !pending && !!confirmation.redirectUrl;
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!willRedirect || !confirmation.redirectUrl) return;
    const target = confirmation.redirectUrl;
    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const go = setTimeout(() => {
      // replace() so the back button returns to the booker's origin, not
      // the just-submitted confirmation screen.
      window.location.replace(target);
    }, REDIRECT_COUNTDOWN_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [willRedirect, confirmation.redirectUrl]);

  return (
    <section
      className={`space-y-3 rounded-2xl border p-5 text-center text-sm ${
        pending
          ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      }`}
    >
      <CheckCircle2 className="mx-auto h-6 w-6" />
      <p className="font-medium">
        {pending ? "Almost there — pay to confirm" : "You're booked."}
      </p>
      {confirmation.confirmationMessage && !pending && (
        <p className="whitespace-pre-wrap text-xs">
          {confirmation.confirmationMessage}
        </p>
      )}
      {pending && (
        <p className="text-xs">
          Your slot is held. Pay the deposit below to lock it in. We&apos;ll
          email a confirmation as soon as we see the payment. If you
          don&apos;t pay within {page.payment?.holdHours ?? 24} hours the
          slot is released automatically.
        </p>
      )}
      {pending && confirmation.paymentUrl && (
        <a
          href={confirmation.paymentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-lg border bg-foreground px-5 text-sm font-medium text-background transition"
        >
          Pay {page.payment?.currency} {page.payment?.amount} on PayPal
        </a>
      )}
      <p className="text-xs">
        We&apos;ve also emailed you with all the details.
      </p>
      {willRedirect && confirmation.redirectUrl && (
        <p className="text-xs">
          Redirecting you in {secondsLeft}s…{" "}
          <a
            href={confirmation.redirectUrl}
            className="underline underline-offset-2"
          >
            Go now
          </a>
        </p>
      )}
    </section>
  );
}

function ExtraField({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = `b-q-${field.id}`;
  return (
    <Field label={field.label} htmlFor={id} required={field.required}>
      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={2000}
          required={field.required}
          className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Pick one…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          required={field.required}
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      )}
    </Field>
  );
}

function Field({
  label,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
