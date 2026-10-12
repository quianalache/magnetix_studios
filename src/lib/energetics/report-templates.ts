import type { ReportCanvasElement, ReportPage } from "@/types/report-blocks";
import type { CenterKey } from "./human-design-data";
import { CENTER_TITLES } from "./shortcodes";
import batch1 from "./report-templates.batch1.json";
import batch2 from "./report-templates.batch2.json";

/**
 * Report Builder Template Library (Batch 1, 2026-10-11).
 *
 * Templates are real Report Builder pages. Their elements come verbatim
 * from the approved reconstruction spec (report-templates.batch1.json is
 * an unmodified subset of template-specs.json), so the mockup, the spec
 * and the shipped page can't drift. Inserting a template clones its page
 * with fresh page + element ids; every element stays a normal, editable
 * element.
 *
 * Organization is SYSTEM → PAGE TYPE. `styleTag` is secondary metadata
 * only: it is shown on the card and matched by search, and is never
 * applied to chart colors — Chart elements keep following the reading's
 * chart design (their payload is only `{ piece }`).
 *
 * Batch 2 (2026-10-12) adds Midnight Horizon and Practitioner Note
 * (unmodified spec pages) and Center Focus — a Center page that works for
 * all nine Centers: inserting it asks which Center the page is about
 * (ReportPage.centerKey), and its title, state and passage are the
 * center_name / center_state / center_text shortcodes. The adaptations
 * from the Sacral-based spec are listed in report-templates.batch2.json.
 */

export type ReportTemplateSystem = "humanDesign" | "astrology";
export type ReportTemplatePageType = "Cover" | "About Me" | "Chart" | "Summary" | "Type" | "Center" | "Channel" | "Gate" | "Table";

export interface ReportTemplate {
  id: string;
  name: string;
  system: ReportTemplateSystem;
  pageType: ReportTemplatePageType;
  styleTag: string | null;
  /** The page as specified (placeholder ids — never inserted directly; see instantiateReportTemplate). */
  page: ReportPage;
  /** A Center page: inserting it needs a Center (the page's centerKey). */
  centerPage?: boolean;
}

export const REPORT_TEMPLATE_SYSTEMS: { key: ReportTemplateSystem; label: string }[] = [
  { key: "humanDesign", label: "Human Design" },
  { key: "astrology", label: "Astrology" },
];

export const REPORT_TEMPLATE_PAGE_TYPES: Record<ReportTemplateSystem, ReportTemplatePageType[]> = {
  humanDesign: ["Cover", "About Me", "Chart", "Summary", "Type", "Center", "Channel", "Gate"],
  astrology: ["Cover", "About Me", "Table"],
};

/** Card dot color for each style tag (decoration on the card only). */
export const REPORT_TEMPLATE_STYLE_DOTS: Record<string, string> = {
  "Magnetix Violet": "#7c3aed",
  Monochrome: "#27272a",
  "Warm Sunset": "#c2410c",
  Midnight: "#818cf8",
};

type SpecTemplate = { id: string; name: string; system: ReportTemplateSystem; pageType: ReportTemplatePageType; styleTag: string | null; reportPage: ReportPage; centerPage?: boolean };

/** Library order = Batch 1 as shipped, then Batch 2 (filtering groups them by page type). */
export const REPORT_TEMPLATES: ReportTemplate[] = [...(batch1.templates as unknown as SpecTemplate[]), ...(batch2.templates as unknown as SpecTemplate[])].map((t) => ({
  id: t.id,
  name: t.name,
  system: t.system,
  pageType: t.pageType,
  styleTag: t.styleTag,
  page: t.reportPage,
  ...(t.centerPage ? { centerPage: true } : {}),
}));

export function reportTemplateSystemLabel(system: ReportTemplateSystem): string {
  return REPORT_TEMPLATE_SYSTEMS.find((s) => s.key === system)?.label ?? system;
}

/**
 * Templates for one system, optionally one page type ("All" = every type),
 * matching every word of the search across name, system, page type and
 * style tag (case-insensitive).
 */
export function filterReportTemplates(
  templates: readonly ReportTemplate[],
  opts: { system: ReportTemplateSystem; pageType: ReportTemplatePageType | "All"; query?: string },
): ReportTemplate[] {
  const words = (opts.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const order = REPORT_TEMPLATE_PAGE_TYPES[opts.system];
  return templates
    .filter((t) => t.system === opts.system && (opts.pageType === "All" || t.pageType === opts.pageType))
    .filter((t) => {
      if (words.length === 0) return true;
      const hay = [t.name, reportTemplateSystemLabel(t.system), t.pageType, t.styleTag ?? ""].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => order.indexOf(a.pageType) - order.indexOf(b.pageType));
}

const newId = () => crypto.randomUUID();

/**
 * A fresh, independent copy of the template's page: new page id, new
 * element ids, everything else exactly as specified. A Center page also
 * gets its Center (required) and is titled after it.
 */
export function instantiateReportTemplate(template: ReportTemplate, makeId: () => string = newId, opts?: { centerKey?: CenterKey | null }): ReportPage {
  if (template.centerPage && !opts?.centerKey) throw new Error(`${template.name} needs a Center`);
  const page = structuredClone(template.page);
  return {
    ...page,
    id: makeId(),
    title: template.centerPage && opts?.centerKey ? CENTER_TITLES[opts.centerKey] : template.name,
    ...(template.centerPage && opts?.centerKey ? { centerKey: opts.centerKey } : {}),
    elements: (page.elements ?? []).map((element): ReportCanvasElement => ({ ...element, id: makeId() })),
  };
}

export const BLANK_PAGE_TITLE = "Blank page";

/** The pinned Blank page: a normal empty page (same shape the old Blank starter inserted). */
export function createBlankReportPage(makeId: () => string = newId): ReportPage {
  return { id: makeId(), title: BLANK_PAGE_TITLE, visibleIf: null, blocks: [], elements: [] };
}
