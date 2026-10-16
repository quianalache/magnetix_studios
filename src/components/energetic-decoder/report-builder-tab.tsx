"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Pencil, Copy, PlusCircle, Trash2, Search, LayoutTemplate } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/system/option-select";
import { useConfirm } from "@/components/system/confirm-dialog";
import { DecoderEditorialPage } from "@/components/energetic-decoder/decoder-shell";
import { CS_SCOPE, StatusPill } from "@/components/energetic-decoder/content-sets-visuals";
import { formatRelativeTime } from "@/lib/format";
import type { ReportDesign } from "@/types/report-blocks";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
] as const;
const PAGE_SIZE_OPTIONS = [
  { value: "letter", label: "US Letter" },
  { value: "a4", label: "A4" },
  { value: "custom", label: "Custom" },
] as const;
const COLS = "@min-[760px]/rdlib:grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1fr)_70px_130px_120px]";

type SetSummary = { id: string; name: string; isDefault: boolean };

export function EnergeticDecoderReportBuilderTab() {
  const { subAccountId } = useSubAccount();
  const [designs, setDesigns] = useState<ReportDesign[] | null>(null);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contentSetId, setContentSetId] = useState("default");
  const [pageSize, setPageSize] = useState<"letter" | "a4" | "custom">("letter");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ReportDesign | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"draft" | "active" | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`).then((r) => r.json()).then((d) => setDesigns(d.designs ?? [])).catch(() => toast.error("Couldn’t load report designs."));
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/content-sets`).then((r) => r.json()).then((d) => setSets((d.sets ?? []).map((s: SetSummary) => ({ id: s.id, name: s.name, isDefault: s.isDefault })))).catch(() => setSets([{ id: "default", name: "Default", isDefault: true }]));
  }
  useEffect(load, [subAccountId]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() || "Untitled Report", contentSetId, pageSize }) });
      if (!res.ok) throw new Error();
      const data = await res.json(); window.location.href = `/sa/${subAccountId}/energetic-decoder/reports/${data.design.id}`;
    } catch { toast.error("Couldn’t create report."); setCreating(false); }
  }
  async function remove(id: string) {
    const ok = await confirm({ title: "Delete this report design?", description: "This can't be undone.", confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    const old = designs; setDesigns((prev) => prev?.filter((d) => d.id !== id) ?? null);
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${id}`, { method: "DELETE" });
    if (!res.ok) { setDesigns(old); toast.error("Couldn’t delete report design."); }
  }
  async function duplicate(id: string) {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return toast.error("Couldn’t duplicate report design.");
    const data = await res.json(); setDesigns((prev) => (prev ? [data.design, ...prev] : [data.design])); toast.success("Duplicated.");
  }
  async function saveRename() {
    if (!renaming) return;
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs/${renaming.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: renameValue.trim() || renaming.title }) });
    if (!res.ok) return toast.error("Couldn’t rename report design.");
    const data = await res.json(); setDesigns((prev) => prev?.map((d) => d.id === renaming.id ? data.design : d) ?? null); setRenaming(null); toast.success("Renamed.");
  }

  const shownDesigns = designs?.filter((d) => (!search.trim() || d.title.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === null || (d.status ?? "draft") === statusFilter)) ?? null;
  const setName = (d: ReportDesign) => sets.find((s) => s.id === (d.contentSetId || "default"))?.name ?? "Default";

  // v2 (2026-10-16): Content Sets' sibling — the same serif header with the
  // planet, the section tabs, and one toolbar card holding search, the status
  // filter, Create and the light table.
  return (
    <DecoderEditorialPage
      icon={LayoutTemplate}
      title="Report Designs"
      description="Compose multi-page reports on a freeform canvas. Each design uses one Content Set and keeps its own visual language."
    >
      <div data-report-designs-library className="@container/rdlib min-w-0 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-60 @min-[900px]/rdlib:max-w-[330px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[var(--cs-subtle)]" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search report designs…" className="h-11 rounded-xl bg-card pl-11" aria-label="Search report designs" />
          </div>
          <OptionSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} noneLabel="All statuses" aria-label="Filter by status" className="h-11 w-44 rounded-xl" />
          <div className="flex w-full @min-[640px]/rdlib:ml-auto @min-[640px]/rdlib:w-auto">
            <Button className="h-11 flex-1 rounded-xl px-5 @min-[640px]/rdlib:flex-none" onClick={() => setOpen(true)}>
              <PlusCircle className="mr-2 size-[18px]" />
              Create report design
            </Button>
          </div>
        </div>

        {designs === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-[var(--cs-head)]" />
        ) : shownDesigns?.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <FileText className="mx-auto mb-3 size-8 text-[var(--cs-subtle)] opacity-50" />
            <p className="text-sm text-[var(--cs-body)]">{designs.length === 0 ? "No report designs yet." : "No report designs match."}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className={`hidden items-center gap-4 bg-[var(--cs-head)] px-5 py-3.5 text-sm font-semibold text-[var(--cs-ink)] @min-[760px]/rdlib:grid ${COLS}`}>
              <span>Name</span>
              <span>Status</span>
              <span>Content set</span>
              <span>Pages</span>
              <span>Updated</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y">
              {shownDesigns?.map((d) => (
                <li key={d.id} data-report-design-row={d.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 bg-card px-4 py-3.5 text-sm @min-[760px]/rdlib:px-5 ${COLS}`}>
                  <Link className="min-w-0 truncate font-semibold text-[var(--cs-ink)] hover:text-[var(--cs-link)] hover:underline" href={`/sa/${subAccountId}/energetic-decoder/reports/${d.id}`}>
                    {d.title}
                  </Link>
                  <div className="col-start-1 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--cs-subtle)] @min-[760px]/rdlib:contents">
                    <StatusPill status={d.status ?? "draft"} />
                    <span className="truncate @min-[760px]/rdlib:text-[var(--cs-body)]">
                      <span className="@min-[760px]/rdlib:hidden">Content set: </span>
                      {setName(d)}
                    </span>
                    <span className="tabular-nums @min-[760px]/rdlib:text-[var(--cs-body)]">
                      {d.pages.length}
                      <span className="@min-[760px]/rdlib:hidden"> {d.pages.length === 1 ? "page" : "pages"}</span>
                    </span>
                    <span className="text-xs">{formatRelativeTime(d.updatedAt ? new Date(d.updatedAt) : null)}</span>
                  </div>
                  <div className="col-start-2 row-span-2 row-start-1 flex items-center justify-end gap-0.5 @min-[760px]/rdlib:col-start-auto @min-[760px]/rdlib:row-span-1 @min-[760px]/rdlib:row-start-auto">
                    <button type="button" title="Rename" aria-label={`Rename ${d.title}`} className="rounded-md p-2 text-[var(--cs-subtle)] hover:bg-[var(--cs-tint)] hover:text-[var(--cs-link)]" onClick={() => { setRenaming(d); setRenameValue(d.title); }}>
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" title="Duplicate" aria-label={`Duplicate ${d.title}`} className="rounded-md p-2 text-[var(--cs-subtle)] hover:bg-[var(--cs-tint)] hover:text-[var(--cs-link)]" onClick={() => duplicate(d.id)}>
                      <Copy className="size-4" />
                    </button>
                    <button type="button" title="Delete" aria-label={`Delete ${d.title}`} className="rounded-md p-2 text-[var(--cs-subtle)] hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(d.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {shownDesigns && shownDesigns.length > 0 && (
          <p className="mt-4 text-sm text-[var(--cs-body)]" data-library-range>
            Showing {shownDesigns.length} of {designs?.length ?? 0} report design{(designs?.length ?? 0) === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`${CS_SCOPE} sm:max-w-lg`}>
          <DialogHeader>
            <DialogTitle>New Report Design</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rd-new-title">Report Design name</Label>
              <Input id="rd-new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Energetic Blueprint" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd-new-set">Content Set</Label>
              <OptionSelect id="rd-new-set" value={contentSetId} onChange={(v) => v && setContentSetId(v)} options={sets.map((s) => ({ value: s.id, label: `${s.name}${s.isDefault ? " (built-in)" : ""}` }))} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd-new-size">Page size</Label>
              <OptionSelect id="rd-new-size" value={pageSize} onChange={(v) => v && setPageSize(v)} options={PAGE_SIZE_OPTIONS} className="w-full" />
            </div>
            <Button onClick={create} disabled={creating} className="w-full">
              {creating ? "Creating…" : "Create & open canvas"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={renaming !== null} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent className={`${CS_SCOPE} sm:max-w-md`}>
          <DialogHeader>
            <DialogTitle>Rename Report Design</DialogTitle>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label="Report design name" />
          <Button onClick={saveRename}>Save</Button>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </DecoderEditorialPage>
  );
}
