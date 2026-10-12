import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import type { ChartPieceKind, ReportCanvasElement, ReportElementType, ReportPage } from "@/types/report-blocks";

/**
 * Report Builder Charts tool (2026-10-12) — the user's saved Chart Designs,
 * organized the way the BodyGraph reference organizes its Chart Parts
 * (capability structure only): Human Design → My Full Charts · Charts ·
 * Mandala Charts · Gates · Arrows · Backgrounds; Astrology → Charts.
 *
 * Two separate ideas on a chart element:
 *   - the chart PART / format (`payload.piece`), chosen by the section;
 *   - the saved Chart Design (`payload.chartDesignSetId`), chosen by the
 *     card. Designs come from the existing Chart Designs system (one set =
 *     Human Design + Mandala + Astrology records); nothing is copied or
 *     stored twice. No set id = the reading's own chart design (the
 *     behavior every chart had before this).
 *
 * Rendering surfaces resolve the set to its records and attach them as
 * `payload.chartDesigns` just before drawing (generated reports freeze
 * them into the snapshot). That field is never trusted from a saved page.
 */

export type ReportChartSystem = "humanDesign" | "astrology";

export interface ReportChartSection {
  key: string;
  label: string;
  system: ReportChartSystem;
  /** The chart part inserted from this section; null = not available in Magnetix yet. */
  piece: ChartPieceKind | null;
  /** Shown instead of designs when the part isn't available. */
  unavailableNote?: string;
}

export const REPORT_CHART_SECTIONS: ReportChartSection[] = [
  { key: "full", label: "My Full Charts", system: "humanDesign", piece: "human-design-full-chart" },
  { key: "bodygraph", label: "Charts", system: "humanDesign", piece: "human-design-bodygraph" },
  { key: "mandala", label: "Mandala Charts", system: "humanDesign", piece: "human-design-mandala" },
  { key: "gates", label: "Gates", system: "humanDesign", piece: null, unavailableNote: "Not available yet — the planet activation columns aren't a separate chart part in Magnetix yet." },
  { key: "arrows", label: "Arrows", system: "humanDesign", piece: null, unavailableNote: "Not available yet — the Variable arrows aren't a separate chart part in Magnetix yet." },
  { key: "backgrounds", label: "Backgrounds", system: "humanDesign", piece: null, unavailableNote: "Not available yet." },
  { key: "astrology", label: "Charts", system: "astrology", piece: "astrology-wheel" },
];

export const REPORT_CHART_SYSTEMS: { key: ReportChartSystem; label: string }[] = [
  { key: "humanDesign", label: "Human Design" },
  { key: "astrology", label: "Astrology" },
];

/** Readable names for the chart-piece control in the inspector. */
export const CHART_PIECE_LABELS: Record<Exclude<ChartPieceKind, "frequency-hologenetic">, string> = {
  "human-design-full-chart": "Full Chart",
  "human-design-bodygraph": "Bodygraph",
  "human-design-full": "Bodygraph", // legacy id on canvas elements (rendered as the bodygraph everywhere)
  "human-design-mandala": "Mandala",
  "human-design-gates": "Activated gates (list)",
  "astrology-wheel": "Astrology wheel",
};

/** Which Chart Design record a part is drawn with. */
export function chartPieceDesignSystem(piece: string): ChartDesignSystem {
  if (piece === "astrology-wheel") return "astrology";
  if (piece === "human-design-mandala") return "mandala";
  return "humanDesign";
}

/** Default size (page units) for a freshly inserted part — inside a Letter page with room around it. */
export const CHART_PIECE_DEFAULT_SIZE: Partial<Record<ChartPieceKind, { width: number; height: number }>> = {
  "human-design-full-chart": { width: 680, height: 600 },
  "human-design-bodygraph": { width: 340, height: 520 },
  "human-design-mandala": { width: 480, height: 480 },
  "astrology-wheel": { width: 480, height: 480 },
};

const PAGE_W = 816;
const PAGE_H = 1056;

/** A new, normal Chart element for a section's part + a saved design — centered on the page. */
export function newChartElement(opts: { id: string; piece: ChartPieceKind; chartDesignSetId: string | null; zIndex: number }): ReportCanvasElement {
  const size = CHART_PIECE_DEFAULT_SIZE[opts.piece] ?? { width: 340, height: 340 };
  return {
    id: opts.id,
    type: "chart" as ReportElementType,
    zIndex: opts.zIndex,
    geometry: { x: Math.round((PAGE_W - size.width) / 2), y: Math.round((PAGE_H - size.height) / 2), width: size.width, height: size.height, rotation: 0 },
    style: { borderWidth: 0, borderStyle: "none", opacity: 1 },
    payload: opts.chartDesignSetId ? { piece: opts.piece, chartDesignSetId: opts.chartDesignSetId } : { piece: opts.piece },
  };
}

export interface ElementChartDesigns {
  humanDesign: ChartDesign | null;
  mandala: ChartDesign | null;
  astrology: ChartDesign | null;
}

/** The saved design records attached to an element for rendering (see header), or null to use the reading's design. */
export function elementChartDesigns(element: Pick<ReportCanvasElement, "payload">): ElementChartDesigns | null {
  const d = element.payload?.chartDesigns as Partial<ElementChartDesigns> | undefined;
  if (!d || typeof d !== "object") return null;
  return { humanDesign: d.humanDesign ?? null, mandala: d.mandala ?? null, astrology: d.astrology ?? null };
}

export function elementChartDesignSetId(element: Pick<ReportCanvasElement, "payload">): string | null {
  const id = element.payload?.chartDesignSetId;
  return typeof id === "string" && id ? id : null;
}

/** The legacy canvas id "human-design-full" always meant the bodygraph in the editor and web report; it now means that in the PDF too. */
export function normalizeCanvasChartPiece(piece: string): string {
  return piece === "human-design-full" ? "human-design-bodygraph" : piece;
}

/** Every saved-design set id referenced by a chart element on these pages. */
export function chartDesignSetIdsOf(pages: ReportPage[]): string[] {
  return [...new Set(pages.flatMap((p) => (p.elements ?? []).filter((e) => e.type === "chart").map((e) => elementChartDesignSetId(e)).filter((x): x is string => !!x)))];
}

/**
 * Pure half of attachReportChartDesigns (server): drops any incoming
 * `payload.chartDesigns` and attaches the resolved set's records. A set id
 * missing from `sets` attaches nothing (the reading's own design is used).
 */
export function attachChartDesignsFromSets(pages: ReportPage[], sets: Map<string, ChartDesignSetWithMembers>): ReportPage[] {
  return pages.map((page) => ({
    ...page,
    elements: page.elements?.map((e) => {
      if (e.type !== "chart") return e;
      const { chartDesigns: _ignored, ...payload } = e.payload ?? {};
      void _ignored;
      const id = elementChartDesignSetId(e);
      const set = id ? sets.get(id) : undefined;
      if (!set) return { ...e, payload };
      return { ...e, payload: { ...payload, chartDesigns: { humanDesign: set.designs.humanDesign ?? null, mandala: set.designs.mandala ?? null, astrology: set.designs.astrology ?? null } } };
    }),
  }));
}
