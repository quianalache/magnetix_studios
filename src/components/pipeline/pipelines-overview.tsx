"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock,
  GitBranch,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CurrencyTotalsText } from "@/components/pipeline/currency-totals";
import { PipelineFormDialog } from "@/components/pipeline/pipeline-form-dialog";
import {
  fetchPipelineSummaries,
  PipelineApiError,
  reorderPipelinesApi,
  updatePipelineApi,
} from "@/lib/pipelines/client";
import { activeStages, type Pipeline } from "@/types/pipelines";
import { currencyEntries, type PipelineSummary } from "@/types/pipeline-board";

/**
 * Pipelines Overview (approved mockup 1, 2026-09-25) — where Sidebar →
 * Pipelines lands. Helps pick and organize pipelines; it never opens a
 * pipeline on its own. No global statistics bar (explicitly removed by
 * the owner) — each card carries its own compact stats.
 */

type SortKey = "custom" | "updated" | "name" | "value" | "deals";
type StatusFilter = "active" | "archived" | "all";

const SEGMENT_COLORS = [
  "bg-violet-400",
  "bg-indigo-300",
  "bg-amber-300",
  "bg-sky-300",
  "bg-pink-300",
  "bg-teal-300",
  "bg-orange-300",
  "bg-fuchsia-300",
];
const WON_COLOR = "bg-emerald-400";

const VIEW_KEY = "pipelines-overview:view";

function readView(): "grid" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function PipelinesOverview() {
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const [summaries, setSummaries] = useState<PipelineSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("custom");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Pipeline | null>(null);

  useEffect(() => setView(readView()), []);
  const changeView = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const load = useCallback(
    async (fresh = false) => {
      try {
        const res = await fetchPipelineSummaries(subAccountId, {
          includeArchived: true,
          fresh,
        });
        setSummaries(res.summaries);
        setError(null);
      } catch (err) {
        setError(err instanceof PipelineApiError ? err.message : "Couldn't load pipelines.");
      }
    },
    [subAccountId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!summaries) return [];
    const needle = search.trim().toLowerCase();
    const list = summaries.filter((s) => {
      if (status !== "all" && s.pipeline.status !== status) return false;
      if (!needle) return true;
      return `${s.pipeline.name}\n${s.pipeline.description ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
    const topValue = (s: PipelineSummary) => currencyEntries(s.stats.openValue)[0]?.[1] ?? 0;
    const cmp: Record<SortKey, (a: PipelineSummary, b: PipelineSummary) => number> = {
      custom: (a, b) => a.pipeline.order - b.pipeline.order,
      updated: (a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
      name: (a, b) => a.pipeline.name.localeCompare(b.pipeline.name),
      value: (a, b) => topValue(b) - topValue(a),
      deals: (a, b) => b.stats.openCount - a.stats.openCount,
    };
    return [...list].sort(cmp[sort]);
  }, [summaries, search, status, sort]);

  const canReorder = isAdmin && sort === "custom" && status === "active" && !search.trim();

  async function move(pipelineId: string, dir: -1 | 1) {
    const ids = visible.map((s) => s.pipeline.id);
    const i = ids.indexOf(pipelineId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Archived pipelines keep their slot after the active ones.
    const archived = (summaries ?? [])
      .filter((s) => s.pipeline.status === "archived")
      .map((s) => s.pipeline.id);
    try {
      await reorderPipelinesApi(subAccountId, [...ids, ...archived]);
      await load();
    } catch (err) {
      toast.error(err instanceof PipelineApiError ? err.message : "Couldn't reorder.");
    }
  }

  async function setArchived(p: Pipeline, archived: boolean) {
    if (
      archived &&
      !window.confirm(
        `Archive "${p.name}"? Its deals and history are kept and stay viewable; new deals can't be added until you restore it.`,
      )
    ) {
      return;
    }
    try {
      await updatePipelineApi(subAccountId, p.id, {
        status: archived ? "archived" : "active",
      });
      toast.success(archived ? "Pipeline archived" : "Pipeline restored");
      await load();
    } catch (err) {
      toast.error(err instanceof PipelineApiError ? err.message : "Couldn't update.");
    }
  }

  const menu = (s: PipelineSummary, index: number) =>
    isAdmin ? (
      <PipelineMenu
        pipeline={s.pipeline}
        canMoveUp={canReorder && index > 0}
        canMoveDown={canReorder && index < visible.length - 1}
        manageHref={saPath(`/pipeline/${s.pipeline.id}?manage=stages`)}
        onEdit={() => {
          setEditing(s.pipeline);
          setFormOpen(true);
        }}
        onMove={(dir) => move(s.pipeline.id, dir)}
        onArchive={(a) => setArchived(s.pipeline, a)}
      />
    ) : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipelines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize and track your sales pipelines in one place.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Create Pipeline
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-5 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pipelines…"
            aria-label="Search pipelines"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LabeledSelect
            label="Sort by"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={[
              ["custom", "Custom order"],
              ["updated", "Last updated"],
              ["name", "Name"],
              ["value", "Open value"],
              ["deals", "Active deals"],
            ]}
          />
          <LabeledSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[
              ["active", "Active"],
              ["archived", "Archived"],
              ["all", "All pipelines"],
            ]}
          />
        </div>
        <div className="flex items-center gap-1 self-start rounded-lg border p-1 md:ml-auto md:self-auto" role="group" aria-label="Display">
          <ViewButton active={view === "grid"} onClick={() => changeView("grid")} label="Grid view">
            <LayoutGrid className="h-4 w-4" />
          </ViewButton>
          <ViewButton active={view === "list"} onClick={() => changeView("list")} label="List view">
            <List className="h-4 w-4" />
          </ViewButton>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm">
          {error}{" "}
          <button type="button" className="font-medium underline" onClick={() => load()}>
            Retry
          </button>
        </div>
      ) : summaries === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-60 animate-pulse rounded-2xl border bg-muted/30" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {search || status !== "active"
              ? "No pipelines match."
              : "No active pipelines yet."}
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s, i) => (
            <PipelineCard key={s.pipeline.id} summary={s} href={saPath(`/pipeline/${s.pipeline.id}`)} menu={menu(s, i)} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          {visible.map((s, i) => (
            <PipelineRow key={s.pipeline.id} summary={s} href={saPath(`/pipeline/${s.pipeline.id}`)} menu={menu(s, i)} />
          ))}
        </div>
      )}

      <PipelineFormDialog
        subAccountId={subAccountId}
        open={formOpen}
        onOpenChange={setFormOpen}
        pipeline={editing}
        onSaved={() => load(true)}
      />
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-medium outline-none [&_option]:bg-background [&_option]:text-foreground"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-9 items-center justify-center rounded-md transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Pipeline["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "active"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {status === "active" ? "Active" : "Archived"}
    </span>
  );
}

/** Proportional bar over the pipeline's actual active stages (Lost omitted). */
function StageBreakdown({ summary, compact = false }: { summary: PipelineSummary; compact?: boolean }) {
  const stages = activeStages(summary.pipeline).filter((s) => s.type !== "lost");
  let openIdx = 0;
  const items = stages.map((s) => ({
    stage: s,
    count: summary.stats.stageCounts[s.id] ?? 0,
    color: s.type === "won" ? WON_COLOR : SEGMENT_COLORS[openIdx++ % SEGMENT_COLORS.length],
  }));
  const total = items.reduce((n, i) => n + i.count, 0);
  const legend = compact ? [] : items.slice(0, 4);
  return (
    <div>
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={items.map((i) => `${i.stage.name}: ${i.count}`).join(", ")}
      >
        {total > 0 &&
          items
            .filter((i) => i.count > 0)
            .map((i) => (
              <div
                key={i.stage.id}
                className={cn("h-full", i.color)}
                style={{ width: `${(i.count / total) * 100}%` }}
                title={`${i.stage.name}: ${i.count}`}
              />
            ))}
      </div>
      {legend.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {legend.map((i) => (
            <span key={i.stage.id} className="inline-flex max-w-[9rem] items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", i.color)} />
              <span className="truncate">{i.stage.name}</span>
              <span className="font-semibold text-foreground">{i.count}</span>
            </span>
          ))}
          {items.length > legend.length && <span>+{items.length - legend.length} more</span>}
        </div>
      )}
    </div>
  );
}

function PipelineCard({
  summary,
  href,
  menu,
}: {
  summary: PipelineSummary;
  href: string;
  menu: React.ReactNode;
}) {
  const { pipeline: p, stats } = summary;
  return (
    <div className={cn("flex flex-col rounded-2xl border bg-card p-5 shadow-sm", p.status === "archived" && "opacity-75")}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GitBranch className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="line-clamp-2 text-base font-semibold">{p.name}</h2>
            <StatusBadge status={p.status} />
          </div>
          {p.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
          )}
        </div>
        {menu}
      </div>

      <dl className="mt-4 grid grid-cols-[1fr_1.5fr_1fr] divide-x text-sm">
        <div className="pr-3">
          <dd className="text-lg font-semibold tabular-nums">{stats.openCount}</dd>
          <dt className="text-xs text-muted-foreground">Active deals</dt>
        </div>
        <div className="min-w-0 px-3">
          <dd className="text-lg font-semibold leading-tight tabular-nums">
            <CurrencyTotalsText totals={stats.openValue} />
          </dd>
          <dt className="text-xs text-muted-foreground">Open value</dt>
        </div>
        <div className="pl-3">
          <dd className="text-lg font-semibold tabular-nums">
            {stats.winRate === null ? "—" : `${stats.winRate}%`}
          </dd>
          <dt className="text-xs text-muted-foreground">Win rate</dt>
        </div>
      </dl>

      <div className="mt-4">
        <StageBreakdown summary={summary} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {summary.lastActivityAt
            ? `Updated ${formatRelativeTime(new Date(summary.lastActivityAt))}`
            : "No activity yet"}
        </span>
        <Button variant="secondary" size="sm" render={<Link href={href} />}>
          Open Pipeline <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PipelineRow({
  summary,
  href,
  menu,
}: {
  summary: PipelineSummary;
  href: string;
  menu: React.ReactNode;
}) {
  const { pipeline: p, stats } = summary;
  return (
    <div className="flex flex-col gap-3 border-b bg-card p-4 last:border-b-0 md:flex-row md:items-center">
      <div className="min-w-0 md:w-64">
        <div className="flex items-center gap-2">
          <Link href={href} className="truncate font-semibold hover:underline">
            {p.name}
          </Link>
          <StatusBadge status={p.status} />
        </div>
        {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
      </div>
      <div className="flex gap-6 text-sm md:w-72">
        <span>
          <strong className="tabular-nums">{stats.openCount}</strong>{" "}
          <span className="text-muted-foreground">active</span>
        </span>
        <CurrencyTotalsText totals={stats.openValue} className="font-semibold tabular-nums" />
        <span className="text-muted-foreground">
          {stats.winRate === null ? "—" : `${stats.winRate}%`} win
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <StageBreakdown summary={summary} compact />
      </div>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" render={<Link href={href} />}>
          Open
        </Button>
        {menu}
      </div>
    </div>
  );
}

function PipelineMenu({
  pipeline,
  canMoveUp,
  canMoveDown,
  manageHref,
  onEdit,
  onMove,
  onArchive,
}: {
  pipeline: Pipeline;
  canMoveUp: boolean;
  canMoveDown: boolean;
  manageHref: string;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onArchive: (archived: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={`Actions for ${pipeline.name}`} />}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit details
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={manageHref} />}>
          <Settings2 className="mr-2 h-4 w-4" /> Manage stages
        </DropdownMenuItem>
        {(canMoveUp || canMoveDown) && <DropdownMenuSeparator />}
        {canMoveUp && (
          <DropdownMenuItem onClick={() => onMove(-1)}>
            <ArrowUp className="mr-2 h-4 w-4" /> Move up
          </DropdownMenuItem>
        )}
        {canMoveDown && (
          <DropdownMenuItem onClick={() => onMove(1)}>
            <ArrowDown className="mr-2 h-4 w-4" /> Move down
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {pipeline.status === "active" ? (
          <DropdownMenuItem onClick={() => onArchive(true)}>
            <Archive className="mr-2 h-4 w-4" /> Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onArchive(false)}>
            <ArchiveRestore className="mr-2 h-4 w-4" /> Restore
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
