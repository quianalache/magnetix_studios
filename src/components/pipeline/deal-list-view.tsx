"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { getPriority, type PipelineStage } from "@/types/deals";
import type { BoardDeal, DealSort, DealSortField } from "@/types/pipeline-board";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

/**
 * List view of one pipeline (Multiple Pipelines, 2026-09-25). Rows come
 * from the same server query + filter model as the Board; sorting and
 * paging are server-side. Clicking a row opens the deal; the contact name
 * still links to the Contact profile.
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
}) {
  const { saPath } = useSubAccount();
  const stageLabel = (id: string) => stages.find((s) => s.id === id)?.label ?? id;
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
        className="hover:text-primary hover:underline"
      >
        {d.contact.name || d.contact.email || "Contact"}
      </Link>
    ) : (
      <span className="italic text-muted-foreground/60">Unknown</span>
    );

  return (
    <div className={cn("space-y-3", loading && "opacity-60")}>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} className={cn("px-3 py-2.5 font-medium", c.className)}>
                  {c.field ? (
                    <button
                      type="button"
                      onClick={() => headerClick(c.field!)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      aria-label={`Sort by ${c.label}`}
                    >
                      {c.label}
                      {sort.field === c.field ? (
                        sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
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
            {rows.map((d) => {
              const p = getPriority(d.priority);
              return (
                <tr
                  key={d.id}
                  onClick={() => onOpenDeal(d)}
                  onKeyDown={(e) => e.key === "Enter" && onOpenDeal(d)}
                  tabIndex={0}
                  className="cursor-pointer border-t hover:bg-muted/30 focus:bg-muted/30 focus:outline-none"
                >
                  <td className="max-w-[16rem] truncate px-3 py-2.5 font-medium">{d.title}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2.5">{contactLink(d)}</td>
                  <td className="px-3 py-2.5">{stageLabel(d.stageId)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(d.value, d.currency)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.currency}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", p.badge)}>{p.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDay(d.expectedCloseDate)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {d.updatedAt ? formatRelativeTime(d.updatedAt as unknown as Date) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      <div className="space-y-2 md:hidden">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select
            value={`${sort.field}:${sort.dir}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split(":");
              onSort({ field: field as DealSortField, dir: dir as "asc" | "desc" });
            }}
            className="h-9 flex-1 rounded-lg border bg-transparent px-2 text-sm text-foreground [&_option]:bg-background"
          >
            <option value="updatedAt:desc">Recently updated</option>
            <option value="value:desc">Value, high to low</option>
            <option value="value:asc">Value, low to high</option>
            <option value="expectedCloseDate:asc">Closing soonest</option>
            <option value="stage:asc">Stage order</option>
            <option value="title:asc">Title A–Z</option>
          </select>
        </label>
        {rows.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onOpenDeal(d)}
            className="w-full rounded-xl border bg-card p-3 text-left text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{d.title}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(d.value, d.currency)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>{stageLabel(d.stageId)}</span>
              <span>{contactLink(d)}</span>
              {d.expectedCloseDate && <span>Closes {formatDay(d.expectedCloseDate)}</span>}
            </div>
          </button>
        ))}
      </div>

      {rows.length === 0 && !loading && (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No deals match.
        </p>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} {total === 1 ? "deal" : "deals"} · page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
