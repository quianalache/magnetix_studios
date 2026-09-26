"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  ChevronDown,
  GitBranch,
  LayoutGrid,
  List,
  Plus,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { usePipelineCardFields } from "@/hooks/use-pipeline-card-fields";
import {
  fetchBoard,
  fetchDealList,
  fetchPipelines,
  PipelineApiError,
  patchDealApi,
} from "@/lib/pipelines/client";
import { toDisplayStages, type Pipeline } from "@/types/pipelines";
import type { TerritoryDoc } from "@/types";
import {
  EMPTY_DEAL_FILTERS,
  hydrateDealRow,
  type BoardDeal,
  type DealFilters,
  type DealSort,
  type PipelineStats,
} from "@/types/pipeline-board";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PipelineBoard, type BoardColumnState } from "@/components/pipeline/pipeline-board";
import { DealListView } from "@/components/pipeline/deal-list-view";
import { DealFilterBar } from "@/components/pipeline/deal-filter-bar";
import { CurrencyTotalsText } from "@/components/pipeline/currency-totals";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { EditDealDialog } from "@/components/pipeline/edit-deal-dialog";
import { ManageStagesDialog } from "@/components/pipeline/manage-stages-dialog";
import { CustomizeCardsDialog } from "@/components/pipeline/customize-cards-dialog";

/**
 * One pipeline — Board or List (approved mockup 2, Multiple Pipelines
 * 2026-09-25). Everything on this page (statistics, filters, cards, list
 * rows) is scoped to the selected pipeline and comes from one server-side
 * query; deals from other pipelines never mix in.
 */

type View = "board" | "list";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function readCollapsed(key: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function PipelineWorkspace({ pipelineId }: { pipelineId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { subAccountId, subAccount, saPath, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;

  const view: View = searchParams.get("view") === "list" ? "list" : "board";
  const setView = (v: View) => {
    const q = new URLSearchParams(searchParams.toString());
    if (v === "list") q.set("view", "list");
    else q.delete("view");
    router.replace(`${saPath(`/pipeline/${pipelineId}`)}${q.size ? `?${q}` : ""}`);
  };

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [allStageCounts, setAllStageCounts] = useState<Record<string, number>>({});
  const [columns, setColumns] = useState<Map<string, BoardColumnState>>(new Map());
  const [loadingMore, setLoadingMore] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);

  const [filters, setFilters] = useState<DealFilters>(EMPTY_DEAL_FILTERS);
  const debouncedSearch = useDebounced(filters.search, 300);
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const [sort, setSort] = useState<DealSort>({ field: "updatedAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ rows: BoardDeal[]; total: number; pageCount: number }>({
    rows: [],
    total: 0,
    pageCount: 1,
  });

  const collapseKey = `ls:pipeline-collapsed:${subAccountId}:${pipelineId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => setCollapsed(readCollapsed(collapseKey)), [collapseKey]);
  const toggleCollapse = (stageId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      try {
        localStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        // per-viewer convenience only
      }
      return next;
    });
  };

  const { fields: cardFields, setFields: setCardFields, reset: resetCardFields } =
    usePipelineCardFields(user?.uid, subAccountId, pipelineId);

  const [newDealStage, setNewDealStage] = useState<string | null>(null);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<BoardDeal | null>(null);
  const [manageOpen, setManageOpen] = useState(searchParams.get("manage") === "stages");
  const [cardsOpen, setCardsOpen] = useState(false);

  // Pipelines for the switcher (and to know this one exists).
  const loadPipelines = useCallback(async () => {
    try {
      const res = await fetchPipelines(subAccountId, true);
      setPipelines(res.pipelines);
      if (!res.pipelines.some((p) => p.id === pipelineId)) setNotFound(true);
    } catch {
      // The board request surfaces errors; the switcher just stays empty.
    }
  }, [subAccountId, pipelineId]);
  useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  const requestSeq = useRef(0);
  const loadBoard = useCallback(
    async (fresh = false) => {
      const seq = ++requestSeq.current;
      try {
        const res = await fetchBoard(subAccountId, pipelineId, { filters: queryFilters, fresh });
        if (seq !== requestSeq.current) return;
        setPipeline(res.pipeline);
        setStats(res.stats);
        setCountries(res.countries);
        setAllStageCounts(res.allStageCounts);
        setColumns(
          new Map(
            res.columns.map((c) => [
              c.stageId,
              { count: c.count, totals: c.totals, deals: c.deals.map(hydrateDealRow) },
            ]),
          ),
        );
        setNotFound(false);
      } catch (err) {
        if (err instanceof PipelineApiError && err.status === 404) setNotFound(true);
        else toast.error(err instanceof PipelineApiError ? err.message : "Couldn't load deals.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [subAccountId, pipelineId, queryFilters],
  );

  const loadList = useCallback(
    async (fresh = false) => {
      const seq = ++requestSeq.current;
      try {
        const res = await fetchDealList(subAccountId, pipelineId, {
          filters: queryFilters,
          sort,
          page,
          fresh,
        });
        if (seq !== requestSeq.current) return;
        setPipeline(res.pipeline);
        setStats(res.stats);
        setCountries(res.countries);
        setList({ rows: res.rows.map(hydrateDealRow), total: res.total, pageCount: res.pageCount });
        setAllStageCounts(res.allStageCounts);
        if (res.page !== page) setPage(res.page);
        setNotFound(false);
      } catch (err) {
        if (err instanceof PipelineApiError && err.status === 404) setNotFound(true);
        else toast.error(err instanceof PipelineApiError ? err.message : "Couldn't load deals.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [subAccountId, pipelineId, queryFilters, sort, page],
  );

  const reload = useCallback(
    (fresh = false) => (view === "list" ? loadList(fresh) : loadBoard(fresh)),
    [view, loadList, loadBoard],
  );

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  // Filters changed → list goes back to page 1.
  useEffect(() => setPage(1), [queryFilters]);

  // Pick up teammates' changes when the tab regains focus (no live listener).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  useEffect(() => {
    if (!scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = safeSubscribe(
      () =>
        subscribeToTerritories(subAccountId, setTerritories, (err) =>
          console.error("[pipeline] territories listener error", err),
        ),
      (err) => console.error("[pipeline] territories listener error", err),
    );
    return () => unsub?.();
  }, [scopingOn, subAccountId]);

  const stages = useMemo(() => {
    if (!pipeline) return [];
    // Active stages, plus any archived stage that still reports deals.
    const shown = pipeline.stages.filter((s) => !s.archived || columns.has(s.id));
    const known = new Set(pipeline.stages.map((s) => s.id));
    // A deal on a stage id this pipeline doesn't define stays visible.
    const orphans = [...columns.keys()]
      .filter((id) => !known.has(id))
      .map((id) => ({ id, name: id, type: "open" as const, archived: false }));
    return toDisplayStages([...shown, ...orphans]);
  }, [pipeline, columns]);

  async function loadMore(stageId: string) {
    const col = columns.get(stageId);
    if (!col) return;
    setLoadingMore((s) => new Set(s).add(stageId));
    try {
      const res = await fetchBoard(subAccountId, pipelineId, {
        filters: queryFilters,
        offsets: { [stageId]: col.deals.length },
        onlyStageId: stageId,
      });
      const more = res.columns[0];
      if (more) {
        setColumns((prev) => {
          const next = new Map(prev);
          const cur = next.get(stageId) ?? col;
          const seen = new Set(cur.deals.map((d) => d.id));
          next.set(stageId, {
            count: more.count,
            totals: more.totals,
            deals: [...cur.deals, ...more.deals.map(hydrateDealRow).filter((d) => !seen.has(d.id))],
          });
          return next;
        });
      }
    } catch (err) {
      toast.error(err instanceof PipelineApiError ? err.message : "Couldn't load more deals.");
    } finally {
      setLoadingMore((s) => {
        const next = new Set(s);
        next.delete(stageId);
        return next;
      });
    }
  }

  async function moveDeal(deal: BoardDeal, stageId: string, lostReason?: string) {
    const from = deal.stageId;
    // Optimistic: move the card now, reconcile with the server after.
    setColumns((prev) => {
      const next = new Map(prev);
      const src = next.get(from);
      const dst = next.get(stageId) ?? { count: 0, totals: {}, deals: [] };
      const cur = deal.currency || "USD";
      if (src) {
        next.set(from, {
          count: Math.max(0, src.count - 1),
          totals: { ...src.totals, [cur]: (src.totals[cur] ?? 0) - (deal.value || 0) },
          deals: src.deals.filter((d) => d.id !== deal.id),
        });
      }
      next.set(stageId, {
        count: dst.count + 1,
        totals: { ...dst.totals, [cur]: (dst.totals[cur] ?? 0) + (deal.value || 0) },
        deals: [{ ...deal, stageId, stageChangedAt: new Date() as unknown as BoardDeal["stageChangedAt"] }, ...dst.deals],
      });
      return next;
    });
    try {
      await patchDealApi(deal.id, lostReason !== undefined ? { stageId, lostReason } : { stageId });
      toast.success(`Moved to ${stages.find((s) => s.id === stageId)?.label ?? "stage"}`);
    } catch (err) {
      toast.error(err instanceof PipelineApiError ? err.message : "Couldn't move deal. Try again.");
    } finally {
      void loadBoard(true);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed p-10 text-center">
        <GitBranch className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">Pipeline not found</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been removed, or it belongs to another workspace.</p>
        <Button className="mt-4" render={<Link href={saPath("/pipeline")} />}>
          All pipelines
        </Button>
      </div>
    );
  }

  const archived = pipeline?.status === "archived";
  const activePipelines = pipelines.filter((p) => p.status === "active");

  return (
    <div className="space-y-5">
      <Link
        href={saPath("/pipeline")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All Pipelines
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GitBranch className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-1.5 text-left text-2xl font-bold tracking-tight hover:text-primary"
                    aria-label="Switch pipeline"
                  />
                }
              >
                <span className="truncate">{pipeline?.name ?? "Pipeline"}</span>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs">Switch pipeline</DropdownMenuLabel>
                  {activePipelines.map((p) => (
                    <DropdownMenuItem key={p.id} render={<Link href={saPath(`/pipeline/${p.id}${view === "list" ? "?view=list" : ""}`)} />}>
                      <span className={cn("truncate", p.id === pipelineId && "font-semibold text-primary")}>{p.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href={saPath("/pipeline")} />}>View all pipelines</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {pipeline?.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{pipeline.description}</p>
            )}
            {stats && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>
                  {stats.openCount} open {stats.openCount === 1 ? "deal" : "deals"}
                </span>
                <span aria-hidden>·</span>
                <span>
                  <CurrencyTotalsText totals={stats.openValue} className="font-medium text-foreground" /> open value
                </span>
                <span aria-hidden>·</span>
                <span>{stats.winRate === null ? "No closed deals yet" : `${stats.winRate}% win rate`}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex items-center gap-1 rounded-lg border p-1" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <LayoutGrid className="h-4 w-4" /> Board
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <List className="h-4 w-4" /> List
            </button>
          </div>
          {isAdmin && pipeline && (
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" /> Manage Stages
            </Button>
          )}
          <Button variant="outline" onClick={() => setCardsOpen(true)}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Customize Cards
          </Button>
          {!archived && (
            <Button
              onClick={() => {
                setNewDealStage(null);
                setNewDealOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New Deal
            </Button>
          )}
        </div>
      </div>

      {archived && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <Archive className="h-4 w-4 shrink-0 text-amber-600" />
          This pipeline is archived. Its deals stay viewable; restore it from All Pipelines to add or move deals.
        </div>
      )}

      <div className="border-t pt-4">
        <DealFilterBar
          filters={filters}
          onChange={setFilters}
          stages={stages}
          countries={countries}
          territories={territories}
          showTerritoryFilter={scopingOn && isAdmin}
        />
      </div>

      {loading && !pipeline ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-96 w-72 shrink-0 animate-pulse rounded-2xl border bg-muted/30" />
          ))}
        </div>
      ) : view === "board" ? (
        <PipelineBoard
          stages={stages}
          columns={columns}
          territories={territories}
          collapsed={collapsed}
          cardFields={cardFields}
          readOnly={archived}
          onToggleCollapse={toggleCollapse}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          onOpenDeal={setEditingDeal}
          onAddDeal={(stageId) => {
            setNewDealStage(stageId);
            setNewDealOpen(true);
          }}
          onMoveDeal={moveDeal}
          onCompletedChange={() => void loadBoard(true)}
        />
      ) : (
        <DealListView
          rows={list.rows}
          stages={stages}
          sort={sort}
          onSort={(s) => {
            setSort(s);
            setPage(1);
          }}
          page={page}
          pageCount={list.pageCount}
          total={list.total}
          onPage={setPage}
          onOpenDeal={setEditingDeal}
          loading={loading}
        />
      )}

      <NewDealDialog
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
        defaultPipelineId={pipelineId}
        defaultStageId={newDealStage ?? undefined}
        onCreated={() => void reload(true)}
      />

      <EditDealDialog
        deal={editingDeal}
        open={!!editingDeal}
        onOpenChange={(o) => !o && setEditingDeal(null)}
        territories={territories}
        onSaved={() => void reload(true)}
      />

      {pipeline && isAdmin && (
        <ManageStagesDialog
          subAccountId={subAccountId}
          pipeline={pipeline}
          open={manageOpen}
          onOpenChange={setManageOpen}
          stageCounts={allStageCounts}
          onSaved={(p) => {
            setPipeline(p);
            void reload(true);
            void loadPipelines();
          }}
        />
      )}

      <CustomizeCardsDialog
        open={cardsOpen}
        onOpenChange={setCardsOpen}
        fields={cardFields}
        onChange={setCardFields}
        onReset={resetCardFields}
      />
    </div>
  );
}
