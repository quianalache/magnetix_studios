"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import type { PipelineStage } from "@/types/deals";
import { DEAL_LIST_PAGE_SIZE, type BoardDeal, type DealSort, type DealSortField } from "@/types/pipeline-board";
import { useSubAccount } from "@/context/sub-account-context";
import {
  DataTableShell,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_ROW,
  DATA_TABLE_TD,
  DATA_TABLE_TH,
} from "@/components/system/data-table";
import { Pagination } from "@/components/system/pagination";
import { OptionSelect } from "@/components/system/option-select";
import { EmptyState } from "@/components/system/empty-state";
import { DealPriorityTag } from "@/components/pipeline/deal-priority";
import { StageLabel } from "@/components/pipeline/stage-label";

/**
 * List view of one pipeline (Multiple Pipelines, 2026-09-25). Rows come
 * from the same server query + filter model as the Board; sorting and
 * paging are server-side. Clicking a row opens the deal; the contact name
 * still links to the Contact profile. Wave 4: the approved index-table
 * frame (plum heading band, pagination inside the card).
 */

const COLUMNS: { field: DealSortField | null; label: string; className?: string }[] = [
  { field: "title", label: "Deal" },
  { field: null, label: "Contact" },
  { field: "stage", label: "Stage" },
  { field: "value", label: "Value", className: "text-right" },
  { field: null, label: "Currency" },
  { field: "priority", label: "Priority" },
  { field: "expectedCloseDate", label: "Expected close" },
  { field: "updatedAt", label: "Updated" },
];

const PHONE_SORTS = [
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "value:desc", label: "Value, high to low" },
  { value: "value:asc", label: "Value, low to high" },
  { value: "expectedCloseDate:asc", label: "Closing soonest" },
  { value: "stage:asc", label: "Stage order" },
  { value: "title:asc", label: "Title A–Z" },
];

function formatDay(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function DealListView({
  rows,
  stages,
  sort,
  onSort,
  page,
  pageCount,
  total,
  onPage,
  onOpenDeal,
  loading,
  filtered = false,
}: {
  rows: BoardDeal[];
  stages: PipelineStage[];
  sort: DealSort;
  onSort: (next: DealSort) => void;
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
  onOpenDeal: (deal: BoardDeal) => void;
  loading: boolean;
  /** A search/filter is active (changes the empty-state wording). */
  filtered?: boolean;
}) {
  const { saPath } = useSubAccount();
  const stageOf = (id: string) => {
    const index = stages.findIndex((s) => s.id === id);
    return <StageLabel stageId={id} label={stages[index]?.label ?? id} index={Math.max(0, index)} />;
  };
  const headerClick = (field: DealSortField) =>
    onSort(
      sort.field === field
        ? { field, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "title" || field === "stage" ? "asc" : "desc" },
    );

  const contactLink = (d: BoardDeal) =>
    d.contact ? (
      <Link
        href={saPath(`/contacts/${d.contact.id}`)}
        onClick={(e) => e.stopPropagation()}
        className="hover:text-link hover:underline"
      >
        {d.contact.name || d.contact.email || "Contact"}
      </Link>
    ) : (
      <span className="text-ink-tertiary italic">Unknown</span>
    );

  const pagination =
    pageCount > 1 ? (
      <Pagination
        page={page}
        pageSize={DEAL_LIST_PAGE_SIZE}
        total={total}
        onPageChange={onPage}
        itemLabel={total === 1 ? "deal" : "deals"}
      />
    ) : null;

  if (rows.length === 0 && !loading) {
    return (
      <EmptyState
        compact
        icon={Briefcase}
        title={filtered ? "No deals match these filters" : "No deals in this pipeline yet"}
        description={filtered ? "Try another search or clear the filters." : "Add a deal to start tracking it here."}
      />
    );
  }

  return (
    <div className={cn("min-w-0 space-y-3 transition-opacity", loading && "opacity-60")}>
      {/* Desktop table */}
      <DataTableShell className="hidden md:block" minWidth="56rem" footer={pagination}>
        <thead>
          <tr className={DATA_TABLE_HEAD_ROW}>
            {COLUMNS.map((c) => (
              <th key={c.label} className={cn(DATA_TABLE_TH, c.className)}>
                {c.field ? (
                  <button
                    type="button"
                    onClick={() => headerClick(c.field!)}
                    className="inline-flex items-center gap-1 uppercase hover:text-white"
                    aria-label={`Sort by ${c.label}`}
                  >
                    {c.label}
                    {sort.field === c.field ? (
                      sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                    ) : (
                      <ArrowUpDown className="size-3 opacity-50" />
                    )}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              onClick={() => onOpenDeal(d)}
              onKeyDown={(e) => e.key === "Enter" && onOpenDeal(d)}
              tabIndex={0}
              className={cn(DATA_TABLE_ROW, "cursor-pointer focus-visible:bg-tint-violet focus-visible:outline-none")}
            >
              <td className={cn(DATA_TABLE_TD, "max-w-[16rem] truncate font-semibold text-foreground")}>{d.title}</td>
              <td className={cn(DATA_TABLE_TD, "max-w-[12rem] truncate")}>{contactLink(d)}</td>
              <td className={DATA_TABLE_TD}>{stageOf(d.stageId)}</td>
              <td className={cn(DATA_TABLE_TD, "text-right font-semibold tabular-nums")}>{formatCurrency(d.value, d.currency)}</td>
              <td className={cn(DATA_TABLE_TD, "text-muted-foreground")}>{d.currency}</td>
              <td className={DATA_TABLE_TD}>
                <DealPriorityTag priority={d.priority} />
              </td>
              <td className={cn(DATA_TABLE_TD, "whitespace-nowrap text-muted-foreground")}>{formatDay(d.expectedCloseDate)}</td>
              <td className={cn(DATA_TABLE_TD, "whitespace-nowrap text-muted-foreground")}>
                {d.updatedAt ? formatRelativeTime(d.updatedAt as unknown as Date) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTableShell>

      {/* Phone cards */}
      <div className="space-y-2 md:hidden">
        <OptionSelect
          aria-label="Sort deals"
          value={`${sort.field}:${sort.dir}`}
          onChange={(v) => {
            if (!v) return;
            const [field, dir] = v.split(":");
            onSort({ field: field as DealSortField, dir: dir as "asc" | "desc" });
          }}
          options={PHONE_SORTS}
          className="w-full"
        />
        <ul className="overflow-hidden rounded-card border border-border bg-card shadow-card">
          {rows.map((d) => (
            <li key={d.id} className="border-b border-border-subtle last:border-b-0">
              <button
                type="button"
                onClick={() => onOpenDeal(d)}
                className="w-full p-3 text-left text-body-sm outline-none hover:bg-tint-violet focus-visible:bg-tint-violet"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-semibold text-foreground">{d.title}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(d.value, d.currency)}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                  {stageOf(d.stageId)}
                  <span>{contactLink(d)}</span>
                  {d.expectedCloseDate && <span>Closes {formatDay(d.expectedCloseDate)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {pagination}
      </div>
    </div>
  );
}
