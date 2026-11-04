"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { BookingExperience } from "@/components/booking/public-booking-view";
import { ButtonRender } from "@/components/pages-funnels/puck/elements";
import { normalizeBookingBlock, type BookingBlockProps } from "@/lib/pages-funnels/booking-block";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import type { BookingBlockPayload } from "@/lib/booking/public-payload";
import type { PuckPageMetadata, StyleConfig } from "@/types/pages-funnels-puck";

/**
 * Booking block (Wave 2B-2) — embeds an EXISTING Magnetix Booking Page in a
 * Pages & Funnels page. No booking logic lives here: the embedded flow is
 * the booking engine's own `BookingExperience` (availability, timezone,
 * intake form, booking request, confirmation — the same component the
 * standalone booking page renders), and Button only links to the Booking
 * Page's public URL (the canonical `booking` destination).
 *
 * Contexts:
 *  - builder (`editing`): real availability, but the final submit is an
 *    explained no-op and the button has no link — authoring can't book.
 *  - Preview (staff): same — real availability, no appointment.
 *  - published: the real flow. A missing / draft / foreign Booking Page, or
 *    no Booking Page chosen, renders nothing for visitors.
 */
/** What both config variants receive (stored props are read leniently). */
export interface BookingRenderProps {
  id: string;
  bookingPageSlug?: unknown;
  displayMode?: unknown;
  display?: unknown;
  button?: unknown;
  style?: StyleConfig;
  metadata?: PuckPageMetadata;
}

export type BookingRenderContext = "builder" | "preview" | "published";
export type BookingResolveState = { status: "loading" | "error" } | { status: "done"; payload: BookingBlockPayload | null };

export const BOOKING_DISABLED_IN_BUILDER = "Bookings can't be made in the editor. Publish the page and book from the live page.";
export const BOOKING_DISABLED_IN_PREVIEW = "This is a preview — bookings are only taken on the published page.";

export function BookingBlockView({
  id,
  props: rawProps,
  style,
  context,
  resolution,
}: {
  id: string;
  props: Partial<BookingBlockProps> | Record<string, unknown>;
  style?: StyleConfig;
  context: BookingRenderContext;
  resolution: BookingResolveState;
}) {
  const props = normalizeBookingBlock(rawProps);
  const editing = context === "builder";
  const responsiveCss = resolveResponsiveCss(id, style);
  const payload = resolution.status === "done" ? resolution.payload : null;
  // Visitors never see an unconnected, missing, draft or unresolved block.
  if (context === "published" && (!payload || payload.status !== "published")) return null;

  let body: React.ReactNode;
  if (!props.bookingPageSlug) {
    body = context === "builder" ? <BookingConnectState /> : null;
  } else if (resolution.status === "loading") {
    body = (
      <div className="border-border text-muted-foreground flex h-32 items-center justify-center gap-2 rounded-2xl border border-dashed text-sm" data-booking-state="loading">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading booking page…
      </div>
    );
  } else if (!payload) {
    body =
      context === "published" ? null : (
        <BookingNotice tone="warning" state={resolution.status === "error" ? "error" : "missing"}>
          {resolution.status === "error"
            ? "The booking page couldn't be loaded. Check your connection and try again."
            : "This booking page was deleted or isn't in this workspace. Choose another booking page in Settings."}
        </BookingNotice>
      );
  } else {
    const draftNotice =
      payload.status === "draft" && context !== "published" ? (
        <BookingNotice tone="warning" state="draft">
          &ldquo;{payload.page.name}&rdquo; is a draft booking page — visitors won&apos;t see this block until it&apos;s published in Booking.
        </BookingNotice>
      ) : null;
    const content =
      props.displayMode === "button" ? (
        <ButtonRender
          id={`${id}-button`}
          text={props.button.label}
          action={{ type: "url", url: payload.href }}
          style={props.button.style}
          alignment={props.button.align}
          editing={editing}
        />
      ) : (
        <BookingExperience
          subAccountId={payload.subAccountId}
          page={payload.page}
          branding={payload.branding}
          display={props.display}
          embedded
          bookingDisabledReason={context === "builder" ? BOOKING_DISABLED_IN_BUILDER : context === "preview" ? BOOKING_DISABLED_IN_PREVIEW : null}
        />
      );
    body = (
      <div className="space-y-3">
        {draftNotice}
        {content}
      </div>
    );
  }
  if (!body) return null;

  return (
    <div id={id} data-booking-block="" data-booking-mode={props.displayMode} style={resolveBaseStyleProps(style)}>
      {responsiveCss && <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />}
      {body}
    </div>
  );
}

/** Builder-only empty state (never rendered for visitors). */
function BookingConnectState() {
  return (
    <div className="border-border bg-muted/30 flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center" data-booking-state="unset">
      <span className="bg-background text-muted-foreground flex size-10 items-center justify-center rounded-full border" aria-hidden="true">
        <CalendarClock className="size-5" />
      </span>
      <p className="text-foreground text-sm font-semibold">Connect a Booking Page</p>
      <p className="text-muted-foreground max-w-sm text-xs">
        Choose an existing Magnetix booking page in Settings → Booking Page to show its calendar and availability here.
      </p>
    </div>
  );
}

function BookingNotice({ tone, state, children }: { tone: "warning"; state: string; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${tone === "warning" ? "border-amber-500/40 bg-amber-500/10 text-amber-800" : ""}`}
      data-booking-state={state}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Builder canvas variant: resolves the Booking Page through the member-only,
 * page-anchored `resolve-booking` route (the workspace is the page's own).
 */
export function BookingElementClientRender({ id, style, metadata, ...rest }: BookingRenderProps) {
  const props = normalizeBookingBlock(rest);
  const pageId = metadata?.pageId ?? "";
  const slug = props.bookingPageSlug;
  const [resolution, setResolution] = useState<BookingResolveState>({ status: "loading" });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setResolution({ status: "loading" });
    fetch(`/api/pages-funnels/puck/resolve-booking?pageId=${encodeURIComponent(pageId)}&slugs=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : res.status === 404 ? { bookings: {} } : Promise.reject(res.status)))
      .then((data: { bookings?: Record<string, BookingBlockPayload | null> }) => {
        if (!cancelled) setResolution({ status: "done", payload: data.bookings?.[slug] ?? null });
      })
      .catch(() => {
        if (!cancelled) setResolution({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, pageId]);

  return <BookingBlockView id={id} props={props} style={style} context="builder" resolution={resolution} />;
}
