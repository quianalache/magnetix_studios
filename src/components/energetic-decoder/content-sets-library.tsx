"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleDot,
  Copy,
  Download,
  FilePen,
  FileText,
  FileUp,
  Layers,
  Link2,
  Loader2,
  MoreVertical,
  Pencil,
  PlusCircle,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  CONTENT_SET_DESCRIPTION_MAX,
  CONTENT_SET_NAME_MAX,
  DEFAULT_CONTENT_SET_ID,
  type ContentSetStatus,
} from "@/lib/energetic-decoder/content-sets";
import {
  Breadcrumb,
  CS_SCOPE,
  IconTile,
  PageHeader,
  StatusPill,
  displayTitle,
  setTile,
} from "@/components/energetic-decoder/content-sets-visuals";

export { StatusPill } from "@/components/energetic-decoder/content-sets-visuals";

/**
 * Content Sets library (2026-10-07). Visuals follow the owner-approved
 * mockup (01/04): breadcrumb + serif title, a white card with search,
 * status filter, Import / Create, then a table — Name (tile, name,
 * "Used in" chip, description) · Status · Updated · Actions — and a
 * "Showing x–y of n" footer. Completeness never appears here.
 */

export interface ContentSetRow {
  id: string;
  name: string;
  description: string;
  status: ContentSetStatus;
  isDefault: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
  usageCount: number;
}

interface UsageResponse {
  reportDesigns: { id: string; title: string; updatedAt: string | null }[];
  implicit: boolean;
}

type StatusFilter = "all" | ContentSetStatus;
type SortKey = "name" | "status" | "updated";
const PAGE_SIZE = 25;

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" });
export function formatSetDate(iso: string | null): string {
  return iso ? DATE_FMT.format(new Date(iso)) : "—";
}

export function ContentSetsLibrary({ onOpenSet, onHome }: { onOpenSet: (id: string) => void; onHome?: () => void }) {
  const { subAccountId, isAdmin } = useSubAccount();
  const base = `/api/sub-accounts/${subAccountId}/energetic-decoder/content-sets`;
  const [sets, setSets] = useState<ContentSetRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ContentSetRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentSetRow | null>(null);

  function load() {
    if (!subAccountId) return;
    fetch(base)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { sets?: ContentSetRow[] }) => {
        setSets(d.sets ?? []);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }
  useEffect(load, [subAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (sets ?? []).filter(
      (s) => (statusFilter === "all" || s.status === statusFilter) && (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    );
    if (!sort) return list; // server order: Default first, then by name
    const val = (s: ContentSetRow) => (sort.key === "name" ? s.name.toLowerCase() : sort.key === "status" ? s.status : s.updatedAt ?? "");
    return [...list].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [sets, query, statusFilter, sort]);
  useEffect(() => setPage(1), [query, statusFilter, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  }

  async function mutate<T>(key: string, fn: () => Promise<Response>, success: string): Promise<T | null> {
    setBusy(key);
    try {
      const res = await fn();
      const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      toast.success(success);
      load();
      return body;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const json = (body: unknown) => ({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  function duplicate(set: ContentSetRow) {
    void mutate(`dup:${set.id}`, () => fetch(`${base}/${set.id}/duplicate`, { method: "POST" }), `Duplicated “${set.name}” as a Draft.`);
  }
  function toggleStatus(set: ContentSetRow) {
    const next: ContentSetStatus = set.status === "active" ? "draft" : "active";
    void mutate(`status:${set.id}`, () => fetch(`${base}/${set.id}`, json({ status: next })), `“${set.name}” is now ${next === "active" ? "Active" : "a Draft"}.`);
  }
  async function exportSet(set: ContentSetRow) {
    setBusy(`export:${set.id}`);
    try {
      const res = await fetch(`${base}/${set.id}/export`);
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed.");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "content-set.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <PageHeader
      icon={Sparkles}
      title="Content Sets"
      description="Content sets hold reusable interpretation content for your reports. Create, edit, and manage content for different focuses, languages, and audiences — all in one place."
      breadcrumb={<Breadcrumb items={[{ label: "Energetic Decoder", onClick: onHome }, { label: "Content Sets" }]} />}
    />
  );

  if (loadError) {
    return (
      <div className={cn(CS_SCOPE, "min-w-0 space-y-6")}>
        {header}
        <div className="rounded-2xl border bg-card p-6 text-sm text-[var(--cs-body)]">
          Couldn&apos;t load content sets.{" "}
          <button type="button" className="font-medium text-[var(--cs-link)] underline" onClick={load}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const statusLabel = statusFilter === "all" ? "All Statuses" : statusFilter === "active" ? "Active" : "Draft";

  return (
    <div className={cn(CS_SCOPE, "min-w-0 space-y-6")} data-content-sets-library>
      {header}

      <div className="@container/cslib min-w-0 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(26,18,56,0.04)] sm:p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-60 @min-[900px]/cslib:max-w-[330px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--cs-subtle)]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search content sets..." className="h-11 rounded-xl bg-card pl-11 text-[15px]" aria-label="Search content sets" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Filter by status"
              className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-[15px] font-medium text-[var(--cs-ink)] hover:bg-[var(--cs-tint)]"
            >
              <span className={cn("h-2.5 w-2.5 rounded-full", statusFilter === "draft" ? "bg-[var(--cs-draft-dot)]" : "bg-[var(--cs-active-dot)]")} />
              {statusLabel}
              <ChevronDown className="h-4 w-4 text-[var(--cs-subtle)]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={CS_SCOPE}>
              {(["all", "active", "draft"] as const).map((f) => (
                <DropdownMenuItem key={f} onClick={() => setStatusFilter(f)} aria-checked={statusFilter === f}>
                  {f === "all" ? "All Statuses" : f === "active" ? "Active" : "Draft"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {isAdmin && (
            <div className="flex w-full flex-wrap gap-3 @min-[640px]/cslib:ml-auto @min-[640px]/cslib:w-auto">
              <Button variant="outline" className="h-11 flex-1 rounded-xl border-input px-5 text-[15px] text-[var(--cs-link)] @min-[640px]/cslib:flex-none" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-[18px] w-[18px]" />
                Import
              </Button>
              <Button className="h-11 flex-1 rounded-xl px-5 text-[15px] @min-[640px]/cslib:flex-none" onClick={() => setCreateOpen(true)}>
                <PlusCircle className="mr-2 h-[18px] w-[18px]" />
                Create Content Set
              </Button>
            </div>
          )}
        </div>

        {!sets ? (
          <div className="h-48 animate-pulse rounded-xl bg-[var(--cs-head)]" />
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-[var(--cs-subtle)] opacity-50" />
            <p className="text-sm text-[var(--cs-body)]">No content sets match.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[minmax(0,1fr)_170px_170px_72px] items-center gap-4 bg-[var(--cs-head)] px-5 py-3.5 text-[15px] font-semibold text-[var(--cs-ink)] @min-[760px]/cslib:grid">
              <SortHead label="Name" k="name" sort={sort} onSort={toggleSort} />
              <SortHead label="Status" k="status" sort={sort} onSort={toggleSort} />
              <SortHead label="Updated" k="updated" sort={sort} onSort={toggleSort} />
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y">
              {shown.map((set) => {
                const tile = setTile(set);
                return (
                  <li
                    key={set.id}
                    data-set-row={set.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 bg-card px-4 py-4 @min-[760px]/cslib:grid-cols-[minmax(0,1fr)_170px_170px_72px] @min-[760px]/cslib:px-5"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <IconTile icon={tile.icon} tone={tile.tone} className="mt-0.5 max-sm:h-11 max-sm:w-11" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <button type="button" onClick={() => onOpenSet(set.id)} className="min-w-0 break-words text-left text-[17px] font-semibold text-[var(--cs-link)] hover:underline">
                            {set.name}
                          </button>
                          <UsedIn set={set} base={base} />
                        </div>
                        {set.description && <p className="mt-1 break-words text-[15px] text-[var(--cs-subtle)]">{set.description}</p>}
                      </div>
                    </div>
                    <div className="col-start-1 row-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-[60px] @min-[760px]/cslib:contents">
                      <StatusPill status={set.status} className="@min-[760px]/cslib:px-4" />
                      <div className="text-[15px] leading-tight">
                        <p className="tabular-nums text-[var(--cs-ink)]">{formatSetDate(set.updatedAt)}</p>
                        {set.updatedByEmail && <p className="mt-0.5 break-all text-[13px] text-[var(--cs-subtle)]">by {set.updatedByEmail}</p>}
                      </div>
                    </div>
                    <div className="col-start-2 row-span-2 row-start-1 flex justify-end self-start @min-[760px]/cslib:col-start-auto @min-[760px]/cslib:row-span-1 @min-[760px]/cslib:row-start-auto @min-[760px]/cslib:self-center">
                      {busy?.endsWith(set.id) ? (
                        <Loader2 className="m-2.5 h-5 w-5 animate-spin text-[var(--cs-subtle)]" />
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--cs-link)] hover:bg-[var(--cs-tint)]">
                            <MoreVertical className="h-5 w-5" />
                            <span className="sr-only">Actions for {set.name}</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className={CS_SCOPE}>
                            <DropdownMenuItem onClick={() => onOpenSet(set.id)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              {isAdmin ? "Edit" : "Open"}
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                {!set.isDefault && (
                                  <DropdownMenuItem onClick={() => setRenameTarget(set)}>
                                    <FilePen className="mr-2 h-3.5 w-3.5" />
                                    Rename &amp; describe
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => duplicate(set)}>
                                  <Copy className="mr-2 h-3.5 w-3.5" />
                                  Duplicate
                                </DropdownMenuItem>
                                {!set.isDefault && (
                                  <DropdownMenuItem onClick={() => toggleStatus(set)}>
                                    <CircleDot className="mr-2 h-3.5 w-3.5" />
                                    {set.status === "active" ? "Mark as Draft" : "Mark as Active"}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => void exportSet(set)}>
                                  <Download className="mr-2 h-3.5 w-3.5" />
                                  Export
                                </DropdownMenuItem>
                                {!set.isDefault && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(set)}>
                                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {sets && filtered.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-[var(--cs-subtle)]" data-library-count>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} content set{filtered.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2" aria-label="Pages">
              <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="flex h-10 w-11 items-center justify-center rounded-lg border bg-card text-[var(--cs-link)] disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex h-10 min-w-11 items-center justify-center rounded-lg bg-primary px-3 text-[15px] font-semibold text-primary-foreground" aria-current="page">
                {page}
              </span>
              <button type="button" disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="flex h-10 w-11 items-center justify-center rounded-lg border bg-card text-[var(--cs-link)] disabled:opacity-40" aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateContentSetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sets={sets ?? []}
        base={base}
        onCreated={(id) => {
          load();
          onOpenSet(id);
        }}
      />
      <ImportContentSetDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        base={base}
        onCreated={(id) => {
          load();
          onOpenSet(id);
        }}
      />
      <RenameDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={async (name, description) => {
          if (!renameTarget) return;
          const ok = await mutate(`rename:${renameTarget.id}`, () => fetch(`${base}/${renameTarget.id}`, json({ name, description })), "Saved.");
          if (ok) setRenameTarget(null);
        }}
        busy={!!busy?.startsWith("rename:")}
      />
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className={cn(CS_SCOPE, "rounded-2xl p-6 sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[var(--cs-ink)]">Delete &ldquo;{deleteTarget?.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 text-[15px] text-[var(--cs-body)]">
            {deleteTarget && deleteTarget.usageCount > 0 ? (
              <p>
                This set is used in {deleteTarget.usageCount} report design{deleteTarget.usageCount === 1 ? "" : "s"}, so it
                can&apos;t be deleted. Switch those designs to another set first.
              </p>
            ) : (
              <p>This permanently removes the set and everything written in it. Reports you&apos;ve already generated keep their saved text.</p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" className="h-11 rounded-xl px-5" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="h-11 rounded-xl px-5"
                disabled={!!busy?.startsWith("delete:") || (deleteTarget?.usageCount ?? 0) > 0}
                onClick={async () => {
                  if (!deleteTarget) return;
                  const ok = await mutate(`delete:${deleteTarget.id}`, () => fetch(`${base}/${deleteTarget.id}`, { method: "DELETE" }), "Content set deleted.");
                  if (ok) setDeleteTarget(null);
                }}
              >
                Delete set
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHead({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (k: SortKey) => void }) {
  const active = sort?.key === k;
  return (
    <div role="columnheader" aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex w-fit items-center gap-1.5 text-left hover:text-[var(--cs-link)]">
        {label}
        <ChevronsUpDown className={cn("h-4 w-4", active ? "text-[var(--cs-link)]" : "text-[var(--cs-subtle)]")} />
      </button>
    </div>
  );
}

/** "Used in N report designs" chip — opens the real list (a popover on desktop, a bottom sheet on phones). */
function UsedIn({ set, base }: { set: ContentSetRow; base: string }) {
  const isMobile = useIsMobile();
  const { saPath } = useSubAccount();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(false);
    fetch(`${base}/${set.id}/usage`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { usage: UsageResponse }) => setUsage(d.usage))
      .catch(() => setError(true));
  }, [open, base, set.id]);

  const label = `Used in ${set.usageCount} report design${set.usageCount === 1 ? "" : "s"}`;
  const places = `Used in ${set.usageCount} place${set.usageCount === 1 ? "" : "s"}`;
  if (set.usageCount === 0) {
    return <span className="inline-flex items-center rounded-full bg-[var(--cs-idle-bg)] px-3 py-1 text-[13px] text-[var(--cs-subtle)]">Not used in any report designs</span>;
  }

  const list = (
    <div data-used-in-list>
      {set.isDefault && <p className="mb-2 text-[13px] text-[var(--cs-subtle)]">Report designs that haven&apos;t picked a content set use Default.</p>}
      {error ? (
        <p className="py-2 text-sm text-[var(--cs-body)]">Couldn&apos;t load where this set is used.</p>
      ) : !usage ? (
        <Loader2 className="my-2 h-4 w-4 animate-spin text-[var(--cs-subtle)]" />
      ) : (
        <ul className="divide-y">
          {usage.reportDesigns.map((d) => (
            <li key={d.id}>
              <a href={saPath(`/energetic-decoder/reports/${d.id}`)} className="-mx-2 flex items-center gap-3.5 rounded-lg px-2 py-2.5 hover:bg-[var(--cs-tint)]">
                <IconTile icon={FileText} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-[var(--cs-ink)]">{d.title}</span>
                  <span className="block text-[13px] text-[var(--cs-subtle)]">Report Design</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-left text-[13px] font-medium text-[var(--cs-link)] transition",
        open ? "border-[var(--cs-violet-fg)] bg-[var(--cs-tint)]" : "border-transparent bg-[var(--cs-tint)] hover:border-[var(--cs-violet-fg)]/40",
      )}
    >
      <Link2 className="h-3.5 w-3.5 shrink-0 -rotate-45" />
      {label}
    </span>
  );

  if (isMobile) {
    return (
      <>
        <button type="button" className="text-left" onClick={() => setOpen(true)} aria-haspopup="dialog">
          {chip}
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className={cn(CS_SCOPE, "max-h-[80vh] overflow-y-auto rounded-t-2xl bg-card")}>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2.5 text-lg font-semibold text-[var(--cs-link)]">
                <Link2 className="h-5 w-5 -rotate-45" />
                {places}
              </SheetTitle>
              <SheetDescription className="text-[var(--cs-subtle)]">{set.name}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">{list}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={label} className="text-left">
        {chip}
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(CS_SCOPE, "w-[380px] rounded-2xl border bg-card p-4 shadow-[0_12px_40px_rgba(46,16,101,0.14)]")}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 text-[17px] font-semibold text-[var(--cs-link)]">
            <Link2 className="h-5 w-5 -rotate-45" />
            {places}
          </p>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-[var(--cs-link)] hover:bg-[var(--cs-tint)]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {list}
      </PopoverContent>
    </Popover>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.trim().length;
  return <span className={cn("text-[13px] tabular-nums", n > max ? "font-semibold text-destructive" : "text-[var(--cs-subtle)]")}>{n} / {max}</span>;
}

function CreateContentSetDialog({
  open,
  onOpenChange,
  sets,
  base,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sets: ContentSetRow[];
  base: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startFrom, setStartFrom] = useState<"default" | "blank" | "existing">("default");
  const [sourceId, setSourceId] = useState("");
  const [saving, setSaving] = useState(false);
  const custom = sets.filter((s) => !s.isDefault);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setStartFrom("default");
      setSourceId("");
    }
  }, [open]);

  const invalid = !name.trim() || name.trim().length > CONTENT_SET_NAME_MAX || description.trim().length > CONTENT_SET_DESCRIPTION_MAX || (startFrom === "existing" && !sourceId);

  async function submit() {
    if (invalid) return;
    setSaving(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, startFrom: startFrom === "existing" ? sourceId : startFrom === "default" ? DEFAULT_CONTENT_SET_ID : "blank" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; set?: { id: string } };
      if (!res.ok || !body.set) throw new Error(body.error ?? "Couldn’t create the content set.");
      toast.success("Content set created as a Draft.");
      onOpenChange(false);
      onCreated(body.set.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t create the content set.");
    } finally {
      setSaving(false);
    }
  }

  const options: { key: typeof startFrom; title: string; body: string; icon: typeof Sparkles; disabled?: boolean }[] = [
    { key: "default", title: "Default", body: "Core interpretations and foundations used in reports.", icon: Sparkles },
    { key: "blank", title: "Blank", body: "Start with an empty content set.", icon: FileText },
    { key: "existing", title: "Existing Content Set", body: custom.length ? "Copy content from an existing set." : "Create a set first to copy it.", icon: Layers, disabled: custom.length === 0 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CS_SCOPE, "max-h-[92dvh] gap-0 overflow-y-auto rounded-3xl p-5 sm:max-w-[740px] sm:p-8")}>
        <DialogHeader className="gap-3 pr-8 text-left">
          <div className="flex items-center gap-4">
            <IconTile icon={Sparkles} shape="circle" size="lg" className="max-sm:h-12 max-sm:w-12" />
            <DialogTitle className={cn(displayTitle, "text-[30px] font-normal leading-tight sm:text-[42px]")}>Create Content Set</DialogTitle>
          </div>
          <DialogDescription className="text-[15px] leading-relaxed text-[var(--cs-body)] sm:text-base">
            Content sets hold reusable interpretation content for your reports. Create a new content set to organize and manage content for a specific
            focus or audience.
          </DialogDescription>
        </DialogHeader>
        <form
          className="mt-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="cs-name" className="text-base font-semibold text-[var(--cs-ink)]">
              Content Set name <span className="text-destructive">*</span>
            </Label>
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={CONTENT_SET_NAME_MAX} placeholder="e.g. Business & Career (Spanish)" className="h-12 rounded-xl bg-card text-[15px]" autoFocus />
            <p className="text-[14px] leading-relaxed text-[var(--cs-subtle)]">
              Choose a clear, descriptive name for your content set. You can include a language in the name if needed, such as “Business &amp; Career
              (Spanish)”.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="cs-desc" className="text-base font-semibold text-[var(--cs-ink)]">
                Description (optional)
              </Label>
              <CharCount value={description} max={CONTENT_SET_DESCRIPTION_MAX} />
            </div>
            <Textarea
              id="cs-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={description.trim().length > CONTENT_SET_DESCRIPTION_MAX}
              placeholder="e.g. Interpretations, guidance, and insights for career, money, and professional alignment."
              className="rounded-xl bg-card px-4 py-3 text-[15px]"
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-lg font-semibold text-[var(--cs-ink)]">Start from</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {options.map((o) => {
                const selected = startFrom === o.key;
                return (
                  <label
                    key={o.key}
                    className={cn(
                      "relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-card px-4 pb-4 pt-5 text-center transition max-sm:flex-row max-sm:items-start max-sm:pl-12 max-sm:text-left",
                      selected ? "border-[1.5px] border-[var(--cs-violet-fg)] bg-[var(--cs-tint)]" : "hover:border-[var(--cs-violet-fg)]/40",
                      o.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input type="radio" name="cs-start" className="absolute left-4 top-4 h-5 w-5 accent-[var(--primary)]" checked={selected} disabled={o.disabled} onChange={() => setStartFrom(o.key)} />
                    <IconTile icon={o.icon} shape="circle" size="sm" className={cn(selected ? "bg-[var(--cs-tint-strong)]" : "")} />
                    <span className="w-full min-w-0">
                      <span className="block text-[17px] font-semibold text-[var(--cs-ink)]">{o.title}</span>
                      <span className="mt-1 block text-[14px] leading-snug text-[var(--cs-subtle)]">{o.body}</span>
                      {o.key === "existing" && custom.length > 0 && (
                        <select
                          aria-label="Content set to copy"
                          value={sourceId}
                          onChange={(e) => {
                            setSourceId(e.target.value);
                            setStartFrom("existing");
                          }}
                          className="mt-3 h-10 w-full rounded-lg border border-input bg-card px-2.5 text-[13px] text-[var(--cs-body)]"
                        >
                          <option value="">Choose a source content set</option>
                          {custom.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button type="button" variant="outline" className="h-12 min-w-[130px] rounded-xl border-input px-6 text-base font-semibold text-[var(--cs-link)] max-sm:flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || saving} className="h-12 rounded-xl px-6 text-base max-sm:flex-1">
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create Content Set
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  target,
  onClose,
  onSave,
  busy,
}: {
  target: ContentSetRow | null;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (target) {
      setName(target.name);
      setDescription(target.description);
    }
  }, [target]);
  const invalid = !name.trim() || description.trim().length > CONTENT_SET_DESCRIPTION_MAX;
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(CS_SCOPE, "rounded-2xl p-6 sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[var(--cs-ink)]">Rename content set</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) onSave(name, description);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="cs-rename" className="font-semibold text-[var(--cs-ink)]">
              Content Set name
            </Label>
            <Input id="cs-rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={CONTENT_SET_NAME_MAX} className="h-11 rounded-xl bg-card" autoFocus />
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="cs-rename-desc" className="font-semibold text-[var(--cs-ink)]">
                Description (optional)
              </Label>
              <CharCount value={description} max={CONTENT_SET_DESCRIPTION_MAX} />
            </div>
            <Textarea id="cs-rename-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={description.trim().length > CONTENT_SET_DESCRIPTION_MAX} className="rounded-xl bg-card" />
          </div>
          <Button type="submit" disabled={invalid || busy} className="h-11 w-full rounded-xl">
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ImportPreviewResponse {
  ok: boolean;
  name: string;
  description: string;
  recognized: number;
  errors: string[];
  skipped: string[];
}

/** Import = validate a Magnetix export file, preview it, then create a NEW Draft set (never overwrites). */
function ImportContentSetDialog({ open, onOpenChange, base, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; base: string; onCreated: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
      setName("");
    }
  }, [open]);

  async function post(commit: boolean, parsed: unknown) {
    const res = await fetch(`${base}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: parsed, commit, name }) });
    return { res, body: (await res.json().catch(() => ({}))) as { error?: string; preview?: ImportPreviewResponse; created?: { id: string } } };
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await f.text());
      } catch {
        setPreview({ ok: false, name: "", description: "", recognized: 0, errors: ["This file isn’t valid JSON."], skipped: [] });
        return;
      }
      setFile(parsed);
      const { body } = await post(false, parsed);
      setPreview(body.preview ?? { ok: false, name: "", description: "", recognized: 0, errors: [body.error ?? "Couldn’t read this file."], skipped: [] });
      setName(body.preview?.name ?? "");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const { res, body } = await post(true, file);
      if (!res.ok || !body.created) throw new Error(body.error ?? "Import failed.");
      toast.success("Imported as a new Draft content set.");
      onOpenChange(false);
      onCreated(body.created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CS_SCOPE, "max-h-[90dvh] overflow-y-auto rounded-2xl p-6 sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[var(--cs-ink)]">Import a content set</DialogTitle>
          <DialogDescription className="text-[var(--cs-body)]">Choose a file exported from Magnetix. It becomes a new Draft set — nothing existing is overwritten.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} aria-label="Content set file" />
          <Button variant="outline" className="h-11 w-full rounded-xl text-[var(--cs-link)]" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy && !preview ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />}
            Choose file
          </Button>
          {preview && (
            <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
              {preview.ok ? (
                <>
                  <p className="text-[var(--cs-body)]">
                    <span className="font-semibold text-[var(--cs-ink)]">{preview.recognized}</span> entries ready to import.
                    {preview.skipped.length > 0 && <span className="text-[var(--cs-subtle)]"> {preview.skipped.length} skipped (not in this workspace).</span>}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="cs-import-name" className="font-semibold text-[var(--cs-ink)]">
                      Content Set name
                    </Label>
                    <Input id="cs-import-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={CONTENT_SET_NAME_MAX} className="h-11 rounded-xl bg-card" />
                  </div>
                </>
              ) : (
                <ul className="list-disc space-y-1 pl-4 text-destructive">
                  {preview.errors.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" className="h-11 rounded-xl px-5" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="h-11 rounded-xl px-5" onClick={() => void confirm()} disabled={!preview?.ok || !name.trim() || busy}>
              Import as Draft
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
