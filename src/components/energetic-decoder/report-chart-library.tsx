"use client";

import { memo, useMemo, useState } from "react";
import { ArrowLeft, Info, Search } from "lucide-react";
import { ReportChartPreview, designsOfSet } from "@/components/energetic-decoder/report-chart-preview";
import { REPORT_CHART_SECTIONS, REPORT_CHART_SYSTEMS, type ReportChartSection, type ReportChartSystem } from "@/lib/energetics/report-charts";
import type { ChartDesignSetWithMembers } from "@/types/chart-design-set";
import type { ChartPieceKind } from "@/types/report-blocks";

/**
 * Report Builder → Charts (2026-10-12). Inserts the user's SAVED Chart
 * Designs as chart parts; creating/editing designs stays in Chart Designs.
 * Structure follows the BodyGraph reference's Chart Parts (capability only):
 * per-system tabs, search, sections showing three designs with "See all"
 * opening that section's full list in place.
 */

const PREVIEW_COUNT = 3;

/** Natural render size per part (px) and its card thumbnail size. */
const THUMB: Record<string, { natW: number; natH: number; h: number }> = {
  "human-design-full-chart": { natW: 640, natH: 560, h: 62 },
  "human-design-bodygraph": { natW: 200, natH: 320, h: 112 },
  "human-design-mandala": { natW: 320, natH: 320, h: 70 },
  "astrology-wheel": { natW: 320, natH: 320, h: 70 },
};

const ChartThumb = memo(function ChartThumb({ piece, set }: { piece: ChartPieceKind; set: ChartDesignSetWithMembers }) {
  const t = THUMB[piece] ?? { natW: 320, natH: 320, h: 70 };
  const w = 70;
  const scale = Math.min(w / t.natW, t.h / t.natH);
  return (
    <div aria-hidden className="pointer-events-none relative flex items-center justify-center overflow-hidden rounded-md bg-white" style={{ width: "100%", height: t.h }} data-chart-thumb={`${piece}:${set.id}`}>
      <div style={{ width: t.natW, height: t.natH, transform: `scale(${scale})`, transformOrigin: "center", flex: "none" }}>
        <ReportChartPreview piece={piece} designs={designsOfSet(set)} />
      </div>
    </div>
  );
});

export function ReportChartLibrary({
  sets,
  loading,
  error,
  onInsert,
}: {
  sets: ChartDesignSetWithMembers[];
  loading: boolean;
  error: string | null;
  onInsert: (piece: ChartPieceKind, set: ChartDesignSetWithMembers, sectionLabel: string) => void;
}) {
  const [system, setSystem] = useState<ReportChartSystem>("humanDesign");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matching = useMemo(() => (q ? sets.filter((s) => s.name.toLowerCase().includes(q)) : sets), [sets, q]);
  const sections = REPORT_CHART_SECTIONS.filter((s) => s.system === system && (!expanded || s.key === expanded));

  const card = (section: ReportChartSection, set: ChartDesignSetWithMembers) => (
    <li key={`${section.key}:${set.id}`} className="min-w-0">
      <button
        type="button"
        onClick={() => onInsert(section.piece!, set, section.label)}
        aria-label={`Insert ${section.label}: ${set.name}`}
        className="group flex w-full flex-col overflow-hidden rounded-lg border border-[#e4dcf5] bg-white text-left shadow-[0_1px_2px_rgba(24,32,74,0.06)] transition hover:border-violet-400 hover:shadow-[0_4px_14px_rgba(84,32,168,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
        data-chart-card={`${section.key}:${set.id}`}
      >
        <ChartThumb piece={section.piece!} set={set} />
        <span className="truncate border-t border-[#f0eaf9] px-1.5 py-1 text-center text-[11px] font-semibold text-[#18204a]">{set.name}</span>
      </button>
    </li>
  );

  return (
    <div className="space-y-3" data-chart-library>
      <div role="tablist" aria-label="Chart system" className="grid grid-cols-2 gap-1 rounded-xl bg-[#f3effb] p-[3px]">
        {REPORT_CHART_SYSTEMS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={system === s.key}
            onClick={() => {
              setSystem(s.key);
              setExpanded(null);
            }}
            className={`rounded-[9px] py-[7px] text-[12.5px] font-semibold transition ${system === s.key ? "bg-[#5420a8] text-white" : "text-[#5b4a8a] hover:bg-white/70"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">Search chart designs</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[#7a7f99]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chart designs…"
          className="h-[34px] w-full rounded-[10px] border border-[#e3ddee] bg-white pl-[33px] pr-2.5 text-[13px] text-[#18204a] outline-none focus:border-violet-300"
          data-chart-search
        />
      </label>

      {expanded && (
        <button type="button" onClick={() => setExpanded(null)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5b21b6] hover:underline" data-chart-back>
          <ArrowLeft className="h-3.5 w-3.5" /> All chart parts
        </button>
      )}

      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900" data-sample-chart-note>
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Thumbnails and the editor use sample chart data in each saved design. Generated reports draw each person&apos;s own chart in the design you pick.
      </p>

      {loading ? (
        <p className="text-[12px] text-[#6b6f8a]">Loading your Chart Designs…</p>
      ) : error ? (
        <p className="text-[12px] text-red-700">{error}</p>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const list = section.piece ? matching : [];
            const shown = expanded || q ? list : list.slice(0, PREVIEW_COUNT);
            return (
              <section key={section.key} aria-label={section.label} data-chart-section={section.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-[#18204a]">{section.label}</h3>
                  {section.piece && !expanded && !q && list.length > PREVIEW_COUNT && (
                    <button type="button" onClick={() => setExpanded(section.key)} className="text-[11.5px] font-semibold text-[#5b21b6] underline-offset-2 hover:underline" data-chart-see-all={section.key}>
                      See all
                    </button>
                  )}
                </div>
                {!section.piece ? (
                  <p className="rounded-lg border border-dashed border-[#e3ddee] px-2.5 py-2 text-[11px] leading-5 text-[#6b6f8a]" data-chart-unavailable={section.key}>{section.unavailableNote}</p>
                ) : shown.length === 0 ? (
                  <p className="text-[11.5px] text-[#6b6f8a]">{q ? `No chart designs match “${query.trim()}”.` : "No saved Chart Designs yet — create one in Chart Designs."}</p>
                ) : (
                  <ul className="grid grid-cols-3 gap-2">{shown.map((set) => card(section, set))}</ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
