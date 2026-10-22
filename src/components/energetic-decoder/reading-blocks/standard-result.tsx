"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  AtAGlanceBlock,
  CentersBlock,
  ChannelsBlock,
  GatesBlock,
  HumanDesignChartBlock,
  SkillsBlock,
  VariablesBlock,
} from "@/components/energetic-decoder/reading-blocks/human-design-blocks";
import {
  AstrologyAspectsBlock,
  AstrologyChartBlock,
  AstrologyHousesBlock,
  AstrologyKeyFactsBlock,
  AstrologyPlacementsBlock,
  GeneKeysBlock,
  MandalaActivationsBlock,
  MandalaBlock,
} from "@/components/energetic-decoder/reading-blocks/chart-blocks";
import { FeaturedOfferCard, MyMagnetixCta, PdfButton, ReadingReportButton } from "@/components/energetic-decoder/reading-blocks/next-step-blocks";
import { AT_A_GLANCE_FACTS, KEY_FACTS, SKILL_LAYERS } from "@/lib/energetic-decoder/reading-block-settings";
import { availableViews, EMBED_VIEW_LABEL } from "@/lib/energetic-decoder/embeds";
import type { EmbedResultView, PublicEmbedConfig } from "@/types/embed-config";
import type { ReadingBlockContext } from "@/types/reading-blocks";

/**
 * The Standard Result (2026-10-21) — the built-in result for beginners, now
 * composed from the SAME Reading blocks a custom Reading Result Page uses,
 * so there's one Centers renderer, one At-a-Glance renderer, one Gates
 * renderer… A "Full result" visibly shows every section down the page — the
 * person should see that they received a lot, not a wall of "…" buttons.
 *
 *   Full result        chart, At a Glance, Centers, Channels, Gates,
 *                      Variables, Skills (and the matching Mandala /
 *                      Astrology sections)
 *   Chart + key facts  the chart and its headline facts
 *   Confirmation only  the thank-you message and buttons
 */

export type EmailOutcome = "sent" | "notSent" | "off" | "preview";

function HumanDesignSections({ ctx, full }: { ctx: ReadingBlockContext; full: boolean }) {
  return (
    <div className="space-y-8">
      <HumanDesignChartBlock ctx={ctx} heading="Your Human Design Chart" />
      <AtAGlanceBlock ctx={ctx} heading="At a Glance" facts={full ? AT_A_GLANCE_FACTS : KEY_FACTS} descriptions={full} />
      {full && (
        <>
          <CentersBlock ctx={ctx} heading="Your Centers" show="definedFirst" />
          <ChannelsBlock ctx={ctx} heading="Your Channels" />
          <GatesBlock ctx={ctx} heading="Your Gates" />
          <VariablesBlock ctx={ctx} heading="Your Variables" />
          <SkillsBlock ctx={ctx} heading="Skills & Attributes" layers={SKILL_LAYERS} />
          <GeneKeysBlock ctx={ctx} heading="Your Gene Keys" />
        </>
      )}
    </div>
  );
}

function MandalaSections({ ctx, full }: { ctx: ReadingBlockContext; full: boolean }) {
  return (
    <div className="space-y-8">
      <MandalaBlock ctx={ctx} heading="Your Mandala" />
      <AtAGlanceBlock ctx={ctx} heading="At a Glance" facts={KEY_FACTS} descriptions={false} />
      {full && (
        <>
          <MandalaActivationsBlock ctx={ctx} heading="Your Activations" />
          <GatesBlock ctx={ctx} heading="Your Gates" />
          <SkillsBlock ctx={ctx} heading="Skills & Attributes" layers={SKILL_LAYERS} />
        </>
      )}
    </div>
  );
}

function AstrologySections({ ctx, full }: { ctx: ReadingBlockContext; full: boolean }) {
  return (
    <div className="space-y-8">
      <AstrologyChartBlock ctx={ctx} heading="Your Natal Chart" />
      <AstrologyKeyFactsBlock ctx={ctx} heading={full ? "Your Big Three & Angles" : "Your Big Three"} angles={full} descriptions={full} />
      {full && (
        <>
          <AstrologyPlacementsBlock ctx={ctx} heading="Your Placements" />
          <AstrologyHousesBlock ctx={ctx} heading="Your Houses" />
          <AstrologyAspectsBlock ctx={ctx} heading="Your Aspects" />
        </>
      )}
    </div>
  );
}

/**
 * The Reading's sections with a system switcher (Human Design / Mandala /
 * Astrology) when there's more than one — shared by the Standard Result and
 * the Reading's permanent page in MyMagnetix.
 */
export function ReadingSections({
  ctx,
  views: requested,
  full,
}: {
  ctx: ReadingBlockContext;
  views: EmbedResultView[];
  full: boolean;
}) {
  const reading = ctx.reading;
  const views = useMemo(
    () => availableViews(requested, { humanDesign: !!reading.humanDesign, astrology: !!reading.astrology }),
    [requested, reading.humanDesign, reading.astrology],
  );
  const [view, setView] = useState<EmbedResultView | null>(views[0] ?? null);
  if (views.length === 0) return null;
  return (
    <div className="space-y-6">
      {views.length > 1 && (
        <div role="tablist" aria-label="Reading views" className="mx-auto flex w-full max-w-md rounded-full border bg-card p-1">
          {views.map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                view === v ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
              style={view === v ? { backgroundColor: ctx.accent } : undefined}
            >
              {EMBED_VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      )}
      {view === "humanDesign" && <HumanDesignSections ctx={ctx} full={full} />}
      {view === "mandala" && <MandalaSections ctx={ctx} full={full} />}
      {view === "astrology" && <AstrologySections ctx={ctx} full={full} />}
    </div>
  );
}

export function StandardResult({
  ctx,
  embed,
  pass,
  emailOutcome,
  email,
}: {
  ctx: ReadingBlockContext;
  embed: PublicEmbedConfig;
  pass: string | null;
  emailOutcome: EmailOutcome;
  /** The visitor's email for the "we've emailed you" line (null in staff modes). */
  email: string | null;
}) {
  const show = embed.afterSubmit.show;
  const full = show === "full";
  const mm = embed.afterSubmit.myMagnetix;
  const nextStep = embed.afterSubmit.nextStep;
  const featured = embed.afterSubmit.featuredOffer;

  const notes: string[] = [];
  if (ctx.mode === "preview") {
    const real = [mm && "saved to MyMagnetix", embed.afterSubmit.email && "emailed a link"].filter(Boolean);
    if (real.length) notes.push(`Preview — a real visitor’s Reading would be ${real.join(" and ")}.`);
  } else {
    if (mm) notes.push("Your Reading is saved in MyMagnetix — your permanent home for it.");
    if (emailOutcome === "sent") notes.push(email ? `We’ve emailed ${email} a link to it.` : "We’ve emailed you a link to it.");
    else if (emailOutcome === "notSent") notes.push(mm ? "We couldn’t send your email just now — use the button below to open it in MyMagnetix." : "We couldn’t send your email just now — open your Reading Report below.");
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-8" data-standard-result={show}>
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div className="space-y-1">
          <p className="font-medium">{embed.afterSubmit.confirmationMessage}</p>
          {notes.map((n) => (
            <p key={n} className="text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      </div>

      {/* The permanent home first — MyMagnetix is the primary next step. */}
      {mm && <MyMagnetixCta ctx={ctx} pass={pass} />}

      {show !== "confirmation" && <ReadingSections ctx={ctx} views={embed.views} full={full} />}

      <div className="space-y-5 border-t pt-6">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {embed.afterSubmit.pdf && <PdfButton ctx={ctx} />}
          <ReadingReportButton ctx={ctx} />
          {nextStep && (
            <a
              href={nextStep.href}
              target="_top"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: ctx.accent }}
            >
              {nextStep.label}
              <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>
        {featured && <FeaturedOfferCard offer={featured.offer} presentation={featured.presentation} accent={ctx.accent} inBuilder={ctx.mode !== "live"} />}
      </div>
      {ctx.mode === "preview" && (
        <p className="text-center text-xs text-muted-foreground">Preview — the PDF, Reading Report and MyMagnetix buttons work after a real or Test submission.</p>
      )}
    </div>
  );
}
