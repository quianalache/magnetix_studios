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
/** "Other" exists only on templates users save (no chip of its own; listed under Mine). */
export type ReportTemplatePageType = "Cover" | "About Me" | "Chart" | "Summary" | "Type" | "Center" | "Channel" | "Gate" | "Table" | "Other";

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
  /** Set on templates the user saved (report-page-templates.ts); absent on built-in Magnetix templates. */
  saved?: { id: string; createdAt: string | null };
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

/** The page-type chips of a system, plus the pinned "Mine" chip at the end. */
export type ReportTemplateFilter = ReportTemplatePageType | "All" | "Mine";

/**
 * Templates for one system, optionally one page type ("All" = every type;
 * "Mine" = every template the user saved for this system, newest first),
 * matching every word of the search across name, system, page type, style
 * tag and — for saved templates — "mine" (case-insensitive).
 *
 * Order: page type (the chip order; "Other" last), then within a type the
 * user's saved templates (newest first) before the built-in ones (library
 * order).
 */
export function filterReportTemplates(
  templates: readonly ReportTemplate[],
  opts: { system: ReportTemplateSystem; pageType: ReportTemplateFilter; query?: string },
): ReportTemplate[] {
  const words = (opts.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const order: string[] = REPORT_TEMPLATE_PAGE_TYPES[opts.system];
  const typeRank = (t: ReportTemplate) => (order.includes(t.pageType) ? order.indexOf(t.pageType) : order.length);
  const newest = (a: ReportTemplate, b: ReportTemplate) => (b.saved?.createdAt ?? "").localeCompare(a.saved?.createdAt ?? "");
  const index = new Map(templates.map((t, i) => [t, i]));
  return templates
    .filter((t) => t.system === opts.system)
    .filter((t) => (opts.pageType === "All" ? true : opts.pageType === "Mine" ? !!t.saved : t.pageType === opts.pageType))
    .filter((t) => {
      if (words.length === 0) return true;
      const hay = [t.name, reportTemplateSystemLabel(t.system), t.pageType, t.styleTag ?? "", t.saved ? "mine" : ""].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => {
      if (opts.pageType === "Mine") return newest(a, b);
      return typeRank(a) - typeRank(b) || Number(!a.saved) - Number(!b.saved) || (a.saved && b.saved ? newest(a, b) : index.get(a)! - index.get(b)!);
    });
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
