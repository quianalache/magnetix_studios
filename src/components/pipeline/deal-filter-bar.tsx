"use client";

import { Check, ChevronDown, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEAL_PRIORITIES, type PipelineStage } from "@/types/deals";
import type { TerritoryDoc } from "@/types";
import {
  EMPTY_DEAL_FILTERS,
  type DealFilters,
} from "@/types/pipeline-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/system/filter-bar";
import { SearchField } from "@/components/system/search-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * The one filter model shared by Board and List (Multiple Pipelines,
 * 2026-09-25): search, stages, priorities, plus value range / country /
 * territory under "More filters" — the same capabilities the old pipeline
 * filter panel offered, now evaluated server-side.
 */

export function activeDealFilterCount(f: DealFilters): number {
  let n = 0;
  if (f.stageIds.length) n++;
  if (f.priorities.length) n++;
  if (f.minValue !== null || f.maxValue !== null) n++;
  if (f.countries.length) n++;
  if (f.territories.length) n++;
  return n;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function DealFilterBar({
  filters,
  onChange,
  stages,
  countries,
  territories,
  showTerritoryFilter,
}: {
  filters: DealFilters;
  onChange: (next: DealFilters) => void;
  stages: PipelineStage[];
  countries: string[];
  territories: TerritoryDoc[];
  showTerritoryFilter: boolean;
}) {
  const moreCount =
    (filters.minValue !== null || filters.maxValue !== null ? 1 : 0) +
    (filters.countries.length ? 1 : 0) +
    (filters.territories.length ? 1 : 0);
  const activeTerritories = territories.filter((t) => t.status === "active");
  const numberOrNull = (v: string) => {
    const n = v.trim() === "" ? null : Number(v);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  return (
    <FilterBar
      search={
        <SearchField
          value={filters.search}
          onChange={(search) => onChange({ ...filters, search })}
          placeholder="Search deals, contacts, or companies…"
          aria-label="Search deals"
        />
      }
      filters={
        <>
        <ChecklistPopover
          label="Stages"
          allLabel="All stages"
          selected={filters.stageIds}
          options={stages.map((s) => ({ value: s.id, label: s.label }))}
          onToggle={(v) => onChange({ ...filters, stageIds: toggle(filters.stageIds, v) })}
        />
        <ChecklistPopover
          label="Priorities"
          allLabel="All priorities"
          selected={filters.priorities}
          options={DEAL_PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
          onToggle={(v) =>
            onChange({
              ...filters,
              priorities: toggle(filters.priorities, v as DealFilters["priorities"][number]),
            })
          }
        />
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className={cn("gap-1.5", moreCount > 0 && ACTIVE_FILTER)}
              />
            }
          >
            <Filter className="size-4" aria-hidden="true" />
            More filters
            {moreCount > 0 && (
              <span className="rounded-full bg-card px-1.5 text-micro font-semibold">{moreCount}</span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-4 p-4">
            <div className="space-y-1.5">
              <p className="text-caption font-medium text-muted-foreground">Value</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Min"
                  aria-label="Minimum value"
                  value={filters.minValue ?? ""}
                  onChange={(e) => onChange({ ...filters, minValue: numberOrNull(e.target.value) })}
                  className="h-9"
                />
                <span className="text-caption text-muted-foreground">to</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Max"
                  aria-label="Maximum value"
                  value={filters.maxValue ?? ""}
                  onChange={(e) => onChange({ ...filters, maxValue: numberOrNull(e.target.value) })}
                  className="h-9"
                />
              </div>
            </div>
            <CheckList
              title="Country"
              empty="No countries on these deals."
              options={countries.map((c) => ({ value: c, label: c }))}
              selected={filters.countries}
              onToggle={(v) => onChange({ ...filters, countries: toggle(filters.countries, v) })}
            />
            {showTerritoryFilter && (
              <CheckList
                title="Territory"
                empty="No territories yet."
                options={activeTerritories.map((t) => ({ value: t.id, label: t.name }))}
                selected={filters.territories}
                onToggle={(v) => onChange({ ...filters, territories: toggle(filters.territories, v) })}
              />
            )}
          </PopoverContent>
        </Popover>
          {(activeDealFilterCount(filters) > 0 || filters.search) && (
            <Button
              variant="ghost"
              className="gap-1 text-muted-foreground"
              onClick={() => onChange(EMPTY_DEAL_FILTERS)}
            >
              <X className="size-4" aria-hidden="true" /> Clear
            </Button>
          )}
        </>
      }
    />
  );
}

/** Selected-filter state: Royal Violet selection, same as the system selects. */
const ACTIVE_FILTER = "border-violet-ds-300 bg-accent text-accent-foreground hover:bg-accent";

function ChecklistPopover({
  label,
  allLabel,
  selected,
  options,
  onToggle,
}: {
  label: string;
  allLabel: string;
  selected: string[];
  options: { value: string; label: string }[];
  onToggle: (v: string) => void;
}) {
  const text =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? `1 ${label.toLowerCase()}`)
        : `${selected.length} ${label.toLowerCase()}`;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn("gap-1.5", selected.length > 0 && ACTIVE_FILTER)}
          />
        }
      >
        {text}
        <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <CheckList title={label} options={options} selected={selected} onToggle={onToggle} />
      </PopoverContent>
    </Popover>
  );
}

function CheckList({
  title,
  options,
  selected,
  onToggle,
  empty,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  empty?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="px-1 text-caption font-medium text-muted-foreground">{title}</p>
      {options.length === 0 ? (
        <p className="px-1 text-caption text-muted-foreground">{empty}</p>
      ) : (
        <div className="max-h-60 overflow-y-auto">
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onToggle(o.value)}
                className={cn(
                  "flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-body-sm hover:bg-muted",
                  on && "font-medium text-foreground",
                )}
              >
                <span className="truncate">{o.label}</span>
                {on && <Check className="size-4 shrink-0 text-link" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
