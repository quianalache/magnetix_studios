"use client";

import { useState } from "react";
import type { ReportDesign, ReportPage, ReportBlock } from "@/types/report-blocks";
import { resolveShortcodes, type ShortcodeReadingInput } from "@/lib/energetics/shortcodes";
import { evaluateChartRule, type ChartRuleReadingInput } from "@/lib/energetics/chart-rules";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";

/**
 * Renders a saved Report Design against one specific reading — the piece
 * that was genuinely missing (2026-08-09): the Report Builder could design
 * a page, but nothing ever actually delivered that design to a real
 * reader. Every real block type (text/image/video/button/chart/divider/
 * spacer) is handled here, shortcodes resolved per-reading, pages filtered
 * by their real `visibleIf` condition instead of always showing everything.
 */
export function ReportDesignViewer({
  design,
  readingInput,
  ruleInput,
  definedColor,
}: {
  design: ReportDesign;
  readingInput: ShortcodeReadingInput;
  ruleInput: ChartRuleReadingInput;
  definedColor: string;
}) {
  const visiblePages = design.pages.filter((p) => !p.visibleIf || evaluateChartRule(p.visibleIf, ruleInput));
  const [pageIndex, setPageIndex] = useState(0);
  const [popupBlockId, setPopupBlockId] = useState<string | null>(null);

  if (visiblePages.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Nothing in this report applies to this reading yet.
      </p>
    );
  }
  const page: ReportPage = visiblePages[Math.min(pageIndex, visiblePages.length - 1)];
  const popupBlock = popupBlockId ? page.blocks.find((b) => b.id === popupBlockId) : null;

  return (
    <div className="space-y-4">
      {visiblePages.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visiblePages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPageIndex(i)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                i === pageIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-6">
        {page.title && <h2 className="mb-4 text-lg font-semibold">{page.title}</h2>}
        <div className="flex flex-wrap gap-4">
          {page.blocks.map((block) => (
            <div key={block.id} style={{ width: `${block.widthPct}%` }} className="min-w-0">
              <ReportBlockView
                block={block}
                readingInput={readingInput}
                definedColor={definedColor}
                onNextPage={() => setPageIndex((i) => Math.min(i + 1, visiblePages.length - 1))}
                onOpenPopup={setPopupBlockId}
              />
            </div>
          ))}
        </div>
      </div>

      {popupBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPopupBlockId(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setPopupBlockId(null)} className="float-right text-sm text-muted-foreground hover:text-foreground">
              Close
            </button>
            <ReportBlockView block={popupBlock} readingInput={readingInput} definedColor={definedColor} onNextPage={() => {}} onOpenPopup={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReportBlockView({
  block,
  readingInput,
  definedColor,
  onNextPage,
  onOpenPopup,
}: {
  block: ReportBlock;
  readingInput: ShortcodeReadingInput;
  definedColor: string;
  onNextPage: () => void;
  onOpenPopup: (blockId: string) => void;
}) {
  const align = "align" in block ? block.align : "left";
  const textAlignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

  switch (block.type) {
    case "text":
      return (
        <div
          className={`text-sm leading-relaxed ${textAlignClass}`}
          // Shortcodes resolved server-side already produce plain text/simple
          // HTML from the editor's own textarea — same trust level as the
          // rest of this app's rich-text fields (Broadcasts blocks use the
          // same pattern).
          dangerouslySetInnerHTML={{ __html: resolveShortcodes(block.html, readingInput) }}
        />
      );
    case "image":
      // eslint-disable-next-line @next/next/no-img-element -- practitioner-supplied URL, not a local/optimizable asset
      return <img src={block.url} alt={block.alt} className="w-full rounded-lg" />;
    case "video":
      return (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe src={block.url} className="h-full w-full" allowFullScreen title={block.id} />
        </div>
      );
    case "button":
      if (block.action.kind === "url") {
        return (
          <a
            href={block.action.href}
            target={block.action.newTab ? "_blank" : undefined}
            rel={block.action.newTab ? "noopener noreferrer" : undefined}
            className={`inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ${textAlignClass}`}
          >
            {block.label}
          </a>
        );
      }
      if (block.action.kind === "nextPage") {
        return (
          <button type="button" onClick={onNextPage} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {block.label}
          </button>
        );
      }
      return (
        <button type="button" onClick={() => onOpenPopup(block.action.kind === "popup" ? block.action.blockId : "")} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {block.label}
        </button>
      );
    case "chart":
      return <ChartPieceView piece={block.piece} readingInput={readingInput} definedColor={definedColor} />;
    case "divider":
      return <hr className="border-border" />;
    case "spacer":
      return <div style={{ height: block.heightPx }} />;
    default:
      return null;
  }
}

function ChartPieceView({
  piece,
  readingInput,
  definedColor,
}: {
  piece: "human-design-full" | "human-design-mandala" | "human-design-gates" | "astrology-wheel";
  readingInput: ShortcodeReadingInput;
  definedColor: string;
}) {
  const hd = readingInput.humanDesign as HumanDesignProfile | null | undefined;
  const astro = readingInput.astrology as AstrologyChart | null | undefined;

  switch (piece) {
    case "human-design-full":
      return hd ? <HumanDesignChart profile={hd} definedColor={definedColor} /> : <MissingPiece label="Human Design chart" />;
    case "human-design-gates":
      return hd ? (
        <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-3">
          {hd.activatedGates.map((g) => (
            <span key={g} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]">{g}</span>
          ))}
        </div>
      ) : (
        <MissingPiece label="Activated gates" />
      );
    case "astrology-wheel":
      return astro ? <AstrologyWheelChart chart={astro} /> : <MissingPiece label="Astrology wheel" />;
    case "human-design-mandala":
      return (
        <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
          Mandala chart isn&apos;t built yet — real gap, not this reading&apos;s fault. See the Build Log.
        </div>
      );
    default:
      return null;
  }
}

function MissingPiece({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
      {label} isn&apos;t part of this reading.
    </p>
  );
}
