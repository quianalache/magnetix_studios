"use client";

import { useState, type CSSProperties } from "react";
import type { ReportDesign, ReportPage, ReportBlock, ReportCanvasElement, ChartPieceKind } from "@/types/report-blocks";
import { resolveShortcodes, type ShortcodeReadingInput } from "@/lib/energetics/shortcodes";
import { evaluateChartRule, type ChartRuleReadingInput } from "@/lib/energetics/chart-rules";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { resolveAstrologyColors } from "@/lib/energetics/astrology-spec";
import { resolveMandalaColors } from "@/lib/energetics/mandala-spec";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { GeneKeysChart } from "@/components/energetic-decoder/gene-keys-chart";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import type { ChartDesign } from "@/types/chart-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";

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
  hdDesign,
  mandalaDesign,
  astroDesign,
}: {
  design: ReportDesign;
  readingInput: ShortcodeReadingInput;
  ruleInput: ChartRuleReadingInput;
  /** Full Chart Design set (2026-08-09 rebuild) — each independently optional, same "falls back to traditional base" rule as reading-summary.tsx's consumers. */
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
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
        {page.elements && page.elements.length > 0 ? (
          <div className="relative overflow-hidden bg-white" style={{ width: "100%", aspectRatio: "8.5 / 11", minHeight: 760 }}>
            {[...page.elements].sort((a, b) => a.zIndex - b.zIndex).filter((e) => !e.hidden).map((element) => (
              <CanvasElementView key={element.id} element={element} readingInput={readingInput} hdDesign={hdDesign} mandalaDesign={mandalaDesign} astroDesign={astroDesign} />
            ))}
          </div>
        ) : <div className="flex flex-wrap gap-4">
          {page.blocks.map((block) => (
            <div key={block.id} style={{ width: `${block.widthPct}%` }} className="min-w-0">
              <ReportBlockView
                block={block}
                readingInput={readingInput}
                hdDesign={hdDesign}
                mandalaDesign={mandalaDesign}
                astroDesign={astroDesign}
                onNextPage={() => setPageIndex((i) => Math.min(i + 1, visiblePages.length - 1))}
                onOpenPopup={setPopupBlockId}
              />
            </div>
          ))}
        </div>}
      </div>

      {popupBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPopupBlockId(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setPopupBlockId(null)} className="float-right text-sm text-muted-foreground hover:text-foreground">
              Close
            </button>
            <ReportBlockView
              block={popupBlock}
              readingInput={readingInput}
              hdDesign={hdDesign}
              mandalaDesign={mandalaDesign}
              astroDesign={astroDesign}
              onNextPage={() => {}}
              onOpenPopup={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CanvasElementView({ element, readingInput, hdDesign, mandalaDesign, astroDesign }: { element: ReportCanvasElement; readingInput: ShortcodeReadingInput; hdDesign?: ChartDesign | null; mandalaDesign?: ChartDesign | null; astroDesign?: ChartDesign | null }) {
  const text = element.type === "shortcode" ? `{{${String(element.payload.token ?? "full_name")}}}` : String(element.payload.text ?? "");
  const resolved = element.type === "shortcode" ? resolveShortcodes(text, readingInput) : text;
  const style: CSSProperties = {
    position: "absolute", left: `${(element.geometry.x / 816) * 100}%`, top: `${(element.geometry.y / 1056) * 100}%`, width: `${(element.geometry.width / 816) * 100}%`, height: `${(element.geometry.height / 1056) * 100}%`, transform: `rotate(${element.geometry.rotation ?? 0}deg)`, opacity: element.style?.opacity ?? 1, color: element.style?.color || "#18204a", fontSize: element.style?.fontSize || 14, fontWeight: element.style?.fontWeight || 400, textAlign: element.style?.align || "left", background: element.type === "shape" || element.type === "frame" ? element.style?.backgroundColor || "#efe7ff" : undefined, border: element.style?.borderWidth ? `${element.style.borderWidth}px ${element.style.borderStyle || "solid"} ${element.style.borderColor || "#d8c5f5"}` : undefined, borderRadius: element.style?.borderRadius || 0, padding: 10, overflow: "hidden",
  };
  if (element.type === "image" || element.type === "upload") {
    const url = String(element.payload.url ?? "");
    return url ? <img src={url} alt={String(element.payload.alt ?? element.payload.title ?? "Report image")} style={{ ...style, objectFit: String(element.payload.fit ?? "cover") as CSSProperties["objectFit"] }} /> : <div style={style} className="flex items-center justify-center bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 text-xs text-violet-800">Choose an image asset</div>;
  }
  if (element.type === "chart") return <div style={style}><ChartPieceView piece={String(element.payload.piece ?? "human-design-full") as ChartPieceKind} readingInput={readingInput} hdDesign={hdDesign} mandalaDesign={mandalaDesign} astroDesign={astroDesign} /></div>;
  return <div style={style} className="whitespace-pre-wrap break-words">{resolved || (element.type === "graphic" ? "Energetic Decoder graphic" : element.type === "shape" || element.type === "frame" ? "" : "Add text")}</div>;
}

function ReportBlockView({
  block,
  readingInput,
  hdDesign,
  mandalaDesign,
  astroDesign,
  onNextPage,
  onOpenPopup,
}: {
  block: ReportBlock;
  readingInput: ShortcodeReadingInput;
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
  onNextPage: () => void;
  onOpenPopup: (blockId: string) => void;
}) {
  const align = "align" in block ? block.align : "left";
  const textAlignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

  switch (block.type) {
    case "text":
      return (
        // Security fix (2026-10-07): rendered as escaped TEXT, never as
        // HTML. Shortcodes inject reading data — on the public decoder that
        // includes a visitor-typed name and birth place — so raw HTML here
        // was a stored-XSS path. The PDF already treats this field as plain
        // text (report-design-pdf-document.tsx), so web and PDF now match.
        <div className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${textAlignClass}`}>
          {resolveShortcodes(block.html, readingInput)}
        </div>
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
      return (
        <ChartPieceView
          piece={block.piece}
          readingInput={readingInput}
          hdDesign={hdDesign}
          mandalaDesign={mandalaDesign}
          astroDesign={astroDesign}
        />
      );
    case "divider":
      return <hr className="border-border" />;
    case "spacer":
      return <div style={{ height: block.heightPx }} />;
    default:
      return null;
  }
}

/**
 * Phase 4 correctness pass (2026-08-15) — this call site was silently
 * dropping `centersMode`/`centerColors`, so a sub-account with "Enable
 * Traditional Centers Colors" turned on in Chart Designs would see that
 * mode correctly in the Chart Designs preview and in the exported PDF
 * (both already build this same map — see reading-pdf-document.tsx's
 * identical derivation), but a real delivered report would silently fall
 * back to uniform mode instead. Mirrors that existing derivation exactly,
 * not a new convention.
 */
function centerColorsFromDesign(design: ChartDesign | null | undefined): Partial<Record<CenterKey, string>> | undefined {
  if (!design) return undefined;
  return {
    head: design.headCenterColor,
    ajna: design.ajnaCenterColor,
    throat: design.throatCenterColor,
    g: design.gCenterColor,
    heart: design.heartCenterColor,
    spleen: design.spleenCenterColor,
    sacral: design.sacralCenterColor,
    solarplexus: design.solarPlexusCenterColor,
    root: design.rootCenterColor,
  };
}

function ChartPieceView({
  piece,
  readingInput,
  hdDesign,
  mandalaDesign,
  astroDesign,
}: {
  piece: "human-design-full" | "human-design-mandala" | "human-design-gates" | "astrology-wheel" | "frequency-hologenetic";
  readingInput: ShortcodeReadingInput;
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
}) {
  const hd = readingInput.humanDesign as HumanDesignProfile | null | undefined;
  const astro = readingInput.astrology as AstrologyChart | null | undefined;
  const spheres = readingInput.spheres;

  switch (piece) {
    case "human-design-full":
      return hd ? (
        <HumanDesignChart
          profile={hd}
          definedColor={hdDesign?.chartDefinedColor}
          channelsColor={hdDesign?.channelsColor}
          gatesColor={hdDesign?.gatesColor}
          personalityColor={hdDesign?.personalityActivationColor}
          designColor={hdDesign?.designActivationColor}
          backgroundColor={hdDesign?.backgroundColor}
          centersMode={hdDesign?.centersMode}
          centerColors={centerColorsFromDesign(hdDesign)}
        />
      ) : (
        <MissingPiece label="Human Design chart" />
      );
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
      return astro ? (
        <AstrologyWheelChart
          chart={astro}
          colors={resolveAstrologyColors(astroDesign)}
        />
      ) : (
        <MissingPiece label="Astrology wheel" />
      );
    case "human-design-mandala":
      // Real, built 2026-08-09 — was a genuine gap (Bodygraph's API doesn't
      // expose Mandala data), now drawn locally from the same verified
      // GATE_WHEEL_ORDER the gate-line calculation already depends on.
      // Only renders once a Mandala Chart Design exists for this
      // sub-account, same "real field or absent" rule as everywhere else.
      return hd && mandalaDesign ? (
        <MandalaChart
          profile={hd}
          gateColor={mandalaDesign.chartDefinedColor}
          backgroundColor={mandalaDesign.backgroundColor}
          personalityColor={mandalaDesign.personalityActivationColor}
          designColor={mandalaDesign.designActivationColor}
          zodiacColor={mandalaDesign.mandalaZodiacColor}
            mandalaColors={resolveMandalaColors(mandalaDesign)}
          gateRingColor={mandalaDesign.mandalaGateRingColor}
          quadrantColor={mandalaDesign.mandalaQuadrantColor}
          hdDesign={hdDesign}
        />
      ) : (
        <MissingPiece label="Mandala chart" />
      );
    case "frequency-hologenetic":
      // Added 2026-08-15 (Phase 5) — real gap: Frequency had no Report
      // Builder chart-block option at all before this. Same shared
      // GeneKeysChart component the Readings tab and public report page
      // already use, so a report design's Frequency block always matches
      // what the reading itself shows.
      return spheres && spheres.length > 0 ? (
        <GeneKeysChart spheres={spheres} />
      ) : (
        <MissingPiece label="Frequency profile" />
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
