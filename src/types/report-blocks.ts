import type { ChartRuleCondition } from "@/lib/energetics/chart-rules";

/**
 * Report Blocks — the shared page/canvas format underneath both the new
 * Energetic Decoder Report Builder and (later) Funnels. Decided 2026-08-09
 * after actually logging into her real Bodygraph account and reading its
 * Reading Reports editor: one block schema, two consumers — a human
 * dragging blocks by hand, or AI generating the same block list from a
 * prompt (see [[project-funnels-deferred]]). This file is that schema.
 *
 * Deliberately an ORDERED FLOW of blocks (like Webflow's simple mode /
 * Systeme.io / Unbounce), not free x/y canvas positioning the way
 * Bodygraph's own editor does it — full freeform placement (drag anywhere,
 * resize, collision/snap handling) is real, separate UI complexity that
 * can layer on top of this later if it's ever worth it. An ordered list
 * with per-block width/alignment covers everything a report or a funnel
 * page actually needs to say.
 */

export type ReportBlockType =
  | "text"
  | "image"
  | "video"
  | "button"
  | "chart"
  | "divider"
  | "spacer";

export type ReportElementType = ReportBlockType | "shape" | "frame" | "graphic" | "shortcode" | "upload";

export type ReportPageSize = "letter" | "a4" | "custom";

export interface ReportGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface ReportElementStyle {
  opacity?: number;
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "none";
  borderRadius?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  align?: ReportBlockAlign;
  lineHeight?: number;
  letterSpacing?: number;
}

export interface ReportCanvasElement {
  id: string;
  type: ReportElementType;
  geometry: ReportGeometry;
  style?: ReportElementStyle;
  locked?: boolean;
  hidden?: boolean;
  zIndex: number;
  /** Element-specific payload. Kept JSON-safe for Firestore and PDF adapters. */
  payload: Record<string, unknown>;
}

export type ReportBlockAlign = "left" | "center" | "right";

interface ReportBlockBase {
  id: string;
  type: ReportBlockType;
  /** Percent width within the page column, 25-100 in steps of 25 — lets two/three/four blocks share a row via consecutive blocks summing to 100. */
  widthPct: 25 | 50 | 75 | 100;
}

/** Rich text. `html` may contain Shortcode tokens (see shortcodes.ts) — resolved per-reading at render time, not at save time, so one design serves every reader. */
export interface TextBlock extends ReportBlockBase {
  type: "text";
  html: string;
  align: ReportBlockAlign;
}

export interface ImageBlock extends ReportBlockBase {
  type: "image";
  url: string;
  alt: string;
}

export interface VideoBlock extends ReportBlockBase {
  type: "video";
  /** Embeddable URL (YouTube/Vimeo/etc.) — resolved to an iframe at render time. */
  url: string;
}

export type ButtonAction =
  | { kind: "url"; href: string; newTab: boolean }
  | { kind: "nextPage" }
  | { kind: "popup"; blockId: string };

export interface ButtonBlock extends ReportBlockBase {
  type: "button";
  label: string;
  action: ButtonAction;
}

/** Which real chart piece to drop in — mirrors Bodygraph's "Chart Parts" panel (full chart / mandala overlay / gates legend), confirmed 2026-08-09 against her real account. "frequency-hologenetic" added 2026-08-15 (Phase 5) — real gap found in that pass: Frequency had no Report Builder chart-block option at all, only Human Design and Astrology did. */
export type ChartPieceKind = "human-design-full" | "human-design-mandala" | "human-design-gates" | "astrology-wheel" | "frequency-hologenetic";

export interface ChartBlock extends ReportBlockBase {
  type: "chart";
  piece: ChartPieceKind;
}

export interface DividerBlock extends ReportBlockBase {
  type: "divider";
}

export interface SpacerBlock extends ReportBlockBase {
  type: "spacer";
  heightPx: number;
}

export type ReportBlock =
  | TextBlock
  | ImageBlock
  | VideoBlock
  | ButtonBlock
  | ChartBlock
  | DividerBlock
  | SpacerBlock;

export interface ReportPage {
  id: string;
  title: string;
  /** Mirrors Bodygraph's per-page "Visible for everyone" toggle — a page can be conditionally shown, same Chart Rule condition model as course-lesson gating (see chart-rules.ts). Null = always visible. */
  visibleIf: ChartRuleCondition | null;
  blocks: ReportBlock[];
  /** New canvas representation. Legacy pages retain `blocks` for compatibility. */
  elements?: ReportCanvasElement[];
  locked?: boolean;
  pageBackground?: string;
}

/**
 * A saved report design — the Energetic Decoder equivalent of Bodygraph's
 * "Reading Reports" list. One sub-account can have many (a free lead
 * magnet, a paid deep-dive, etc.), same as her real "YouTube By Design" /
 * "Gene Keys" / "Midnight Dunes" library.
 */
export interface ReportDesign {
  id: string;
  subAccountId: string;
  agencyId: string;
  title: string;
  status?: "draft" | "active";
  layoutVersion?: 1 | 2;
  pageSize?: ReportPageSize;
  customPageSize?: { width: number; height: number } | null;
  pages: ReportPage[];
  /**
   * Content Sets (2026-10-07) — which Content Set this design draws its
   * interpretation text from. Absent/null = the built-in Default (every
   * design made before Content Sets). Picking a set in the Report Builder
   * is a later release; the field exists so "Used in" counts are real.
   */
  contentSetId?: string | null;
  brand?: { logoUrl?: string | null; accentColor?: string; backgroundColor?: string; fontFamily?: string } | null;
  /**
   * ISO string, not a raw Firestore Timestamp — resolved server-side
   * (report-design-service.ts's `toDesign`) before this ever reaches a
   * caller. Same reasoning as ChartDesign's createdAt/updatedAt
   * (chart-design.ts) — this type also crosses into a Client Component
   * (ReportDesignViewer, at /decoder/[saId]/report/[readingId]/design/
   * [reportId]) where a raw Timestamp/FieldValue throws. Fixed alongside
   * that bug, 2026-08-11, since it's the identical latent failure on the
   * same public-decoder boundary, just not yet hit in practice.
   */
  createdAt: string | null;
  updatedAt: string | null;
}

export function emptyReportDesign(): Pick<ReportDesign, "pages"> {
  return {
    pages: [{ id: crypto.randomUUID(), title: "Page 1", visibleIf: null, blocks: [], elements: [] }],
  };
}
