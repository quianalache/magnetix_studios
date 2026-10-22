"use client";

import { useState } from "react";
import { ArrowRight, Check, Download, FileText, Loader2, Mail, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeaturedOfferPayload, FeaturedOfferPresentation, ReadingBlockContext } from "@/types/reading-blocks";

/**
 * Next-step Reading blocks (2026-10-21) — Featured Offer, the MyMagnetix
 * button, PDF and Reading Report buttons. Every link comes from
 * `ctx.access`, built server-side for this Reading; these components never
 * construct an access link themselves.
 */

// ── Featured Offer ─────────────────────────────────────────────────────

/**
 * Any Magnetix Offer — a course, sessions, a project, a membership, a
 * premium Reading. The creator styles the presentation; price, billing
 * terms, what it includes and the checkout link always come from the Offer,
 * so the page can never promise something checkout doesn't.
 */
export function FeaturedOfferCard({
  offer,
  presentation,
  accent,
  inBuilder = false,
}: {
  offer: FeaturedOfferPayload;
  presentation: FeaturedOfferPresentation;
  accent: string;
  inBuilder?: boolean;
}) {
  const headline = presentation.headline || offer.title;
  const body = presentation.body || offer.summary;
  const cta = presentation.ctaLabel || "Learn more";
  const image = presentation.imageUrl || offer.thumbnailUrl;
  const layout = presentation.layout;
  const price = (
    <div className="space-y-0.5">
      <p className="text-lg font-semibold text-foreground">{offer.priceLabel}</p>
      {offer.billingNote && <p className="text-xs text-muted-foreground">{offer.billingNote}</p>}
    </div>
  );
  const grants =
    offer.grants.length > 0 ? (
      <ul className="space-y-1">
        {offer.grants.map((g) => (
          <li key={g} className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="min-w-0 break-words">{g}</span>
          </li>
        ))}
      </ul>
    ) : null;
  const button = (
    <a
      href={offer.href}
      target="_top"
      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
      style={{ backgroundColor: accent }}
      data-featured-offer-cta
    >
      {cta}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
  const badge = presentation.badge ? (
    <span className="inline-flex w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: accent }}>
      {presentation.badge}
    </span>
  ) : null;
  const draftNote =
    inBuilder && !offer.published ? (
      <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800">This Offer is a Draft — visitors won’t see this block until it’s published.</p>
    ) : null;

  if (layout === "banner") {
    return (
      <div data-featured-offer="banner" className="rounded-2xl border bg-card p-5 sm:p-6">
        {draftNote}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-1.5">
            {badge}
            <p className="text-lg font-semibold text-pretty text-foreground">{headline}</p>
            {body && <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            {price}
            {button}
          </div>
        </div>
      </div>
    );
  }

  if (layout === "sideBySide") {
    return (
      <div data-featured-offer="sideBySide" className="overflow-hidden rounded-2xl border bg-card">
        {draftNote}
        <div className="grid md:grid-cols-2">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="aspect-video h-full w-full object-cover md:aspect-auto" />
          ) : (
            <div className="hidden bg-muted md:block" />
          )}
          <div className="space-y-3 p-5 sm:p-6">
            {badge}
            <p className="text-xl font-semibold text-pretty text-foreground">{headline}</p>
            {body && <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>}
            {grants}
            {price}
            {button}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-featured-offer="card" className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border bg-card">
      {draftNote}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="aspect-video w-full object-cover" />
      )}
      <div className="space-y-3 p-5 sm:p-6">
        {badge}
        <p className="text-xl font-semibold text-pretty text-foreground">{headline}</p>
        {body && <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>}
        {grants}
        <div className="flex flex-wrap items-end justify-between gap-3">
          {price}
          {button}
        </div>
      </div>
    </div>
  );
}

export function FeaturedOfferBlock({
  ctx,
  offerId,
  presentation,
}: {
  ctx: ReadingBlockContext;
  offerId: string;
  presentation: FeaturedOfferPresentation;
}) {
  const offer = offerId ? ctx.offers[offerId] : null;
  const inBuilder = ctx.mode === "sample" || ctx.mode === "preview";
  // Visitors only ever see a published Offer.
  if (!offer || (!offer.published && !inBuilder)) return null;
  return <FeaturedOfferCard offer={offer} presentation={presentation} accent={ctx.accent} inBuilder={inBuilder} />;
}

// ── MyMagnetix ─────────────────────────────────────────────────────────

/**
 * The permanent home for this Reading. Clicking never signs anyone in by
 * itself: an already-signed-in owner goes straight to the Reading;
 * everyone else is emailed a one-time sign-in link at the Reading's own
 * address and sees "check your email".
 */
export function MyMagnetixCta({
  ctx,
  pass,
  label = "Open your Reading in MyMagnetix",
  helper = "First time here? Check your email to finish setting up access.",
  align = "center",
}: {
  ctx: ReadingBlockContext;
  /** The result pass when the page holds it in memory (Standard Result); else the server reads its cookie. */
  pass?: string | null;
  label?: string;
  helper?: string;
  align?: "left" | "center";
}) {
  const mm = ctx.access.myMagnetix;
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "sent"; masked: string | null } | { kind: "error"; message: string }>({ kind: "idle" });
  if (!mm) return null;

  const staffRehearsal = ctx.mode === "sample" || ctx.mode === "preview";

  async function go() {
    if (!mm?.actionUrl || staffRehearsal) return;
    setState({ kind: "busy" });
    try {
      const res = await fetch(mm.actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: ctx.reading.id, pass: pass ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { action?: string; url?: string; maskedEmail?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
      if (data.action === "open" && data.url) {
        // Leave an iframe install for the full tab when the browser allows it.
        try {
          (window.top ?? window).location.href = data.url;
        } catch {
          window.location.href = data.url;
        }
        return;
      }
      setState({ kind: "sent", masked: data.maskedEmail ?? mm.maskedEmail });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong. Try again." });
    }
  }

  return (
    <div data-reading-block="mymagnetix" className={cn("flex w-full flex-col gap-2", align === "center" ? "items-center text-center" : "items-start")}>
      {state.kind === "sent" ? (
        <div role="status" className="w-full max-w-md rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="flex items-center justify-center gap-1.5 font-semibold text-foreground">
            <Mail className="h-4 w-4" />
            Check your email
          </p>
          <p className="mt-1 text-muted-foreground">
            We sent a link to {state.masked ?? "your email"}. Open it on this device to see your Reading in MyMagnetix.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={go}
          disabled={state.kind === "busy" || staffRehearsal}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-80"
          style={{ backgroundColor: ctx.accent }}
        >
          {state.kind === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {label}
        </button>
      )}
      {state.kind !== "sent" && helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      {staffRehearsal && <p className="text-xs text-muted-foreground">Preview — a real visitor gets a sign-in link at the email they entered.</p>}
      {state.kind === "error" && <p className="text-xs text-destructive">{state.message}</p>}
    </div>
  );
}

// ── PDF + Reading Report ───────────────────────────────────────────────

const SECONDARY = "inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50";

/** Builder sample: show the button so it can be placed and styled, without a link. */
function SampleButton({ icon: Icon, label, note }: { icon: typeof Download; label: string; note: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={cn(SECONDARY, "pointer-events-none opacity-80")} aria-disabled>
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground">{note}</span>
    </div>
  );
}

export function PdfButton({ ctx, label = "Download PDF" }: { ctx: ReadingBlockContext; label?: string }) {
  if (ctx.mode === "sample") return <SampleButton icon={Download} label={label} note="Visitors download their own Reading as a PDF." />;
  if (!ctx.access.pdfHref) return null;
  return (
    <a href={ctx.access.pdfHref} target="_top" className={SECONDARY} data-reading-block="pdf">
      <Download className="h-4 w-4" />
      {label}
    </a>
  );
}

export function ReadingReportButton({ ctx, label = "View your Reading Report" }: { ctx: ReadingBlockContext; label?: string }) {
  if (ctx.mode === "sample") {
    return <SampleButton icon={FileText} label={label} note="Shown only for Readings not saved to MyMagnetix — otherwise MyMagnetix is their home." />;
  }
  // Only when MyMagnetix isn't this Reading's permanent home.
  if (!ctx.access.reportHref || ctx.access.myMagnetix) return null;
  return (
    <a href={ctx.access.reportHref} target="_top" className={SECONDARY} data-reading-block="report">
      <FileText className="h-4 w-4" />
      {label}
    </a>
  );
}
