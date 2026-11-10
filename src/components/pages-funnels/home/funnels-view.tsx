"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Archive, Eye, EyeOff, Filter, Layers, MoreHorizontal, Plus, RefreshCw, SearchX, SquareArrowOutUpRight } from "lucide-react";
import { DATA_TABLE_HEAD_ROW, DATA_TABLE_ROW, DATA_TABLE_TD, DATA_TABLE_TH, DataTableShell } from "@/components/system/data-table";
import { EmptyState } from "@/components/system/empty-state";
import { FilterBar } from "@/components/system/filter-bar";
import { OptionSelect } from "@/components/system/option-select";
import { Pagination } from "@/components/system/pagination";
import { SearchField } from "@/components/system/search-field";
import { StatusPill } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";
import { clampPage, filterFunnels, FUNNELS_PER_PAGE, FUNNEL_STATUS_LABELS, type PagesLibraryFunnel } from "@/lib/pages-funnels/library";
import type { FunnelStatus } from "@/types/checkout";
import type { LoadState } from "@/components/pages-funnels/home/use-pages-library";

const STATUS_OPTIONS: { value: FunnelStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];
const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Funnels view of the Pages & Funnels home: a compact list of the
 * workspace's funnels (archived funnels stay hidden, as before) with the
 * actions that already exist — open, publish / unpublish, archive.
 * Desktop and tablet get a table; phones get one card per funnel.
 */
export function FunnelsView({
  funnels,
  state,
  onChanged,
  onCreateFunnel,
}: {
  funnels: PagesLibraryFunnel[];
  state: LoadState;
  onChanged: () => Promise<void>;
  onCreateFunnel: () => void;
}) {
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const { confirm, dialog } = useConfirm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FunnelStatus | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => filterFunnels(funnels, query, status), [funnels, query, status]);
  const current = clampPage(pageNo, filtered.length, FUNNELS_PER_PAGE);
  const visible = filtered.slice((current - 1) * FUNNELS_PER_PAGE, current * FUNNELS_PER_PAGE);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const togglePublish = (f: PagesLibraryFunnel) =>
    run(
      f.id,
      () => commerceFetch(subAccountId, `funnels/${f.id}`, { method: "PATCH", body: { status: f.status === "published" ? "draft" : "published" } }),
      f.status === "published" ? "Funnel unpublished." : "Funnel published.",
    );

  async function archive(f: PagesLibraryFunnel) {
    const ok = await confirm({
      title: `Archive "${f.name}"?`,
      description: "Its checkout stops accepting orders and it leaves this list. Past orders are kept, and its pages aren't deleted.",
      confirmLabel: "Archive funnel",
      tone: "danger",
    });
    if (ok) await run(f.id, () => commerceFetch(subAccountId, `funnels/${f.id}`, { method: "DELETE" }), "Funnel archived.");
  }

  const actionsMenu = (f: PagesLibraryFunnel) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Actions for ${f.name}`}
            disabled={busyId === f.id}
            className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 data-popup-open:bg-muted"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem render={<Link href={saPath(`/pages-funnels/funnels/${f.id}`)} />}>
          <SquareArrowOutUpRight aria-hidden="true" /> Open funnel
        </DropdownMenuItem>
        {isAdmin ? (
          <>
            <DropdownMenuItem onClick={() => void togglePublish(f)}>
              {f.status === "published" ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              {f.status === "published" ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void archive(f)}>
              <Archive aria-hidden="true" /> Archive
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const steps = (n: number) => (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-tag-violet-bg px-2 py-0.5 text-caption font-medium whitespace-nowrap text-tag-violet-fg">
      <Layers className="size-3.5" aria-hidden="true" />
      {n} {n === 1 ? "step" : "steps"}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <FilterBar
        search={<SearchField value={query} onChange={(v) => { setQuery(v); setPageNo(1); }} placeholder="Search funnels…" aria-label="Search funnels" />}
        filters={<OptionSelect aria-label="Status" className="w-40" value={status} onChange={(v) => { setStatus(v); setPageNo(1); }} options={STATUS_OPTIONS} noneLabel="All statuses" />}
      />

      {state === "loading" ? (
        <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-card" aria-busy="true" aria-label="Loading funnels">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : state === "error" ? (
        <EmptyState
          icon={RefreshCw}
          title="Couldn't load your funnels"
          description="Check your connection and try again."
          action={<Button variant="secondary" onClick={() => void onChanged()}>Try again</Button>}
        />
      ) : funnels.length === 0 ? (
        <EmptyState
          icon={Filter}
          sparks
          title="No funnels yet"
          description="A funnel puts your pages and a checkout in order. Each new funnel starts with a Checkout step you can set up."
          action={isAdmin ? <Button onClick={onCreateFunnel}><Plus aria-hidden="true" /> Create funnel</Button> : undefined}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          compact
          title="No funnels match"
          description="Try a different search or status."
          action={<Button variant="secondary" onClick={() => { setQuery(""); setStatus(null); setPageNo(1); }}>Clear filters</Button>}
        />
      ) : (
        <>
          {/* Tablet and up: table */}
          <div className="hidden sm:block">
            <DataTableShell footer={<Pagination page={current} pageSize={FUNNELS_PER_PAGE} total={filtered.length} onPageChange={setPageNo} itemLabel="funnels" />}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW}>
                  <th className={DATA_TABLE_TH}>Funnel</th>
                  <th className={DATA_TABLE_TH}>Steps</th>
                  <th className={DATA_TABLE_TH}>Status</th>
                  <th className={DATA_TABLE_TH}>Last updated</th>
                  <th className={DATA_TABLE_TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((f) => (
                  <tr key={f.id} className={DATA_TABLE_ROW} data-funnel-row={f.id}>
                    <td className={DATA_TABLE_TD}>
                      <Link href={saPath(`/pages-funnels/funnels/${f.id}`)} className="flex items-center gap-3 font-semibold outline-none hover:underline focus-visible:underline">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
                          <Filter className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 truncate">{f.name}</span>
                      </Link>
                    </td>
                    <td className={DATA_TABLE_TD}>{steps(f.stepCount)}</td>
                    <td className={DATA_TABLE_TD}><StatusPill status={f.status}>{FUNNEL_STATUS_LABELS[f.status]}</StatusPill></td>
                    <td className={`${DATA_TABLE_TD} whitespace-nowrap text-muted-foreground`}>{dateFmt.format(f.updatedAt)}</td>
                    <td className={`${DATA_TABLE_TD} w-12 text-right`}>{actionsMenu(f)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTableShell>
          </div>

          {/* Phones: one card per funnel */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {visible.map((f) => (
              <li key={f.id} className="flex items-start gap-3 rounded-card border border-border bg-card p-3 shadow-card" data-funnel-card={f.id}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
                  <Filter className="size-4" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Link href={saPath(`/pages-funnels/funnels/${f.id}`)} className="truncate font-semibold outline-none hover:underline focus-visible:underline">
                    {f.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill status={f.status}>{FUNNEL_STATUS_LABELS[f.status]}</StatusPill>
                    {steps(f.stepCount)}
                  </div>
                  <p className="text-caption text-muted-foreground">Updated {dateFmt.format(f.updatedAt)}</p>
                </div>
                {actionsMenu(f)}
              </li>
            ))}
          </ul>
          <div className="sm:hidden">
            <Pagination page={current} pageSize={FUNNELS_PER_PAGE} total={filtered.length} onPageChange={setPageNo} itemLabel="funnels" />
          </div>
        </>
      )}
    </div>
  );
}
