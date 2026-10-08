import type { ReportPage, ReportCanvasElement } from "./report-blocks";
import type { ChartDesign } from "./chart-design";

/**
 * A generated report record — Phase 2 Build Plan §7/§9 (approved
 * recommendation: metadata + a frozen resolved-content snapshot, no
 * permanent PDF file in V1; PDF bytes stream on demand from this
 * snapshot once export exists — see the Build Plan's later tasks). Data
 * layer only in this task: no UI surfaces this yet, and nothing calls
 * `createGeneratedReport` yet — this task just makes the record type and
 * the service that produces/reads it real and testable.
 *
 * `snapshot` mirrors exactly what `ReportDesignViewer` would have shown
 * at generation time: pages already filtered by `visibleIf` (using the
 * same Chart Rule engine), and every text block's shortcodes already
 * resolved against that specific reading — the "frozen, not silently
 * re-derived" contract the Build Plan called for, so a later edit to the
 * template or a later change to the reading's content doesn't retroactively
 * change what this record says was delivered. Non-text blocks (image/
 * video/button/chart/divider/spacer) pass through unchanged — they don't
 * depend on shortcode resolution, and chart pieces still render live off
 * the reading's own real HD/Astrology data (readings are themselves
 * immutable once created, per this codebase's existing convention), so
 * there's no need to duplicate that data into every generated report.
 */
export interface GeneratedReport {
  id: string;
  subAccountId: string;
  agencyId: string;
  reportDesignId: string;
  /** Snapshotted at generation time — the template may be renamed or deleted later without changing what this record says it was generated from. */
  reportDesignTitleAtGeneration: string;
  readingId: string;
  /** Null only if the reading somehow has no linked contact — shouldn't happen in practice (EnergeticDecoderReading.contactId is required), kept nullable defensively rather than assumed. */
  contactId: string | null;
  /**
   * Phase 3 Task 7 (2026-08-13) — copied from the source Reading's own
   * `profileId` at generation time, same "resolve once, snapshot the
   * relationship" convention as `contactId` above. Optional/nullable for
   * backward compatibility: every GeneratedReport created before this
   * task predates `profileId` entirely (Reading itself didn't have one
   * until Task 2) — `undefined`/`null` both mean "not yet known," never
   * "no profile." Relationship metadata only — never read by snapshot
   * resolution, PDF rendering, or any Phase 2 behavior.
   */
  profileId?: string | null;
  generatedAt: string | null;
  generatedBy: string;
  snapshot: {
    pages: ReportPage[];
    layoutVersion?: 1 | 2;
    contentSetId?: string | null;
    resolvedElements?: Record<string, ReportCanvasElement[]>;
    /**
     * The chart styling frozen with this report (unified Chart Designs,
     * 2026-10). Absent on reports generated before styling was frozen —
     * those keep resolving the reading's current designs live, exactly as
     * they always have, until the one-time freeze script records their
     * current appearance (`source: "frozen-at-migration"`).
     */
    chartStyles?: GeneratedReportChartStyles;
  };
}

/**
 * Plain copies of the chart designs a report was rendered with — never
 * references. A later edit to (or deletion of) the source designs can't
 * change these values.
 */
export interface GeneratedReportChartStyles {
  /** "generation" = captured when the report was generated. "frozen-at-migration" = captured later from the report's then-current appearance; the original generation-time styling was never recorded for these reports. */
  source: "generation" | "frozen-at-migration";
  frozenAt: string;
  /** The unified Chart Design every system resolved from, when they all came from one (null = legacy/mixed resolution). */
  setId: string | null;
  setName: string | null;
  humanDesign: ChartDesign | null;
  mandala: ChartDesign | null;
  astrology: ChartDesign | null;
  /** Reserved — Frequency styling isn't designable yet. */
  frequency: null;
}
