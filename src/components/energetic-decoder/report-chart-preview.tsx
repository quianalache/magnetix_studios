"use client";

import { createContext, useContext, type ReactNode } from "react";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { GeneKeysChart } from "@/components/energetic-decoder/gene-keys-chart";
import { REPORT_BUILDER_FIXTURE_READING } from "@/lib/energetics/report-builder-fixture";
import { resolveAstrologyColors } from "@/lib/energetics/astrology-spec";
import { resolveMandalaColors } from "@/lib/energetics/mandala-spec";
import { normalizeCanvasChartPiece, type ElementChartDesigns } from "@/lib/energetics/report-charts";
import type { ChartDesign } from "@/types/chart-design";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import type { CenterKey } from "@/lib/energetics/human-design-data";

/**
 * A chart part drawn with the editor's SAMPLE reading and a saved Chart
 * Design (2026-10-12) — used by the Report Builder canvas and the Charts
 * tool thumbnails, so what you pick is what you see while designing.
 * Real reports draw the person's own reading (report-design-viewer.tsx /
 * the PDF) with the same design. Human Design parts have no outer
 * background panel here, matching the report.
 */

/**
 * The web Full Chart only lays out as [Design | BodyGraph | Personality]
 * at ≥ 804px of container width, so in a report element it is drawn at its
 * natural size and scaled into the element's box (the PDF does the same).
 */
export const FULL_CHART_NATURAL = { width: 840, height: 800 };

/** Draws `children` at a natural size, scaled uniformly to fit `box` (page units) and centered. */
export function FittedHtmlChart({ box, naturalW, naturalH, children }: { box: { width: number; height: number }; naturalW: number; naturalH: number; children: ReactNode }) {
  const scale = Math.max(0.01, Math.min(box.width / naturalW, box.height / naturalH));
  return (
    <div className="relative h-full w-full" data-fitted-chart>
      <div style={{ position: "absolute", left: (box.width - naturalW * scale) / 2, top: (box.height - naturalH * scale) / 2, width: naturalW, height: naturalH, transform: `scale(${scale})`, transformOrigin: "0 0" }}>{children}</div>
    </div>
  );
}

/** The workspace's saved Chart Designs, by set id (loaded once by the editor). */
export const ReportChartDesignSetsContext = createContext<Map<string, ChartDesignSetWithMembers>>(new Map());

export function useReportChartDesignSets() {
  return useContext(ReportChartDesignSetsContext);
}

export function designsOfSet(set: ChartDesignSetWithMembers | undefined | null): ElementChartDesigns | null {
  return set ? { humanDesign: set.designs.humanDesign ?? null, mandala: set.designs.mandala ?? null, astrology: set.designs.astrology ?? null } : null;
}

function centerColors(d: ChartDesign | null | undefined): Partial<Record<CenterKey, string>> | undefined {
  if (!d) return undefined;
  return { head: d.headCenterColor, ajna: d.ajnaCenterColor, throat: d.throatCenterColor, g: d.gCenterColor, heart: d.heartCenterColor, spleen: d.spleenCenterColor, sacral: d.sacralCenterColor, solarplexus: d.solarPlexusCenterColor, root: d.rootCenterColor };
}

export function ReportChartPreview({ piece, designs, box }: { piece: string; designs: ElementChartDesigns | null; box?: { width: number; height: number } }) {
  const r = REPORT_BUILDER_FIXTURE_READING;
  const hd = designs?.humanDesign ?? null;
  const p = normalizeCanvasChartPiece(piece);
  if (p === "astrology-wheel") return <AstrologyWheelChart chart={r.astrology} colors={resolveAstrologyColors(designs?.astrology ?? {})} className="h-full w-full" />;
  if (p === "human-design-mandala") {
    const m = designs?.mandala ?? null;
    return m ? (
      <MandalaChart
        profile={r.humanDesign}
        gateColor={m.chartDefinedColor}
        backgroundColor={m.backgroundColor}
        personalityColor={m.personalityActivationColor}
        designColor={m.designActivationColor}
        zodiacColor={m.mandalaZodiacColor}
        mandalaColors={resolveMandalaColors(m)}
        gateRingColor={m.mandalaGateRingColor}
        quadrantColor={m.mandalaQuadrantColor}
        hdDesign={hd}
        discPanel
        className="h-full w-full"
      />
    ) : (
      <MandalaChart profile={r.humanDesign} gateColor="#c8a7e8" backgroundColor="#fff" mandalaColors={resolveMandalaColors({})} discPanel className="h-full w-full" />
    );
  }
  if (p === "frequency-hologenetic") return <GeneKeysChart spheres={r.spheres} className="h-full w-full" />;
  if (p === "human-design-full-chart") {
    const chart = <HumanDesignFullChart profile={r.humanDesign} design={{ ...(hd ?? {}), backgroundColor: "transparent" } as ChartDesign} />;
    return <FittedHtmlChart box={box ?? FULL_CHART_NATURAL} naturalW={FULL_CHART_NATURAL.width} naturalH={FULL_CHART_NATURAL.height}>{chart}</FittedHtmlChart>;
  }
  if (p === "human-design-gates") return <HumanDesignChart profile={r.humanDesign} className="h-full w-full" />;
  return (
    <HumanDesignChart
      profile={r.humanDesign}
      definedColor={hd?.chartDefinedColor}
      channelsColor={hd?.channelsColor}
      gatesColor={hd?.gatesColor}
      personalityColor={hd?.personalityActivationColor}
      designColor={hd?.designActivationColor}
      backgroundColor="transparent"
      centersMode={hd?.centersMode}
      centerColors={centerColors(hd)}
      className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
    />
  );
}
