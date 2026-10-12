"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { ReportCanvasPage } from "@/components/energetic-decoder/report-design-viewer";
import { REPORT_BUILDER_FIXTURE_READING } from "@/lib/energetics/report-builder-fixture";
import { CENTER_TITLES, type ShortcodeReadingInput } from "@/lib/energetics/shortcodes";
import { CENTERS, type CenterKey } from "@/lib/energetics/human-design-data";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useReportChartDesignSets } from "@/components/energetic-decoder/report-chart-preview";
import { attachChartDesignsFromSets } from "@/lib/energetics/report-charts";
import type { ChartDesign } from "@/types/chart-design";
import {
  REPORT_TEMPLATES,
  REPORT_TEMPLATE_PAGE_TYPES,
  REPORT_TEMPLATE_STYLE_DOTS,
  REPORT_TEMPLATE_SYSTEMS,
  filterReportTemplates,
  type ReportTemplate,
  type ReportTemplateFilter,
  type ReportTemplateSystem,
} from "@/lib/energetics/report-templates";

/**
 * Template Library (Batch 1, 2026-10-11) — lives inside the Report
 * Builder's existing Templates panel (260px desktop panel; the same
 * component in the phone/tablet Elements sheet). SYSTEM → PAGE TYPE, then
 * search; two-column grid of real page thumbnails. Center page templates
 * (Batch 2) ask which Center the page is about before inserting.
 *
 * Saved page templates (2026-10-12): the user's own templates sit among the
 * built-in ones in their page type, with a small "Mine" badge, and the
 * "Mine" chip — pinned at the end of the chip row so it is always in
 * reach — lists all of them, newest first. Their card keeps Insert; a "⋯"
 * menu adds Rename… / Delete… (never on built-in templates). Blank pages
 * come from Add Page in the page strip, not from here.
 */

/** Thumbnails of Center page templates show this sample Center (the inserted page uses the Center the user picks). */
export const THUMBNAIL_SAMPLE_CENTER: CenterKey = "head";

/** Sample reading for thumbnails only (the editor's existing fixture), plus sample interpretation text so text-heavy pages read as they will. */
const THUMBNAIL_INPUT: ShortcodeReadingInput = {
  ...REPORT_BUILDER_FIXTURE_READING,
  reportContent: {
    strict: true,
    values: {
      "hd:type:Generator": {
        fields: {
          description:
            "Sample interpretation text. In a real report this paragraph comes from the selected Content Set for the person's own Type, so every reading gets its own wording here.",
        },
      },
      [`hd:center:${THUMBNAIL_SAMPLE_CENTER}`]: {
        fields: {
          definedText:
            "Sample interpretation text. In a real report this passage comes from the selected Content Set for the page's Center, in its defined or undefined wording for each reading.",
        },
      },
    },
  },
};

/**
 * Thumbnail-only chart styling: the same neutral look the editor canvas
 * uses for its sample charts (FixtureChart). Never part of a template —
 * real reports draw every chart with the reading's own chart design.
 */
const THUMBNAIL_MANDALA_DESIGN = { chartDefinedColor: "#c8a7e8", backgroundColor: "#ffffff" } as unknown as ChartDesign;

/** A real render of the template's page (same renderer as the published report), scaled to fill its card width. */
export const ReportTemplateThumbnail = memo(function ReportTemplateThumbnail({ template }: { template: ReportTemplate }) {
  const ref = useRef<HTMLDivElement>(null);
  // A saved template's charts keep their saved Chart Design reference: draw them with it (same attach as reports).
  const chartSets = useReportChartDesignSets();
  const page = useMemo(() => {
    const base = template.centerPage ? { ...template.page, centerKey: THUMBNAIL_SAMPLE_CENTER } : template.page;
    return template.saved ? attachChartDesignsFromSets([base], chartSets)[0] : base;
  }, [template, chartSets]);
  const [width, setWidth] = useState(107);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 107);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = width / 816;
  return (
    <div ref={ref} aria-hidden className="pointer-events-none relative w-full overflow-hidden bg-white" style={{ aspectRatio: "816 / 1056" }} data-template-thumbnail={template.id}>
      <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <ReportCanvasPage page={page} readingInput={THUMBNAIL_INPUT} mandalaDesign={THUMBNAIL_MANDALA_DESIGN} imagePlaceholders />
      </div>
    </div>
  );
});

export function ReportTemplateLibrary({
  onInsert,
  savedTemplates = [],
  focus,
  onRename,
  onDelete,
  showHeading = false,
}: {
  onInsert: (template: ReportTemplate, opts?: { centerKey: CenterKey }) => void;
  /** The user's own saved page templates (report-page-templates.ts → savedTemplateToLibrary). */
  savedTemplates?: ReportTemplate[];
  /** After a save: show this system's Mine chip with the new template marked New (nonce re-applies it). */
  focus?: { system: ReportTemplateSystem; highlightId: string; nonce: number } | null;
  onRename?: (template: ReportTemplate) => void;
  onDelete?: (template: ReportTemplate) => void;
  /** The desktop panel already has its own "Templates / Close" header. */
  showHeading?: boolean;
}) {
  const [system, setSystem] = useState<ReportTemplateSystem>(focus?.system ?? "humanDesign");
  const [pageType, setPageType] = useState<ReportTemplateFilter>(focus ? "Mine" : "All");
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(focus?.highlightId ?? null);
  /** A Center page template waiting for its Center. */
  const [choosingCenterFor, setChoosingCenterFor] = useState<ReportTemplate | null>(null);
  useEffect(() => {
    if (!focus) return;
    setSystem(focus.system);
    setPageType("Mine");
    setQuery("");
    setHighlightId(focus.highlightId);
    const t = window.setTimeout(() => setHighlightId(null), 6000);
    return () => window.clearTimeout(t);
  }, [focus]);
  const all = useMemo(() => [...REPORT_TEMPLATES, ...savedTemplates], [savedTemplates]);
  const results = useMemo(() => filterReportTemplates(all, { system, pageType, query }), [all, system, pageType, query]);
  const chips: ReportTemplateFilter[] = ["All", ...REPORT_TEMPLATE_PAGE_TYPES[system]];
  const systemLabel = REPORT_TEMPLATE_SYSTEMS.find((s) => s.key === system)?.label ?? "";

  const emptyMessage = query.trim()
    ? `No templates match “${query.trim()}”.`
    : pageType === "Mine"
      ? `You haven't saved any ${systemLabel} templates yet. Use ⋯ on a page in the page strip → Save as template…`
      : system === "astrology"
        ? "Astrology templates are coming soon."
        : pageType === "All"
          ? "No templates yet."
          : `No ${pageType} templates yet.`;
  const chipClass = (on: boolean) =>
    `h-7 shrink-0 whitespace-nowrap rounded-full border px-[11px] text-xs font-semibold ${on ? "border-[#5420a8] bg-[#ede9fe] text-[#4c1d95]" : "border-[#e3ddee] bg-white text-[#3f4466] hover:border-violet-200"}`;

  return (
    <div className="space-y-3" data-template-library>
      {showHeading && <p className="text-sm font-semibold text-[#18204a]">Templates</p>}

      <div role="tablist" aria-label="System" className="grid grid-cols-2 gap-1 rounded-xl bg-[#f3effb] p-[3px]" data-template-systems>
        {REPORT_TEMPLATE_SYSTEMS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={system === s.key}
            onClick={() => {
              setSystem(s.key);
              setPageType("All");
            }}
            className={`rounded-[9px] py-[7px] text-[12.5px] font-semibold transition ${system === s.key ? "bg-[#5420a8] text-white" : "text-[#5b4a8a] hover:bg-white/70"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">Search templates</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[#7a7f99]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          className="h-[34px] w-full rounded-[10px] border border-[#e3ddee] bg-white pl-[33px] pr-2.5 text-[13px] text-[#18204a] outline-none focus:border-violet-300"
          data-template-search
        />
      </label>

      {/* Page-type chips scroll sideways; Mine is the last chip, pinned so it is always reachable. */}
      <div className="flex items-center gap-1.5" data-template-chip-row>
        <div className="relative min-w-0 flex-1">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 pr-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-template-chips aria-label={`${systemLabel} page types`}>
            {chips.map((chip) => (
              <button key={chip} type="button" aria-pressed={pageType === chip} onClick={() => setPageType(chip)} className={chipClass(pageType === chip)}>
                {chip}
              </button>
            ))}
          </div>
          <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-7 w-9 bg-gradient-to-r from-white/0 to-white to-80%" />
        </div>
        <span aria-hidden className="h-[18px] w-px shrink-0 bg-[#e3ddee]" />
        <button type="button" aria-pressed={pageType === "Mine"} onClick={() => setPageType("Mine")} className={chipClass(pageType === "Mine")} data-template-mine-chip>
          Mine
        </button>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e3ddee] px-3 py-5 text-center text-[12px] text-[#6b6f8a]" data-template-empty>
          <p>{emptyMessage}</p>
          {query.trim() && (
            <button type="button" onClick={() => setQuery("")} className="mt-2 font-semibold text-[#5b21b6] hover:underline">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-4" data-template-grid>
          {results.map((template) => (
            <li key={template.id} className="group relative flex min-w-0 flex-col gap-[5px]" data-template-card={template.id} data-template-saved={template.saved ? "" : undefined}>
              <div className={`relative overflow-hidden rounded-lg shadow-[0_1px_2px_rgba(24,32,74,0.06)] outline outline-1 -outline-offset-1 outline-[#e4dcf5] transition group-hover:shadow-[0_4px_14px_rgba(84,32,168,0.22)] group-hover:outline-2 group-hover:outline-offset-1 group-hover:outline-[#7c3aed] group-focus-within:outline-2 group-focus-within:outline-offset-1 group-focus-within:outline-[#7c3aed] ${highlightId && template.saved?.id === highlightId ? "outline-2 outline-offset-1 outline-[#7c3aed] shadow-[0_0_0_6px_rgba(124,58,237,0.14)]" : ""}`}>
                <ReportTemplateThumbnail template={template} />
                <span aria-hidden className="pointer-events-none absolute inset-0 bg-[#18204a]/10 opacity-0 transition group-hover:opacity-100 lg:block" />
                <button
                  type="button"
                  onClick={() => (template.centerPage ? setChoosingCenterFor(template) : onInsert(template))}
                  aria-label={`Insert ${template.name}`}
                  className="absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#6d28d9] px-4 py-1.5 text-[11.5px] font-semibold text-white shadow-[0_2px_8px_rgba(24,32,74,0.25)] transition focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  Insert
                </button>
                {highlightId && template.saved?.id === highlightId && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-[#5420a8] px-1.5 py-px text-[9px] font-bold text-white" data-template-new>
                    New
                  </span>
                )}
              </div>
              {template.saved && (onRename || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`More actions for ${template.name}`}
                    className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#e4dcf5] bg-white text-[#18204a] shadow-[0_1px_3px_rgba(24,32,74,0.12)] transition focus:opacity-100 data-[popup-open]:border-[#5420a8] data-[popup-open]:bg-[#5420a8] data-[popup-open]:text-white data-[popup-open]:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    data-template-more={template.saved.id}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[140px]">
                    {onRename && (
                      <DropdownMenuItem onClick={() => onRename(template)}>
                        <Pencil className="h-3.5 w-3.5" /> Rename…
                      </DropdownMenuItem>
                    )}
                    {onRename && onDelete && <DropdownMenuSeparator />}
                    {onDelete && (
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(template)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete…
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <span className="text-xs font-semibold leading-tight text-[#18204a]">{template.name}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-[10.5px] leading-[14px] text-[#6b6f8a]" data-template-meta>
                <span>{template.pageType}</span>
                {template.saved && (
                  <span className="inline-flex h-[15px] items-center rounded-full bg-[#f3effb] px-1.5 text-[9.5px] font-bold text-[#5b21b6]" data-template-mine-badge>
                    Mine
                  </span>
                )}
                {template.styleTag && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: REPORT_TEMPLATE_STYLE_DOTS[template.styleTag] ?? "#a1a1aa" }} />
                    {template.styleTag}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!choosingCenterFor} onOpenChange={(open) => !open && setChoosingCenterFor(null)}>
        <DialogContent className="sm:max-w-sm" data-center-chooser>
          <DialogHeader>
            <DialogTitle className="pr-6">Which Center is this page about?</DialogTitle>
            <DialogDescription>
              The page shows that Center&apos;s name, whether it&apos;s defined or undefined, and its interpretation from your Content Set. You can change it later in Page settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CENTERS.map((c) => (
              <button
                key={c}
                type="button"
                data-center-option={c}
                onClick={() => {
                  const t = choosingCenterFor;
                  setChoosingCenterFor(null);
                  if (t) onInsert(t, { centerKey: c });
                }}
                className="rounded-lg border border-[#e3ddee] bg-white px-2 py-2 text-[12.5px] font-semibold text-[#18204a] hover:border-violet-400 hover:bg-violet-50"
              >
                {CENTER_TITLES[c].replace(/ Center$/, "")}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
