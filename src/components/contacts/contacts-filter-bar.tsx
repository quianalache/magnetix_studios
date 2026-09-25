"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  describeCondition,
  KNOWN_SOURCES,
  type FieldOption,
} from "@/lib/segmentation/field-options";
import {
  newRowId,
  rowToCondition,
  type ConditionRow,
  type ConditionRowsState,
} from "@/components/segmentation/condition-rows-editor";

/**
 * Contacts list filters (Contacts redesign, 2026-09-25).
 *
 * The quick dropdowns (Source, Tags, Company, Created) are just shortcuts
 * that add / replace rows in ONE condition group — the same group the
 * "More filters" editor shows in full and that a Contact List saves. So
 * there's a single filter model, evaluated server-side by the shared
 * segmentation engine; nothing here filters in the browser.
 */

type Rows = ConditionRowsState;

function without(rows: Rows, pred: (r: ConditionRow) => boolean): Rows {
  return { ...rows, conditions: rows.conditions.filter((r) => !pred(r)) };
}

const isSourceRow = (r: ConditionRow) =>
  r.field === "source" && (r.op === "source_is" || r.op === "equals");
const isTagRow = (r: ConditionRow) => r.field === "tags" && r.op === "has_tag";
const isCompanyRow = (r: ConditionRow) => r.field === "company" && r.op === "contains";
const isCreatedRow = (r: ConditionRow) =>
  r.field === "createdAt" &&
  (r.op === "within_last_days" || r.op === "after" || r.op === "before");

const CREATED_PRESETS: { days: string; label: string }[] = [
  { days: "7", label: "Last 7 days" },
  { days: "30", label: "Last 30 days" },
  { days: "90", label: "Last 90 days" },
  { days: "365", label: "Last 12 months" },
];

function QuickButton({
  label,
  active,
  children,
  width = "w-64",
}: {
  label: ReactNode;
  active: boolean;
  children: ReactNode;
  width?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-9 shrink-0 gap-1 rounded-full px-3 text-sm",
              active && "border-primary/40 bg-primary/5 text-primary",
            )}
          />
        }
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(width, "p-2")}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function ContactsFilterBar({
  search,
  onSearch,
  rows,
  onRowsChange,
  onOpenMore,
  sourceChoices,
  tagSuggestions,
}: {
  search: string;
  onSearch: (v: string) => void;
  rows: Rows;
  onRowsChange: (next: Rows) => void;
  onOpenMore: () => void;
  /** Source values to offer (known sources + any seen on this page). */
  sourceChoices?: { value: string; label: string }[];
  tagSuggestions: string[];
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [companyDraft, setCompanyDraft] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");

  const sourceRow = rows.conditions.find(isSourceRow);
  const tagRows = rows.conditions.filter(isTagRow);
  const companyRow = rows.conditions.find(isCompanyRow);
  const createdRows = rows.conditions.filter(isCreatedRow);
  const sources = sourceChoices ?? KNOWN_SOURCES;

  function setSource(value: string | null) {
    const next = without(rows, isSourceRow);
    if (value) {
      next.conditions = [...next.conditions, { id: newRowId(), field: "source", op: "source_is", value }];
    }
    onRowsChange(next);
  }

  function toggleTag(tag: string) {
    const t = tag.trim();
    if (!t) return;
    const has = tagRows.some((r) => r.value === t);
    onRowsChange(
      has
        ? without(rows, (r) => isTagRow(r) && r.value === t)
        : { ...rows, conditions: [...rows.conditions, { id: newRowId(), field: "tags", op: "has_tag", value: t }] },
    );
  }

  function addTag(e: FormEvent) {
    e.preventDefault();
    if (!tagDraft.trim()) return;
    if (!tagRows.some((r) => r.value === tagDraft.trim())) toggleTag(tagDraft);
    setTagDraft("");
  }

  function setCompany(e: FormEvent) {
    e.preventDefault();
    const next = without(rows, isCompanyRow);
    const v = companyDraft.trim();
    if (v) next.conditions = [...next.conditions, { id: newRowId(), field: "company", op: "contains", value: v }];
    onRowsChange(next);
  }

  function setCreatedPreset(days: string | null) {
    const next = without(rows, isCreatedRow);
    if (days) {
      next.conditions = [...next.conditions, { id: newRowId(), field: "createdAt", op: "within_last_days", value: days }];
    }
    onRowsChange(next);
  }

  function applyCreatedRange(e: FormEvent) {
    e.preventDefault();
    const next = without(rows, isCreatedRow);
    if (after) next.conditions = [...next.conditions, { id: newRowId(), field: "createdAt", op: "after", value: after }];
    if (before) next.conditions = [...next.conditions, { id: newRowId(), field: "createdAt", op: "before", value: before }];
    onRowsChange(next);
  }

  const createdLabel = (() => {
    if (createdRows.length === 0) return "Created";
    const preset = createdRows.find((r) => r.op === "within_last_days");
    if (preset) return CREATED_PRESETS.find((p) => p.days === preset.value)?.label ?? `Last ${preset.value} days`;
    return "Created: custom";
  })();

  const otherCount = rows.conditions.filter(
    (r) => !isSourceRow(r) && !isTagRow(r) && !isCompanyRow(r) && !isCreatedRow(r),
  ).length;

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="relative w-full lg:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, email, phone, or company…"
          className="h-9 rounded-full pl-9"
          aria-label="Search contacts"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch("")}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 pb-1 lg:pb-0">
        <QuickButton
          label={sourceRow ? sources.find((s) => s.value === sourceRow.value)?.label ?? sourceRow.value : "Source"}
          active={!!sourceRow}
          width="w-56"
        >
          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => setSource(null)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              Any source {!sourceRow && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
            {sources.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSource(s.value)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                {s.label}
                {sourceRow?.value === s.value && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </QuickButton>

        <QuickButton label={tagRows.length ? `Tags · ${tagRows.length}` : "Tags"} active={tagRows.length > 0}>
          <form onSubmit={addTag} className="mb-2 flex gap-1.5">
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="Type a tag"
              className="h-8 text-sm"
              aria-label="Tag to filter by"
            />
            <Button type="submit" size="sm" className="h-8">Add</Button>
          </form>
          <div className="max-h-56 overflow-y-auto">
            {[...new Set([...tagRows.map((r) => r.value), ...tagSuggestions])].map((t) => {
              const on = tagRows.some((r) => r.value === t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="truncate">{t}</span>
                  {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
            {tagRows.length === 0 && tagSuggestions.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Type a tag name to filter by it.</p>
            )}
          </div>
          {tagRows.length > 1 && (
            <p className="mt-2 border-t px-2 pt-2 text-[11px] text-muted-foreground">
              Matching {rows.match === "any" ? "any" : "all"} selected tags — change in More filters.
            </p>
          )}
        </QuickButton>

        <QuickButton label={companyRow ? `Company: ${companyRow.value}` : "Company"} active={!!companyRow}>
          <form onSubmit={setCompany} className="space-y-2">
            <Input
              value={companyDraft}
              onChange={(e) => setCompanyDraft(e.target.value)}
              placeholder={companyRow?.value || "Company contains…"}
              className="h-8 text-sm"
              aria-label="Company contains"
            />
            <div className="flex justify-between gap-2">
              {companyRow ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    setCompanyDraft("");
                    onRowsChange(without(rows, isCompanyRow));
                  }}
                >
                  Clear
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" size="sm" className="h-7">Apply</Button>
            </div>
          </form>
        </QuickButton>

        <QuickButton label={createdLabel} active={createdRows.length > 0}>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setCreatedPreset(null)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              Any time {createdRows.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
            {CREATED_PRESETS.map((p) => {
              const on = createdRows.some((r) => r.op === "within_last_days" && r.value === p.days);
              return (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setCreatedPreset(p.days)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  {p.label} {on && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
          <form onSubmit={applyCreatedRange} className="mt-2 space-y-2 border-t pt-2">
            <p className="px-1 text-[11px] font-medium text-muted-foreground">Custom range (UTC days)</p>
            <label className="flex items-center justify-between gap-2 px-1 text-xs">
              After
              <input
                type="date"
                value={after}
                onChange={(e) => setAfter(e.target.value)}
                className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
              />
            </label>
            <label className="flex items-center justify-between gap-2 px-1 text-xs">
              Before
              <input
                type="date"
                value={before}
                onChange={(e) => setBefore(e.target.value)}
                className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
              />
            </label>
            <div className="flex justify-end">
              <Button type="submit" size="sm" className="h-7" disabled={!after && !before}>
                Apply range
              </Button>
            </div>
          </form>
        </QuickButton>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenMore}
          className={cn(
            "h-9 shrink-0 gap-1.5 rounded-full px-3 text-sm",
            otherCount > 0 && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More filters{otherCount > 0 ? ` · ${otherCount}` : ""}
        </Button>

      </div>
    </div>
  );
}

/** Removable chips for every complete condition, plus Clear all. */
export function ActiveFilterChips({
  rows,
  onRowsChange,
  fieldOptions,
}: {
  rows: Rows;
  onRowsChange: (next: Rows) => void;
  fieldOptions: FieldOption[];
}) {
  const complete = rows.conditions.filter((r) => rowToCondition(r));
  if (complete.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {complete.length > 1 && (
        <button
          type="button"
          onClick={() => onRowsChange({ ...rows, match: rows.match === "any" ? "all" : "any" })}
          className="rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          title="Switch between matching all or any of these filters"
        >
          Match {rows.match === "any" ? "any" : "all"}
        </button>
      )}
      {complete.map((r) => (
        <span
          key={r.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-xs"
        >
          <span className="truncate">
            {describeCondition({ field: r.field, op: r.op, value: r.value }, fieldOptions)}
          </span>
          <button
            type="button"
            onClick={() => onRowsChange(without(rows, (x) => x.id === r.id))}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remove filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onRowsChange({ match: "all", conditions: [] })}
        className="text-xs font-medium text-primary hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
