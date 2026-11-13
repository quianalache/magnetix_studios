"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SearchField } from "@/components/system/search-field";
import { OptionSelect } from "@/components/system/option-select";
import { Pagination } from "@/components/system/pagination";
import { EmptyState } from "@/components/system/empty-state";
import { cn } from "@/lib/utils";
import type { RunListItem, RunListResponse, RunRange, RunStatusFilter } from "@/types/workflow-runs";
import { formatRunTime, initials, RANGE_OPTIONS, RunStatusPill, RunTestBadge, STATUS_FILTER_OPTIONS } from "./run-badges";
import { RunDetailPanel } from "./run-detail-panel";

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

/**
 * Runs list (CRM Foundations Batch B). `workflowId` set → one workflow's
 * runs (Builder → Runs); null → every workflow in the workspace (Workflows
 * → Runs), starting on Failed. Server-side filters + paging; `?run=` opens
 * one run's details (survives refresh, shareable).
 */
export function RunsView(props: { saId: string; workflowId: string | null }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RunsViewInner {...props} />
    </Suspense>
  );
}

function RunsViewInner({ saId, workflowId }: { saId: string; workflowId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("run");
  const workspace = workflowId === null;
  const desktop = useIsDesktop();

  const [status, setStatus] = useState<RunStatusFilter>(workspace ? "failed" : "all");
  const [range, setRange] = useState<RunRange>("30d");
  const [wfFilter, setWfFilter] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RunListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);
  useEffect(() => setPage(1), [status, range, wfFilter, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status, range, page: String(page) });
    if (q) params.set("q", q);
    if (workspace && wfFilter) params.set("workflowId", wfFilter);
    const base = workspace ? `/api/sub-accounts/${saId}/workflows/runs` : `/api/sub-accounts/${saId}/workflows/${workflowId}/runs`;
    fetch(`${base}?${params}`, { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as RunListResponse & { error?: string };
        if (!r.ok) throw new Error(b.error ?? "Couldn't load runs.");
        if (!cancelled) setData(b);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [saId, workflowId, workspace, status, range, wfFilter, q, page, nonce]);

  const select = useCallback(
    (runId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (runId) next.set("run", runId);
      else next.delete("run");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const statusOptions = workspace ? STATUS_FILTER_OPTIONS.filter((o) => o.value !== "all") : STATUS_FILTER_OPTIONS;
  const workflowOptions = useMemo(() => [{ value: "__all", label: "All workflows" }, ...(data?.workflows ?? []).map((w) => ({ value: w.id, label: w.name }))], [data]);
  const runs = data?.runs ?? [];
  const failedView = workspace && status === "failed";

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        value={qInput}
        onChange={setQInput}
        placeholder={workspace ? "Search contact, workflow or error…" : "Search contact…"}
        aria-label="Search runs"
        className="min-w-0 flex-1 basis-56"
      />
      <OptionSelect<RunStatusFilter> aria-label="Status" value={status} onChange={(v) => v && setStatus(v)} options={statusOptions} className="w-40" />
      {workspace ? (
        <OptionSelect<string> aria-label="Workflow" value={wfFilter ?? "__all"} onChange={(v) => setWfFilter(!v || v === "__all" ? null : v)} options={workflowOptions} className="w-48" />
      ) : null}
      <OptionSelect<RunRange> aria-label="Date range" value={range} onChange={(v) => v && setRange(v)} options={RANGE_OPTIONS} className="w-40" />
    </div>
  );

  const list = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {data ? `${data.total.toLocaleString()} ${data.total === 1 ? "run" : "runs"}` : " "}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setNonce((n) => n + 1)} disabled={loading}>
          <RefreshCw className={cn(loading && "animate-spin")} aria-hidden="true" /> Refresh
        </Button>
      </div>
      {error && !data ? (
        <Alert tone="danger" title="Couldn't load runs.">
          {error}
        </Alert>
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : runs.length === 0 ? (
        <EmptyState
          compact
          title={q || status !== (workspace ? "failed" : "all") || range !== "30d" || wfFilter ? "No runs match these filters" : workspace ? "No failed runs" : "No runs yet"}
          description={
            workspace
              ? "Runs that match these filters across every workflow will show here."
              : "Trigger this workflow or use Test to enroll a contact."
          }
        />
      ) : (
        <>
          {/* Desktop: table. */}
          <div className="relative hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-th font-semibold text-muted-foreground uppercase">
                  {workspace ? <th scope="col" className="px-3 py-2.5">Workflow</th> : null}
                  <th scope="col" className="px-3 py-2.5">Contact</th>
                  {failedView ? (
                    <>
                      <th scope="col" className="px-3 py-2.5">Failed step</th>
                      <th scope="col" className="px-3 py-2.5">Error</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="px-3 py-2.5">Trigger</th>
                      <th scope="col" className="px-3 py-2.5">Status</th>
                    </>
                  )}
                  <th scope="col" className="px-3 py-2.5">Started</th>
                  {!workspace || !desktop || !selected ? <th scope="col" className="px-3 py-2.5">Last updated</th> : null}
                  <th scope="col" className="px-3 py-2.5"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => select(r.id)}
                    aria-selected={r.id === selected}
                    className={cn("cursor-pointer border-b last:border-b-0 hover:bg-muted/40", r.id === selected && "bg-tint-violet")}
                  >
                    {workspace ? (
                      <td className="px-3 py-2.5 align-top">
                        <span className="block font-medium">{r.workflowName ?? "Workflow deleted"}</span>
                        <RunTestBadge test={r.test} testRelated={r.testRelated} />
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 align-top">
                      <ContactCell run={r} />
                    </td>
                    {failedView ? (
                      <>
                        <td className="px-3 py-2.5 align-top">{r.failedStep?.label ?? "—"}</td>
                        <td className="max-w-[16rem] px-3 py-2.5 align-top text-muted-foreground">
                          <span className="line-clamp-2">{r.errorSummary ?? "—"}</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 align-top">{r.trigger}</td>
                        <td className="px-3 py-2.5 align-top">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <RunStatusPill status={r.status} />
                            {!workspace ? <RunTestBadge test={r.test} testRelated={r.testRelated} /> : null}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2.5 align-top whitespace-nowrap">{formatRunTime(r.enrolledAtMs)}</td>
                    {!workspace || !desktop || !selected ? <td className="px-3 py-2.5 align-top whitespace-nowrap">{formatRunTime(r.updatedAtMs)}</td> : null}
                    <td className="px-3 py-2.5 text-right align-top">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          select(r.id);
                        }}
                      >
                        View details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: cards. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => select(r.id)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <RunStatusPill status={r.status} />
                      <RunTestBadge test={r.test} testRelated={r.testRelated} />
                      <span className="ml-auto text-caption text-muted-foreground">{formatRunTime(r.enrolledAtMs)}</span>
                    </span>
                    <span className="mt-1 block truncate font-medium">{workspace ? r.workflowName ?? "Workflow deleted" : r.contactName ?? "Contact unavailable"}</span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {workspace ? `${r.contactName ?? "Contact unavailable"} · ` : ""}
                      {r.status === "failed" ? `${r.failedStep?.label ?? "Run"} failed — ${r.errorSummary ?? ""}` : r.trigger}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} itemLabel={data.total === 1 ? "run" : "runs"} />
          {data.truncated ? (
            <p className="text-caption text-muted-foreground">Showing the most recent 5,000 runs this view can scan. Narrow the filters to see older runs.</p>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {filters}
      {selected && desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,26rem)] items-start gap-5">
          {list}
          <RunDetailPanel key={selected} saId={saId} runId={selected} workflowId={workflowId} onClose={() => select(null)} className="sticky top-4" />
        </div>
      ) : (
        list
      )}
      {!desktop ? (
        <Sheet open={!!selected} onOpenChange={(o) => !o && select(null)}>
          <SheetContent side="right" className="w-full max-w-full overflow-y-auto p-0 sm:max-w-md data-[side=right]:w-full">
            <SheetTitle className="sr-only">Run details</SheetTitle>
            {selected ? (
              <RunDetailPanel key={selected} saId={saId} runId={selected} workflowId={workflowId} onClose={() => select(null)} className="rounded-none border-0" />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

function ContactCell({ run }: { run: RunListItem }) {
  if (!run.contactName) return <span className="text-muted-foreground">Contact unavailable</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-micro font-semibold text-tag-violet-fg">{initials(run.contactName)}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{run.contactName}</span>
        {run.contactEmail ? <span className="block truncate text-caption text-muted-foreground">{run.contactEmail}</span> : null}
      </span>
    </span>
  );
}
