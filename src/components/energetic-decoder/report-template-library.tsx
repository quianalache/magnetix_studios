"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ReportCanvasPage } from "@/components/energetic-decoder/report-design-viewer";
import { REPORT_BUILDER_FIXTURE_READING } from "@/lib/energetics/report-builder-fixture";
import type { ShortcodeReadingInput } from "@/lib/energetics/shortcodes";
import type { ChartDesign } from "@/types/chart-design";
import {
  REPORT_TEMPLATES,
  REPORT_TEMPLATE_PAGE_TYPES,
  REPORT_TEMPLATE_STYLE_DOTS,
  REPORT_TEMPLATE_SYSTEMS,
  filterReportTemplates,
  type ReportTemplate,
  type ReportTemplatePageType,
  type ReportTemplateSystem,
} from "@/lib/energetics/report-templates";

/**
 * Template Library (Batch 1, 2026-10-11) — lives inside the Report
 * Builder's existing Templates panel (260px desktop panel; the same
 * component in the phone/tablet Elements sheet). SYSTEM → PAGE TYPE, then
 * search; Blank page pinned; two-column grid of real page thumbnails.
 */

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
        <ReportCanvasPage page={template.page} readingInput={THUMBNAIL_INPUT} mandalaDesign={THUMBNAIL_MANDALA_DESIGN} />
      </div>
    </div>
  );
});

export function ReportTemplateLibrary({
  onInsert,
  onInsertBlank,
  showHeading = false,
}: {
  onInsert: (template: ReportTemplate) => void;
  onInsertBlank: () => void;
  /** The desktop panel already has its own "Templates / Close" header. */
  showHeading?: boolean;
}) {
  const [system, setSystem] = useState<ReportTemplateSystem>("humanDesign");
  const [pageType, setPageType] = useState<ReportTemplatePageType | "All">("All");
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterReportTemplates(REPORT_TEMPLATES, { system, pageType, query }), [system, pageType, query]);
  const chips: (ReportTemplatePageType | "All")[] = ["All", ...REPORT_TEMPLATE_PAGE_TYPES[system]];
  const systemLabel = REPORT_TEMPLATE_SYSTEMS.find((s) => s.key === system)?.label ?? "";

  const emptyMessage = query.trim()
    ? `No templates match “${query.trim()}”.`
    : system === "astrology"
      ? "Astrology templates are coming soon."
      : pageType === "All"
        ? "No templates yet."
        : `No ${pageType} templates yet.`;

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

      <div className="relative -mr-4">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 pr-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-template-chips aria-label={`${systemLabel} page types`}>
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              aria-pressed={pageType === chip}
              onClick={() => setPageType(chip)}
              className={`h-7 shrink-0 whitespace-nowrap rounded-full border px-[11px] text-xs font-semibold ${pageType === chip ? "border-[#5420a8] bg-[#ede9fe] text-[#4c1d95]" : "border-[#e3ddee] bg-white text-[#3f4466] hover:border-violet-200"}`}
            >
              {chip}
            </button>
          ))}
        </div>
        <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-7 w-9 bg-gradient-to-r from-white/0 to-white to-80%" />
      </div>

      <div className="flex items-center gap-2.5 rounded-xl border border-[#ede9fe] px-2.5 py-2" data-template-blank>
        <span aria-hidden className="h-[31px] w-6 shrink-0 rounded-[3px] border-[1.5px] border-dashed border-[#b9a7e3]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-semibold text-[#18204a]">Blank page</span>
          <span className="text-[10.5px] text-[#6b6f8a]">Start from an empty page</span>
        </span>
        <button type="button" onClick={onInsertBlank} className="rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#5b21b6] hover:bg-violet-50">
          Insert
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
            <li key={template.id} className="group flex min-w-0 flex-col gap-[5px]" data-template-card={template.id}>
              <div className="relative overflow-hidden rounded-lg shadow-[0_1px_2px_rgba(24,32,74,0.06)] outline outline-1 -outline-offset-1 outline-[#e4dcf5] transition group-hover:shadow-[0_4px_14px_rgba(84,32,168,0.22)] group-hover:outline-2 group-hover:outline-offset-1 group-hover:outline-[#7c3aed] group-focus-within:outline-2 group-focus-within:outline-offset-1 group-focus-within:outline-[#7c3aed]">
                <ReportTemplateThumbnail template={template} />
                <span aria-hidden className="pointer-events-none absolute inset-0 bg-[#18204a]/10 opacity-0 transition group-hover:opacity-100 lg:block" />
                <button
                  type="button"
                  onClick={() => onInsert(template)}
                  aria-label={`Insert ${template.name}`}
                  className="absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#6d28d9] px-4 py-1.5 text-[11.5px] font-semibold text-white shadow-[0_2px_8px_rgba(24,32,74,0.25)] transition focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  Insert
                </button>
              </div>
              <span className="text-xs font-semibold leading-tight text-[#18204a]">{template.name}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-[10.5px] leading-[14px] text-[#6b6f8a]" data-template-meta>
                <span>{template.pageType}</span>
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
    </div>
  );
}
