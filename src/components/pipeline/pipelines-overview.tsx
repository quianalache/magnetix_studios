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
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { FilterBar } from "@/components/system/filter-bar";
import { SearchField } from "@/components/system/search-field";
import { OptionSelect } from "@/components/system/option-select";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Alert } from "@/components/ui/alert";
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
import { stageColor } from "@/lib/pipelines/stage-color";
import { currencyEntries, type PipelineSummary } from "@/types/pipeline-board";

/**
 * Pipelines Overview (approved mockup 1, 2026-09-25) — where Sidebar →
 * Pipelines lands. Helps pick and organize pipelines; it never opens a
 * pipeline on its own. No global statistics bar (explicitly removed by
 * the owner) — each card carries its own compact stats.
 */

type SortKey = "custom" | "updated" | "name" | "value" | "deals";
type StatusFilter = "active" | "archived" | "all";

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
  const { confirm, dialog: confirmDialog } = useConfirm();

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
      !(await confirm({
        title: `Archive "${p.name}"?`,
        description:
          "Its deals and history are kept and stay viewable; new deals can't be added until you restore it.",
        confirmLabel: "Archive",
      }))
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

  const filtered = !!search.trim() || status !== "active";

  return (
    <PageShell width="data">
      <PageHeader
        title="Pipelines"
        description="Organize and track your sales pipelines in one place."
        icon={GitBranch}
        accent="crescent"
        actions={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> Create Pipeline
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        search={
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search pipelines…"
            aria-label="Search pipelines"
          />
        }
        filters={
          <>
            <OptionSelect
              aria-label="Sort pipelines by"
              className="w-44"
              value={sort}
              onChange={(v) => v && setSort(v)}
              options={[
                { value: "custom", label: "Custom order" },
                { value: "updated", label: "Last updated" },
                { value: "name", label: "Name" },
                { value: "value", label: "Open value" },
                { value: "deals", label: "Active deals" },
              ]}
            />
            <OptionSelect
              aria-label="Pipeline status"
              className="w-40"
              value={status}
              onChange={(v) => v && setStatus(v)}
              options={[
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
                { value: "all", label: "All pipelines" },
              ]}
            />
          </>
        }
        actions={
          <SegmentedControl
            value={view}
            onChange={changeView}
            options={[
              { value: "grid", label: "Grid" },
              { value: "list", label: "List" },
            ]}
          />
        }
      />

      {error ? (
        <Alert tone="danger">
          {error}{" "}
          <button type="button" className="font-medium underline" onClick={() => load()}>
            Retry
          </button>
        </Alert>
      ) : summaries === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading pipelines">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-card" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={filtered ? "No pipelines match" : "No active pipelines yet"}
          description={filtered ? "Try another search or status." : "Create a pipeline to start tracking deals."}
        />
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s, i) => (
            <PipelineCard key={s.pipeline.id} summary={s} href={saPath(`/pipeline/${s.pipeline.id}`)} menu={menu(s, i)} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
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
      {confirmDialog}
    </PageShell>
  );
}

function StatusBadge({ status }: { status: Pipeline["status"] }) {
  return (
    <StatusPill status={status} className="shrink-0">
      {status === "active" ? "Active" : "Archived"}
    </StatusPill>
  );
}

/** Proportional bar over the pipeline's actual active stages (Lost omitted). */
function StageBreakdown({ summary, compact = false }: { summary: PipelineSummary; compact?: boolean }) {
  const stages = activeStages(summary.pipeline).filter((s) => s.type !== "lost");
  const items = stages.map((s, i) => ({
    stage: s,
    count: summary.stats.stageCounts[s.id] ?? 0,
    color: stageColor(s.id, i),
  }));
  const total = items.reduce((n, i) => n + i.count, 0);
  const legend = compact ? [] : items.slice(0, 4);
  return (
    <div>
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={items.map((i) => `${i.stage.name}: ${i.count}`).join(", ")}
      >
        {total > 0 &&
          items
            .filter((i) => i.count > 0)
            .map((i) => (
              <div
                key={i.stage.id}
                className="h-full"
                style={{ width: `${(i.count / total) * 100}%`, background: i.color }}
                title={`${i.stage.name}: ${i.count}`}
              />
            ))}
      </div>
      {legend.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
          {legend.map((i) => (
            <span key={i.stage.id} className="inline-flex max-w-[9rem] items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden="true" />
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
    <div className={cn("flex flex-col rounded-card border border-border bg-card p-5 shadow-card", p.status === "archived" && "opacity-75")}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg" aria-hidden="true">
          <GitBranch className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="line-clamp-2 text-section font-semibold text-foreground">{p.name}</h2>
            <StatusBadge status={p.status} />
          </div>
          {p.description && (
            <p className="mt-0.5 line-clamp-2 text-caption text-muted-foreground">{p.description}</p>
          )}
        </div>
        {menu}
      </div>

      <dl className="mt-4 grid grid-cols-[1fr_1.5fr_1fr] divide-x divide-border-subtle text-body-sm">
        <div className="flex flex-col-reverse pr-3">
          <dt className="text-caption text-muted-foreground">Active deals</dt>
          <dd className="text-title-md font-semibold tabular-nums text-foreground">{stats.openCount}</dd>
        </div>
        <div className="flex min-w-0 flex-col-reverse px-3">
          <dt className="text-caption text-muted-foreground">Open value</dt>
          <dd className="text-title-md leading-tight font-semibold tabular-nums text-foreground">
            <CurrencyTotalsText totals={stats.openValue} />
          </dd>
        </div>
        <div className="flex flex-col-reverse pl-3">
          <dt className="text-caption text-muted-foreground">Win rate</dt>
          <dd className="text-title-md font-semibold tabular-nums text-foreground">
            {stats.winRate === null ? "—" : `${stats.winRate}%`}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <StageBreakdown summary={summary} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {summary.lastActivityAt
            ? `Updated ${formatRelativeTime(new Date(summary.lastActivityAt))}`
            : "No activity yet"}
        </span>
        <Button variant="outline" size="sm" render={<Link href={href} />}>
          Open Pipeline <ArrowRight className="size-4" aria-hidden="true" />
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
    <div className="flex flex-col gap-3 border-b border-border-subtle p-4 last:border-b-0 md:flex-row md:items-center">
      <div className="min-w-0 md:w-64">
        <div className="flex items-center gap-2">
          <Link href={href} className="truncate text-body-sm font-semibold text-foreground hover:text-link hover:underline">
            {p.name}
          </Link>
          <StatusBadge status={p.status} />
        </div>
        {p.description && <p className="truncate text-caption text-muted-foreground">{p.description}</p>}
      </div>
      <div className="flex gap-6 text-body-sm md:w-72">
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
        <Button variant="outline" size="sm" render={<Link href={href} />}>
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
        render={<Button variant="ghost" size="icon" className="-mt-1 -mr-1 shrink-0 text-muted-foreground" aria-label={`Actions for ${pipeline.name}`} />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4" /> Edit details
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={manageHref} />}>
          <Settings2 className="size-4" /> Manage stages
        </DropdownMenuItem>
        {(canMoveUp || canMoveDown) && <DropdownMenuSeparator />}
        {canMoveUp && (
          <DropdownMenuItem onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" /> Move up
          </DropdownMenuItem>
        )}
        {canMoveDown && (
          <DropdownMenuItem onClick={() => onMove(1)}>
            <ArrowDown className="size-4" /> Move down
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {pipeline.status === "active" ? (
          <DropdownMenuItem onClick={() => onArchive(true)}>
            <Archive className="size-4" /> Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onArchive(false)}>
            <ArchiveRestore className="size-4" /> Restore
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
